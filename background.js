// Keeps one WebSocket to the chat server for the whole browser while the bee
// is turned on (turning it off disconnects, so friends see you go offline),
// and shares connection state with tabs through chrome.storage.local:
//   myCode   this browser's permanent bee code (friends add you with it), as the server made it
//   friends  [{ code, label, name, confirmed }]  label is your nickname for them, name is
//            what they call themselves, confirmed once we've seen they added us back
//   chatTo   code of the friend the bee is messaging
//   conn     "disabled" | "unconfigured" | "connecting" | "online" | "offline" | "outdated"
//   online   { [code]: name }  friends online right now
//   incoming { id, missed, messages: [{ fromCode, from, text, ts }] }   (latest received batch)

const SERVER_URL = "wss://bee-onscreen-character.onrender.com";
const PROTOCOL = 2; // must match PROTOCOL in server/server.js
const CODE_VERSION = 2; // codes made by the server with its secret key
const DEFAULTS = { beeEnabled: false, name: "", friends: [] };
const SETTING_KEYS = ["beeEnabled", "name"];

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

// friends is edited by the popup too; serialize our own read-modify-writes
let friendsQueue = Promise.resolve();
function editFriends(fn) {
  friendsQueue = friendsQueue.then(async () => {
    const { friends = [] } = await chrome.storage.local.get("friends");
    const next = fn(friends.map((f) => ({ ...f })));
    if (next) await chrome.storage.local.set({ friends: next });
  });
  return friendsQueue;
}

// The server only lets two people reach each other once both have added each
// other, so hearing from a friend proves they added us back. Remember that, and
// the name they go by. Codes we never added are ignored, never added for us.
function learnFriend(code, name) {
  return editFriends((friends) => {
    const f = friends.find((x) => x.code === code);
    if (!f || (f.name === name && f.confirmed)) return null;
    f.name = name;
    f.confirmed = true;
    return friends;
  });
}

async function isFriend(code) {
  const { friends = [] } = await chrome.storage.local.get("friends");
  return friends.some((f) => f.code === code);
}

function sendFriends(friends) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "friends", friends: friends.map((f) => f.code) }));
  }
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
    const { beeEnabled, name } = await chrome.storage.local.get(DEFAULTS);
    if (!beeEnabled) {
      await chrome.storage.local.set({ conn: "disabled", online: {} });
      return;
    }
    if (!name) {
      await chrome.storage.local.set({ conn: "unconfigured", online: {} });
      return;
    }
    const clientId = await getClientId();
    await chrome.storage.local.set({ conn: "connecting" });

    let sock;
    try {
      sock = new WebSocket(SERVER_URL);
    } catch {
      await chrome.storage.local.set({ conn: "offline", online: {} });
      scheduleRetry();
      return;
    }
    ws = sock;

    sock.onopen = async () => {
      // the bee may have been turned off while this socket was opening
      const s = await chrome.storage.local.get(DEFAULTS);
      if (!s.beeEnabled) {
        if (ws === sock) ws = null;
        sock.close();
        return;
      }
      retryDelay = 1000;
      sock.send(JSON.stringify({ type: "hello", v: PROTOCOL, clientId, name: s.name, friends: s.friends.map((f) => f.code) }));
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
      // 4001: the server needs a newer Buzzy; retrying won't help until the extension updates
      chrome.storage.local.set({ conn: e.code === 4001 ? "outdated" : "offline", online: {} });
      if (e.code !== 4000 && e.code !== 4001) scheduleRetry();
    };
  } finally {
    connecting = false;
  }
}

// presence updates arrive close together; apply them one at a time
let onlineQueue = Promise.resolve();
function editOnline(fn) {
  onlineQueue = onlineQueue.then(async () => {
    const { online = {} } = await chrome.storage.local.get("online");
    await chrome.storage.local.set({ online: fn({ ...online }) });
  });
}

async function handleServerMessage(msg) {
  switch (msg.type) {
    case "welcome": {
      // the server makes the code from our secret id with its own key; we only display it
      if (msg.code) await chrome.storage.local.set({ myCode: msg.code, codeVersion: CODE_VERSION });
      break;
    }
    case "online": {
      const online = {};
      for (const f of msg.friends || []) {
        online[f.code] = f.name;
        learnFriend(f.code, f.name);
      }
      editOnline(() => online);
      break;
    }
    case "presence": {
      editOnline((online) => {
        if (msg.online) online[msg.code] = msg.name;
        else delete online[msg.code];
        return online;
      });
      learnFriend(msg.code, msg.name);
      break;
    }
    case "msg": {
      if (!(await isFriend(msg.fromCode))) break;
      await learnFriend(msg.fromCode, msg.from);
      const messages = [{ fromCode: msg.fromCode, from: msg.from, text: msg.text, ts: msg.ts }];
      await chrome.storage.local.set({ incoming: { id: crypto.randomUUID(), missed: false, messages } });
      break;
    }
    case "backlog": {
      // everything friends sent while we were offline, in order
      const { friends = [] } = await chrome.storage.local.get("friends");
      const messages = (msg.messages || [])
        .filter((m) => friends.some((f) => f.code === m.fromCode))
        .map(({ fromCode, from, text, ts }) => ({ fromCode, from, text, ts }));
      for (const m of messages) await learnFriend(m.fromCode, m.from);
      if (messages.length) {
        await chrome.storage.local.set({ incoming: { id: crypto.randomUUID(), missed: true, messages } });
      }
      break;
    }
    case "ack": {
      pendingAcks.get(msg.id)?.(msg.ok === false ? { ok: false, reason: "rejected" } : { ok: true, delivered: msg.delivered });
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
  chrome.storage.local.set({ online: {} });
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
  ws.send(JSON.stringify({ type: "msg", id, to: String(req.to), text: String(req.text).slice(0, 500) }));
  return true; // reply asynchronously
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (SETTING_KEYS.some((k) => k in changes)) return reconnect();
  if ("friends" in changes) {
    // only tell the server when the set of codes changed, not on a rename
    const codes = (list) => (list || []).map((f) => f.code).sort().join();
    const { oldValue, newValue = [] } = changes.friends;
    if (codes(oldValue) !== codes(newValue)) {
      sendFriends(newValue);
      // drop anyone just removed from the online list
      const keep = new Set(newValue.map((f) => f.code));
      editOnline((online) => Object.fromEntries(Object.entries(online).filter(([c]) => keep.has(c))));
    }
  }
});

// Content scripts only load into tabs opened after install, so inject the bee
// into tabs that were already open. content.js guards against double-loading.
chrome.runtime.onInstalled.addListener(async ({ reason, previousVersion }) => {
  // room codes from earlier versions are replaced by permanent bee codes
  chrome.storage.local.remove(["room", "peer"]);
  // 2.0 moved code-making to the server, so every code changed: codes saved before
  // belong to nobody now. Start the circle fresh.
  if (reason === "update" && parseInt(previousVersion, 10) < 2) {
    await chrome.storage.local.set({ friends: [], chatTo: "", online: {}, incoming: null });
  }
  // the code may already have arrived from the new server; only drop one made the old way
  const { codeVersion } = await chrome.storage.local.get("codeVersion");
  if (codeVersion !== CODE_VERSION) await chrome.storage.local.remove("myCode");
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  for (const tab of tabs) {
    chrome.scripting
      .executeScript({ target: { tabId: tab.id }, files: ["guard.js", "bee-art.js", "content.js"] })
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
