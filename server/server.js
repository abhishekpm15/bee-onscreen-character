// Buzzy chat relay: every browser has a permanent bee code (derived from its
// secret client id) and a small circle of friends' codes. Two people can only
// see each other online and exchange messages once BOTH have added each other,
// so someone who merely knows your code gets nothing. Messages are held while
// the friend is offline, or until they add you back.
const http = require("http");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8080;
const MAX_TEXT = 500;
const MAX_FRIENDS = 3; // must match MAX_FRIENDS in the extension
const MAX_PENDING = 50; // messages held per recipient
const MAX_PENDING_PER_SENDER = 10; // so one sender can't push out everyone else's messages
const MAX_PENDING_INBOXES = 5000; // recipients we hold messages for

// Must match beeCode() in background.js: the public code is a hash of the
// secret client id, so nobody can claim someone else's code.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no look-alike characters
const CODE_RE = /^[a-hjkmnp-z2-9]{10}$/;
function beeCode(clientId) {
  const bytes = crypto.createHash("sha256").update(clientId).digest();
  return [...bytes.subarray(0, 10)].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}

// bee code -> { ws, name, friends: Set<code> }
const users = new Map();
// recipient code -> [{ fromCode, from, text, ts }]
const pending = new Map();

const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("Buzzy chat server is running\n");
});
const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function cleanCodes(list, self) {
  const codes = (Array.isArray(list) ? list : []).map(String).filter((c) => CODE_RE.test(c) && c !== self);
  return new Set(codes.slice(0, MAX_FRIENDS));
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

// hand over held messages from people this user has added; the rest keep waiting
function deliverPending(me, myCode) {
  const box = pending.get(myCode);
  if (!box) return;
  const forMe = box.filter((p) => me.friends.has(p.fromCode));
  const rest = box.filter((p) => !me.friends.has(p.fromCode));
  if (rest.length) pending.set(myCode, rest);
  else pending.delete(myCode);
  if (forMe.length) {
    send(me.ws, {
      type: "backlog",
      messages: forMe.map(({ fromCode, from, text, ts }) => ({ fromCode, from, text, ts })),
    });
  }
}

function hold(to, entry) {
  let box = pending.get(to);
  if (!box) {
    if (pending.size >= MAX_PENDING_INBOXES) pending.delete(pending.keys().next().value); // oldest inbox
    pending.set(to, (box = []));
  }
  const fromSender = box.filter((p) => p.fromCode === entry.fromCode);
  if (fromSender.length >= MAX_PENDING_PER_SENDER) box.splice(box.indexOf(fromSender[0]), 1);
  box.push(entry);
  if (box.length > MAX_PENDING) box.shift();
}

wss.on("connection", (ws) => {
  let code = null;
  let me = null;

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

    if (msg.type === "ping") return send(ws, { type: "pong" });

    if (msg.type === "hello") {
      if (me) return;
      const id = String(msg.clientId || "").slice(0, 64);
      if (!id) {
        send(ws, { type: "error", error: "bad-hello" });
        return ws.close(1008, "bad hello");
      }
      code = beeCode(id);
      const existing = users.get(code);
      // same browser reconnecting: drop its stale socket quietly
      if (existing) existing.ws.close(4000, "replaced");

      me = {
        ws,
        name: String(msg.name || "").trim().slice(0, 40) || "Friend",
        friends: cleanCodes(msg.friends, code),
      };
      users.set(code, me);

      send(ws, { type: "welcome", code });
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
      const before = me.friends;
      const removed = [...before].filter((c) => !cleanCodes(msg.friends, code).has(c));
      announce(removed, false); // still mutual at this point, so they hear we're gone
      me.friends = cleanCodes(msg.friends, code);
      announce([...me.friends].filter((c) => !before.has(c)), true);
      sendOnlineFriends(me, code);
      deliverPending(me, code); // messages from someone we just added back
      return;
    }

    if (msg.type === "msg") {
      const to = String(msg.to || "");
      const text = String(msg.text || "").trim().slice(0, MAX_TEXT);
      if (!text || !me.friends.has(to)) {
        return send(ws, { type: "ack", id: msg.id, ok: false });
      }
      const out = { type: "msg", fromCode: code, from: me.name, text, ts: Date.now() };
      const friend = mutualOnline(me, code, to);
      // not online, or hasn't added us yet: hold it until they connect / add us.
      // The ack doesn't say which, so a non-friend can't learn when someone is online.
      if (friend) send(friend.ws, out);
      else hold(to, { fromCode: code, from: me.name, text, ts: out.ts });
      send(ws, { type: "ack", id: msg.id, ok: true, delivered: !!friend });
    }
  });

  ws.on("close", leave);
});

// drop connections that silently died (laptop closed, network lost) so presence stays accurate
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

server.listen(PORT, () => console.log(`Buzzy chat server listening on :${PORT}`));
