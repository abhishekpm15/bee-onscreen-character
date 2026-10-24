// Buzzy chat relay: every browser has a permanent bee code (derived from its
// secret client id with the server's secret key) and a small circle of friends'
// codes. Two people can only see each other online and exchange messages once
// BOTH have added each other, so someone who merely knows your code gets nothing.
// Messages are held while the friend is offline, or until they add you back.
const http = require("http");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8080;
const PROTOCOL = 2; // clients older than this are told to update
const MAX_TEXT = 500;
const MAX_FRIENDS = 3; // must match MAX_FRIENDS in the extension
const MAX_PENDING = 50; // messages held per recipient
const MAX_PENDING_PER_SENDER = 10; // per recipient, so one sender can't push out everyone else's
const MAX_HELD_BY_SENDER = 30; // across all recipients
const MAX_PENDING_INBOXES = 5000; // recipients we hold messages for
const MAX_KNOWN = 100000; // users whose friends list we remember after they leave

// abuse limits
const MAX_CONNECTIONS = 10000;
const MAX_CONNECTIONS_PER_IP = 10;
const MAX_HELLOS_PER_IP_PER_MIN = 20;
const MSG_RATE = { perSec: 2, burst: 10 }; // messages per connection
const FRIENDS_RATE = { perSec: 1 / 6, burst: 10 }; // friends-list updates per connection
const MAX_STRIKES = 20; // rate-limited requests before the connection is dropped

// The code is an HMAC of the client's secret id under SERVER_SECRET. Without the
// key nobody can search offline for an id that produces someone else's code.
const SECRET = process.env.SERVER_SECRET || "";
if (SECRET.length < 32) {
  console.error("SERVER_SECRET must be set to a random string of at least 32 characters.");
  console.error(`Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`);
  process.exit(1);
}

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no look-alike characters
const CODE_RE = /^[a-hjkmnp-z2-9]{10}$/;
const CLIENT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNBIASED = 256 - (256 % ALPHABET.length); // bytes at or above this would favor some letters

function beeCode(clientId) {
  let code = "";
  for (let round = 0; code.length < 10; round++) {
    const bytes = crypto.createHmac("sha256", SECRET).update(`${clientId}:${round}`).digest();
    for (const b of bytes) {
      if (b < UNBIASED && code.length < 10) code += ALPHABET[b % ALPHABET.length];
    }
  }
  return code;
}

// bee code -> { ws, name, friends: Set<code> }
const users = new Map();
// bee code -> Set<code>: each user's circle, remembered after they disconnect so
// messages from people outside it can be refused instead of held
const known = new Map();
// recipient code -> [{ fromCode, from, text, ts }]
const pending = new Map();
// sender code -> number of their messages held across all inboxes
const heldBy = new Map();
// ip -> { open, hellos, windowStart }
const ips = new Map();

const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("Buzzy chat server is running\n");
});

// Render (and most hosts) put the client's address last in X-Forwarded-For
function clientIp(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
  return fwd.length ? fwd[fwd.length - 1] : req.socket.remoteAddress || "unknown";
}

function ipEntry(ip) {
  let e = ips.get(ip);
  if (!e) ips.set(ip, (e = { open: 0, hellos: 0, windowStart: Date.now() }));
  if (Date.now() - e.windowStart > 60000) {
    e.hellos = 0;
    e.windowStart = Date.now();
  }
  return e;
}

const wss = new WebSocketServer({
  server,
  maxPayload: 16 * 1024,
  // Browsers always send Origin: only the extension may connect, not websites.
  // (Non-browser clients can fake this; the per-IP limits cover those.)
  verifyClient: ({ origin, req }, done) => {
    if (origin && !origin.startsWith("chrome-extension://")) return done(false, 403, "Forbidden");
    if (wss.clients.size >= MAX_CONNECTIONS) return done(false, 503, "Busy");
    if (ipEntry(clientIp(req)).open >= MAX_CONNECTIONS_PER_IP) return done(false, 429, "Too many connections");
    done(true);
  },
});

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function cleanCodes(list, self) {
  const codes = (Array.isArray(list) ? list.slice(0, 50) : []).map(String).filter((c) => CODE_RE.test(c) && c !== self);
  return new Set(codes.slice(0, MAX_FRIENDS));
}

