// Buzzy chat relay: every browser has a permanent bee code (derived from its
// secret client id), tells the server which friends' codes it wants to hear
// about, and sends messages addressed to a friend's code. The server reports
// friends coming online/offline and holds messages for friends who are offline.
const http = require("http");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8080;
const MAX_TEXT = 500;
const MAX_PENDING = 50; // messages held per recipient while they're offline
const MAX_PENDING_INBOXES = 5000; // offline recipients we hold messages for
const MAX_FRIENDS = 200;

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

function cleanCodes(list) {
  return new Set((Array.isArray(list) ? list : []).map(String).filter((c) => CODE_RE.test(c)).slice(0, MAX_FRIENDS));
}

// online users who have `code` in their friends list
function watchers(code) {
  return [...users].filter(([c, u]) => c !== code && u.friends.has(code)).map(([, u]) => u);
}

function reachable(code) {
  const u = users.get(code);
  return u && u.ws.readyState === u.ws.OPEN ? u : null;
}

// tell this user which of its friends are online right now
function sendOnlineFriends(ws, friends) {
  const online = [...friends].map((c) => [c, reachable(c)]).filter(([, u]) => u);
  send(ws, { type: "online", friends: online.map(([code, u]) => ({ code, name: u.name })) });
}

wss.on("connection", (ws) => {
  let code = null;
  let me = null;

  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));

  // remove this socket and tell its watchers; safe to call twice
  function leave() {
    if (!me || users.get(code) !== me) return; // replaced by a newer socket
    users.delete(code);
    for (const w of watchers(code)) send(w.ws, { type: "presence", code, online: false, name: me.name });
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
        friends: cleanCodes(msg.friends),
      };
      users.set(code, me);

      send(ws, { type: "welcome", code });
      sendOnlineFriends(ws, me.friends);
      // friends see us come online (again, if our name changed on reconnect)
      for (const w of watchers(code)) send(w.ws, { type: "presence", code, online: true, name: me.name });

      // deliver anything sent to us while we were offline
      const forMe = pending.get(code);
      pending.delete(code);
      if (forMe?.length) {
        send(ws, {
          type: "backlog",
          messages: forMe.map(({ fromCode, from, text, ts }) => ({ fromCode, from, text, ts })),
        });
      }
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
      me.friends = cleanCodes(msg.friends);
      return sendOnlineFriends(ws, me.friends);
    }

    if (msg.type === "msg") {
      const to = String(msg.to || "");
      const text = String(msg.text || "").trim().slice(0, MAX_TEXT);
      if (!text || !CODE_RE.test(to) || to === code) {
        return send(ws, { type: "ack", id: msg.id, ok: false });
      }
      const out = { type: "msg", fromCode: code, from: me.name, text, ts: Date.now() };
      const friend = reachable(to);
      if (friend) {
        send(friend.ws, out);
      } else {
        let box = pending.get(to);
        if (!box) {
          if (pending.size >= MAX_PENDING_INBOXES) pending.delete(pending.keys().next().value); // oldest inbox
          pending.set(to, (box = []));
        }
        box.push({ fromCode: code, from: me.name, text, ts: out.ts });
        if (box.length > MAX_PENDING) box.shift();
      }
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
