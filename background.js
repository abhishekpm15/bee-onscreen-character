// Keeps one WebSocket to the chat server for the whole browser while the bee
// is turned on (turning it off disconnects, so the friend sees you go offline),
// and shares connection state with tabs through chrome.storage.local:
//   conn     "disabled" | "unconfigured" | "connecting" | "online" | "offline" | "room-full"
//   peer     { online, name } | null
//   incoming { id, missed, messages: [{ from, text, ts }] }   (latest received batch)

const SERVER_URL = "wss://bee-onscreen-character.onrender.com";
const DEFAULTS = { beeEnabled: false, room: "", name: "" };
const SETTING_KEYS = ["beeEnabled", "room", "name"];

let ws = null;
let connecting = false;
let pingTimer = null;
let retryTimer = null;
let retryDelay = 1000;
const pendingAcks = new Map(); // message id -> reply callback

async function getClientId() {
  let { clientId } = await chrome.storage.local.get("clientId");
  if (!clientId) {
    clientId = crypto.randomUUID();
    await chrome.storage.local.set({ clientId });
  }
  return clientId;
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(connect, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 30000);
}

function failPendingAcks() {
  for (const reply of pendingAcks.values()) reply({ ok: false, reason: "disconnected" });
  pendingAcks.clear();
}

async function connect() {
  if (connecting || (ws && ws.readyState <= WebSocket.OPEN)) return;
  connecting = true;
  try {
    const { beeEnabled, room, name } = await chrome.storage.local.get(DEFAULTS);
    if (!beeEnabled) {
      await chrome.storage.local.set({ conn: "disabled", peer: null });
      return;
    }
    if (!room || !name) {
      await chrome.storage.local.set({ conn: "unconfigured", peer: null });
      return;
    }
    const clientId = await getClientId();
    await chrome.storage.local.set({ conn: "connecting" });

    let sock;
    try {
      sock = new WebSocket(SERVER_URL);
    } catch {
      await chrome.storage.local.set({ conn: "offline", peer: null });
      scheduleRetry();
      return;
    }
    ws = sock;

    sock.onopen = async () => {
      // the bee may have been turned off while this socket was opening
      if (!(await chrome.storage.local.get(DEFAULTS)).beeEnabled) {
        if (ws === sock) ws = null;
        sock.close();
        return;
      }
      retryDelay = 1000;
      sock.send(JSON.stringify({ type: "hello", room, clientId, name }));
      chrome.storage.local.set({ conn: "online" });
      // regular traffic also keeps the MV3 service worker from being suspended
      clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        if (sock.readyState === WebSocket.OPEN) sock.send('{"type":"ping"}');
      }, 20000);
    };

    sock.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      handleServerMessage(msg);
    };

    sock.onclose = (e) => {
      if (ws !== sock) return; // an older socket we already replaced
      ws = null;
      clearInterval(pingTimer);
      failPendingAcks();
      const roomFull = e.code === 1008 && e.reason === "room full";
      chrome.storage.local.set({ conn: roomFull ? "room-full" : "offline", peer: null });
      if (!roomFull && e.code !== 4000) scheduleRetry();
    };
  } finally {
    connecting = false;
  }
}

async function handleServerMessage(msg) {
  switch (msg.type) {
    case "welcome": {
      const p = msg.peers?.[0];
      await chrome.storage.local.set({ peer: p ? { online: true, name: p.name } : { online: false, name: null } });
      break;
    }
    case "presence": {
      await chrome.storage.local.set({ peer: { online: msg.online, name: msg.name } });
      break;
    }
    case "msg": {
      const messages = [{ from: msg.from, text: msg.text, ts: msg.ts }];
      await chrome.storage.local.set({ incoming: { id: crypto.randomUUID(), missed: false, messages } });
      break;
    }
    case "backlog": {
      // everything the friend sent while we were offline, in order
      const messages = (msg.messages || []).map(({ from, text, ts }) => ({ from, text, ts }));
      if (messages.length) {
        await chrome.storage.local.set({ incoming: { id: crypto.randomUUID(), missed: true, messages } });
      }
      break;
    }
    case "ack": {
      pendingAcks.get(msg.id)?.({ ok: true, delivered: msg.delivered });
      pendingAcks.delete(msg.id);
      break;
    }
  }
}

function reconnect() {
  clearTimeout(retryTimer);
  retryDelay = 1000;
  if (ws) {
    const old = ws;
    ws = null; // so its onclose doesn't schedule a retry
    clearInterval(pingTimer);
    if (old.readyState === WebSocket.OPEN) old.send('{"type":"bye"}');
    old.close();
  }
  chrome.storage.local.set({ peer: null });
  connect();
}

// content scripts send typed messages here
chrome.runtime.onMessage.addListener((req, sender, reply) => {
  if (req?.type !== "send") return;
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    reply({ ok: false, reason: "not-connected" });
    connect();
    return;
  }
  const id = crypto.randomUUID();
  const timer = setTimeout(() => {
    pendingAcks.delete(id);
    reply({ ok: false, reason: "timeout" });
  }, 5000);
  pendingAcks.set(id, (res) => {
    clearTimeout(timer);
    reply(res);
  });
  ws.send(JSON.stringify({ type: "msg", id, text: String(req.text).slice(0, 500) }));
  return true; // reply asynchronously
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && SETTING_KEYS.some((k) => k in changes)) reconnect();
});

// Content scripts only load into tabs opened after install, so inject the bee
// into tabs that were already open. content.js guards against double-loading.
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  for (const tab of tabs) {
    chrome.scripting
      .executeScript({ target: { tabId: tab.id }, files: ["bee-art.js", "content.js"] })
      .catch(() => {}); // restricted pages (Web Store, etc.) can't be scripted
  }
});

// wake periodically in case the service worker was suspended and the socket dropped
chrome.alarms.create("keepalive", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "keepalive") connect();
});
chrome.runtime.onStartup.addListener(connect);
connect();
