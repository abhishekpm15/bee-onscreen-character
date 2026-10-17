// Buzzy chat relay: pairs two extension users by a shared room code,
// tells each when the other comes online/offline, and forwards messages.
const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8080;
const MAX_PEERS = 2; // first version: exactly two people per room
const MAX_TEXT = 500;
const MAX_PENDING = 50; // messages held per room while the friend is offline

// room code -> { clients: Map<clientId, { ws, name }>, pending: [{ fromId, from, text, ts }] }
const rooms = new Map();

const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("Buzzy chat server is running\n");
});
const wss = new WebSocketServer({ server, maxPayload: 8 * 1024 });

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function others(room, clientId) {
  return [...room.clients].filter(([id]) => id !== clientId).map(([, c]) => c);
}

// peers that can actually receive right now (not mid-close)
function reachable(room, clientId) {
  return others(room, clientId).filter((c) => c.ws.readyState === c.ws.OPEN);
}

wss.on("connection", (ws) => {
  let room = null;
  let roomCode = null;
  let clientId = null;
  let name = null;

  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));

  // remove this socket from its room and tell the friend; safe to call twice
  function leave() {
    if (!room || room.clients.get(clientId)?.ws !== ws) return; // replaced by a newer socket
    room.clients.delete(clientId);
    for (const c of others(room, clientId)) send(c.ws, { type: "presence", online: false, name });
    if (!room.clients.size && !room.pending.length) rooms.delete(roomCode);
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
      if (room) return;
      const code = String(msg.room || "").trim().slice(0, 64);
      const id = String(msg.clientId || "").slice(0, 64);
      if (!code || !id) {
        send(ws, { type: "error", error: "bad-hello" });
        return ws.close(1008, "bad hello");
      }

      let r = rooms.get(code);
      if (!r) rooms.set(code, (r = { clients: new Map(), pending: [] }));

      const existing = r.clients.get(id);
      if (!existing && r.clients.size >= MAX_PEERS) {
        send(ws, { type: "error", error: "room-full" });
        return ws.close(1008, "room full");
      }
      // same browser reconnecting: drop its stale socket quietly
      if (existing) existing.ws.close(4000, "replaced");

      room = r;
      roomCode = code;
      clientId = id;
      name = String(msg.name || "").trim().slice(0, 40) || "Friend";
      r.clients.set(id, { ws, name });

      send(ws, { type: "welcome", peers: others(r, id).map((c) => ({ name: c.name })) });
      if (!existing) {
        for (const c of others(r, id)) send(c.ws, { type: "presence", online: true, name });
      }

      // deliver anything the friend sent while we were offline
      const forMe = r.pending.filter((p) => p.fromId !== id);
      r.pending = r.pending.filter((p) => p.fromId === id);
      if (forMe.length) {
        send(ws, { type: "backlog", messages: forMe.map(({ from, text, ts }) => ({ from, text, ts })) });
      }
      return;
    }

    if (!room) return;

    // client is going offline on purpose (bee turned off): update presence now
    // rather than waiting for the close handshake, so nothing is sent into a closing socket
    if (msg.type === "bye") {
      leave();
      return ws.close(1000, "bye");
    }

    if (msg.type === "msg") {
      const text = String(msg.text || "").trim().slice(0, MAX_TEXT);
      if (!text) return;
      const out = { type: "msg", from: name, text, ts: Date.now() };
      const peers = reachable(room, clientId);
      for (const c of peers) send(c.ws, out);
      if (!peers.length) {
        room.pending.push({ fromId: clientId, from: name, text, ts: out.ts });
        if (room.pending.length > MAX_PENDING) room.pending.shift();
      }
      send(ws, { type: "ack", id: msg.id, delivered: peers.length > 0 });
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
