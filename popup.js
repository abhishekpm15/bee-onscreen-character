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
    disabled: "Off — turn on the bee to chat",
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
  document.getElementById("tab-dot").hidden = !(state === "online" && peer?.online);
}

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

// ---- tabs ----

const tabs = [...document.querySelectorAll('[role="tab"]')];
for (const tab of tabs) {
  tab.addEventListener("click", () => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    }
  });
}

// ---- style ----

const { PRESETS, OPTIONS, DEFAULT_SKIN, normalize, svg } = BuzzyBeeArt;
let skin = { ...DEFAULT_SKIN };

const COLOR_FIELDS = [
  ["body", "Body"],
  ["stripes", "Stripes"],
  ["antenna", "Antenna"],
  ["wings", "Wings"],
  ["hatColor", "Hat"],
  ["outfitColor", "Outfit"],
];
const PART_FIELDS = [
  ["hat", "Hat"],
  ["glasses", "Glasses"],
  ["outfit", "Outfit"],
  ["wingStyle", "Wings"],
  ["pattern", "Pattern"],
];

// wing/blink animations for the preview bee
const artStyle = document.createElement("style");
artStyle.textContent = BuzzyBeeArt.CSS;
document.head.append(artStyle);

const preview = document.getElementById("preview");
const presetsEl = document.getElementById("presets");
const colorsEl = document.getElementById("colors");
const partsEl = document.getElementById("parts");

for (const p of PRESETS) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "preset";
  btn.dataset.id = p.id;
  btn.title = p.name;
  btn.innerHTML = `${svg(p.skin, { width: 52, uid: `preset-${p.id}` })}<span></span>`;
  btn.querySelector("span").textContent = p.name;
  btn.addEventListener("click", () => update({ ...DEFAULT_SKIN, ...p.skin }));
  presetsEl.append(btn);
}

for (const [key, label] of COLOR_FIELDS) {
  const wrap = document.createElement("label");
  wrap.className = "color";
  wrap.innerHTML = `<input type="color" data-key="${key}"><span>${label}</span>`;
  wrap.querySelector("input").addEventListener("input", (e) => update({ ...skin, [key]: e.target.value }));
  colorsEl.append(wrap);
}

for (const [key, label] of PART_FIELDS) {
  const wrap = document.createElement("label");
  wrap.className = "part";
  const select = document.createElement("select");
  select.dataset.key = key;
  for (const [id, name] of OPTIONS[key]) select.add(new Option(name, id));
  select.addEventListener("change", () => update({ ...skin, [key]: select.value }));
  wrap.append(label, select);
  partsEl.append(wrap);
}

document.getElementById("reset").addEventListener("click", () => update({ ...DEFAULT_SKIN }));

function renderStyle() {
  preview.innerHTML = svg(skin, { width: 150, uid: "preview" });
  for (const input of colorsEl.querySelectorAll("input")) input.value = skin[input.dataset.key];
  for (const select of partsEl.querySelectorAll("select")) select.value = skin[select.dataset.key];
  for (const btn of presetsEl.children) {
    const p = PRESETS.find((x) => x.id === btn.dataset.id);
    const full = normalize({ ...DEFAULT_SKIN, ...p.skin });
    btn.setAttribute("aria-pressed", String(Object.keys(full).every((k) => full[k] === skin[k])));
  }
}

// color pickers fire many events while dragging; the preview updates on every one,
// open pages are updated at most every 120ms
let saveTimer = null;
function update(next) {
  skin = normalize(next);
  renderStyle();
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    chrome.storage.local.set({ skin });
  }, 120);
}

// load saved state last, once every element and function above exists
chrome.storage.local.get(
  { beeEnabled: false, name: "", room: "", conn: "unconfigured", peer: null, skin: null },
  (s) => {
    render(s.beeEnabled);
    skin = BuzzyBeeArt.normalize(s.skin);
    renderStyle();
    nameInput.value = s.name;
    roomInput.value = s.room;
    renderConn(s);
  }
);
