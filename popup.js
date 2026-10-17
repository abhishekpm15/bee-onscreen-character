const toggle = document.getElementById("toggle");
const status = document.getElementById("status");
const form = document.getElementById("settings");
const nameInput = document.getElementById("name");
const roomInput = document.getElementById("room");
const saveBtn = document.getElementById("save");
const conn = document.getElementById("conn");
const connText = document.getElementById("conn-text");

function render(enabled) {
  toggle.checked = enabled;
  status.textContent = enabled ? "Buzzy is flying around!" : "Buzzy is resting";
}

function renderConn({ conn: state = "unconfigured", peer = null }) {
  const labels = {
    unconfigured: "Not set up",
    connecting: "Connecting…",
    offline: "Can't reach server",
    "room-full": "Room is full",
  };
  let text = labels[state] ?? "Connected";
  let level = state === "offline" || state === "room-full" ? "bad" : state === "online" ? "ok" : "";
  if (state === "online") {
    text = peer?.online ? `${peer.name} is online` : "Friend is offline";
    level = peer?.online ? "live" : "ok";
  }
  connText.textContent = text;
  conn.className = `conn ${level}`;
}

chrome.storage.local.get(
  { beeEnabled: false, name: "", room: "", conn: "unconfigured", peer: null },
  (s) => {
    render(s.beeEnabled);
    nameInput.value = s.name;
    roomInput.value = s.room;
    renderConn(s);
  }
);

// opening the popup counts as reading any messages that arrived while the bee was hidden
chrome.storage.local.set({ unread: 0 });
chrome.action.setBadgeText({ text: "" });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !("conn" in changes || "peer" in changes)) return;
  chrome.storage.local.get({ conn: "unconfigured", peer: null }, renderConn);
});

toggle.addEventListener("change", () => {
  chrome.storage.local.set({ beeEnabled: toggle.checked });
  render(toggle.checked);
});

document.getElementById("gen").addEventListener("click", () => {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"; // no look-alike characters
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  roomInput.value = [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  chrome.storage.local.set({
    name: nameInput.value.trim(),
    room: roomInput.value.trim(),
  });
  saveBtn.textContent = "Saved ✓";
  setTimeout(() => (saveBtn.textContent = "Save & connect"), 1500);
});