function remember(code, friends) {
  known.delete(code); // re-insert so the most recently seen are kept longest
  known.set(code, friends);
  if (known.size > MAX_KNOWN) known.delete(known.keys().next().value);
}

function bucket({ perSec, burst }) {
  let tokens = burst;
  let last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(burst, tokens + ((now - last) / 1000) * perSec);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

function reachable(code) {
  const u = users.get(code);
  return u && u.ws.readyState === u.ws.OPEN ? u : null;
}

// online friend `code` of `me` who has added `me` back, if any
function mutualOnline(me, myCode, code) {
  const u = reachable(code);
  return u && me.friends.has(code) && u.friends.has(myCode) ? u : null;
}

// tell this user which of its (mutual) friends are online right now
function sendOnlineFriends(me, myCode) {
  const online = [...me.friends].map((c) => [c, mutualOnline(me, myCode, c)]).filter(([, u]) => u);
  send(me.ws, { type: "online", friends: online.map(([code, u]) => ({ code, name: u.name })) });
}

// Whether each of `me`'s friends has added `me` back, as far as the server knows
// (a circle is only known once its owner has connected since the last restart).
// Lets the client show "connected" vs "send them your code" truthfully, including
// after a friend removes them, without ever saying "removed".
function sendLinks(me, myCode) {
  const links = {};
  for (const c of me.friends) {
    const circle = known.get(c);
    if (circle) links[c] = circle.has(myCode);
  }
  send(me.ws, { type: "links", links });
}

// `myCode`'s circle went from `before` (undefined if unknown) to `next`: tell everyone
// online who has added `myCode` whether they're in it now
function tellCircleChange(myCode, before, next) {
  for (const [c, u] of users) {
    if (c === myCode || !u.friends.has(myCode)) continue;
    const linked = next.has(c);
    if (before && before.has(c) === linked) continue;
    send(u.ws, { type: "links", links: { [myCode]: linked } });
  }
}

function released(entries) {
  for (const p of entries) {
    const n = (heldBy.get(p.fromCode) || 1) - 1;
    if (n > 0) heldBy.set(p.fromCode, n);
    else heldBy.delete(p.fromCode);
  }
}

function dropInbox(code) {
  const box = pending.get(code);
  if (!box) return;
  released(box);
  pending.delete(code);
}

// hand over held messages from people this user has added; the rest are dropped,
// since we now know they come from outside the circle
function deliverPending(me, myCode) {
  const box = pending.get(myCode);
  if (!box) return;
  const forMe = box.filter((p) => me.friends.has(p.fromCode));
  dropInbox(myCode);
  if (forMe.length) {
    send(me.ws, {
      type: "backlog",
      messages: forMe.map(({ fromCode, from, text, ts }) => ({ fromCode, from, text, ts })),
    });
  }
}

// returns null when held, else why not
function hold(to, entry) {
  // the recipient's circle is known and the sender isn't in it: refuse
  const circle = known.get(to);
  if (circle && !circle.has(entry.fromCode)) return "not-connected";
  if ((heldBy.get(entry.fromCode) || 0) >= MAX_HELD_BY_SENDER) return "full";

  let box = pending.get(to);
  if (!box) {
    if (pending.size >= MAX_PENDING_INBOXES) dropInbox(pending.keys().next().value); // oldest inbox
    pending.set(to, (box = []));
  }
  const fromSender = box.filter((p) => p.fromCode === entry.fromCode);
  if (fromSender.length >= MAX_PENDING_PER_SENDER) released(box.splice(box.indexOf(fromSender[0]), 1));
  box.push(entry);
  heldBy.set(entry.fromCode, (heldBy.get(entry.fromCode) || 0) + 1);
  if (box.length > MAX_PENDING) released([box.shift()]);
  return null;
}

wss.on("connection", (ws, req) => {
  const ip = clientIp(req);
  ipEntry(ip).open++;
  let code = null;
  let me = null;
  let strikes = 0;
  const msgAllowed = bucket(MSG_RATE);
  const friendsAllowed = bucket(FRIENDS_RATE);

  // a rate-limited request: refuse it, and drop clients that keep pushing
  function limited(reply) {
    if (reply) send(ws, reply);
    if (++strikes >= MAX_STRIKES) ws.close(1008, "rate limited");
  }

  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));

  // tell each of these codes, if they're a mutual friend online, whether we're online
  function announce(codes, online) {
    for (const c of codes) {
      const u = mutualOnline(me, code, c);
      if (u) send(u.ws, { type: "presence", code, online, name: me.name });
    }
  }

  // remove this socket and tell its friends; safe to call twice
  function leave() {
    if (!me || users.get(code) !== me) return; // replaced by a newer socket
    users.delete(code);
    for (const c of me.friends) {
      const u = reachable(c);
      if (u && u.friends.has(code)) send(u.ws, { type: "presence", code, online: false, name: me.name });
    }
  }

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "ping") return send(ws, { type: "pong" });

    if (msg.type === "hello") {
      if (me) return;
      if (msg.v !== PROTOCOL) {
        send(ws, { type: "error", error: "update-required" });
        return ws.close(4001, "update required");
      }
      const entry = ipEntry(ip);
      if (++entry.hellos > MAX_HELLOS_PER_IP_PER_MIN) return ws.close(1008, "rate limited");
      const id = String(msg.clientId || "");
      if (!CLIENT_ID_RE.test(id)) {
        send(ws, { type: "error", error: "bad-hello" });
        return ws.close(1008, "bad hello");
      }
      code = beeCode(id.toLowerCase());
      const existing = users.get(code);
      // same browser reconnecting: drop its stale socket quietly
      if (existing) existing.ws.close(4000, "replaced");

      me = {
        ws,
        name: String(msg.name || "").trim().slice(0, 40) || "Friend",
        friends: cleanCodes(msg.friends, code),
      };
      users.set(code, me);
      const before = known.get(code);
      remember(code, me.friends);

      send(ws, { type: "welcome", code });
      sendLinks(me, code);
      tellCircleChange(code, before, me.friends); // the circle may have changed while offline
      sendOnlineFriends(me, code);
      announce(me.friends, true); // (again, if our name changed on reconnect)
      deliverPending(me, code);
      return;
    }

    if (!me) return;

    // client is going offline on purpose (bee turned off): update presence now
    // rather than waiting for the close handshake, so nothing is sent into a closing socket
    if (msg.type === "bye") {
      leave();
      return ws.close(1000, "bye");
    }

    if (msg.type === "friends") {
      if (!friendsAllowed()) return limited();
      const before = me.friends;
      const next = cleanCodes(msg.friends, code);
      announce([...before].filter((c) => !next.has(c)), false); // still mutual here, so they hear we're gone
      me.friends = next;
      remember(code, next);
      tellCircleChange(code, before, next);
      sendLinks(me, code);
      announce([...next].filter((c) => !before.has(c)), true);
      sendOnlineFriends(me, code);
      deliverPending(me, code); // messages from someone we just added back
      return;
    }

    if (msg.type === "msg") {
      const id = typeof msg.id === "string" ? msg.id.slice(0, 64) : null;
      if (!msgAllowed()) return limited({ type: "ack", id, ok: false, reason: "rate-limited" });
      const to = String(msg.to || "");
      const text = String(msg.text || "").trim().slice(0, MAX_TEXT);
      if (!text || !me.friends.has(to)) {
        return send(ws, { type: "ack", id, ok: false });
      }
      const out = { type: "msg", fromCode: code, from: me.name, text, ts: Date.now() };
      const friend = mutualOnline(me, code, to);
      if (friend) {
        send(friend.ws, out);
        return send(ws, { type: "ack", id, ok: true, delivered: true });
      }
      // not online, or not connected: hold it, unless their circle is known and we're
      // not in it. The answer depends only on the circle, never on whether they're
      // online, so it doesn't tell a non-friend when someone is around.
      const refused = hold(to, { fromCode: code, from: me.name, text, ts: out.ts });
      send(ws, refused ? { type: "ack", id, ok: false, reason: refused } : { type: "ack", id, ok: true, delivered: false });
    }
  });

  ws.on("close", () => {
    leave();
    const entry = ips.get(ip);
    if (entry && --entry.open <= 0 && Date.now() - entry.windowStart > 60000) ips.delete(ip);
  });
});

// drop connections that silently died (laptop closed, network lost) so presence stays accurate,
// and forget idle IPs
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
  for (const [ip, e] of ips) if (e.open <= 0 && Date.now() - e.windowStart > 60000) ips.delete(ip);
}, 30000);

server.listen(PORT, () => console.log(`Buzzy chat server listening on :${PORT}`));
