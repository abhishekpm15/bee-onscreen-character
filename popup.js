// donation pages on the Donate tab; each option is hidden while its link is empty
const SUPPORT_URL = "https://buymeacoffee.com/pabhishekm";
const RAZORPAY_URL = ""; // Razorpay Payment Page, e.g. https://rzp.io/l/...

const toggle = document.getElementById("toggle");
const status = document.getElementById("status");
const form = document.getElementById("settings");
const nameInput = document.getElementById("name");
const saveBtn = document.getElementById("save");
const conn = document.getElementById("conn");
const connText = document.getElementById("conn-text");
const friendsEl = document.getElementById("friends");
const addForm = document.getElementById("add-friend");
const codeInput = document.getElementById("friend-code");
const labelInput = document.getElementById("friend-label");
const addError = document.getElementById("add-error");

const chat = { conn: "unconfigured", online: {}, friends: [], myCode: "" };

function render(enabled) {
  toggle.checked = enabled;
  status.textContent = enabled ? "Buzzy is flying around!" : "Buzzy is resting";
}

// bee codes are 10 characters; shown as "abcde-fghjk", typed any old way
const CODE_RE = /^[a-hjkmnp-z2-9]{10}$/;
const pretty = (code) => (code ? `${code.slice(0, 5)}-${code.slice(5)}` : "…");
const cleanCode = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
const friendName = (f) => f.label || f.name || "New friend";
const MAX_FRIENDS = 3; // must match server/server.js and content.js

function renderConn() {
  const { conn: state, online } = chat;
  const labels = {
    disabled: "Off — turn on the bee to chat",
    unconfigured: "Enter your name to start",
    connecting: "Connecting…",
    offline: "Can't reach server",
    outdated: "Update Buzzy to keep chatting",
  };
  const live = chat.friends.slice(0, MAX_FRIENDS).filter((f) => f.code in online);
  let text = labels[state] ?? "Connected";
  let level = state === "offline" || state === "outdated" ? "bad" : state === "online" ? "ok" : "";
  if (state === "online") {
    text = live.length === 1 ? `${friendName(live[0])} is online` :
      live.length ? `${live.length} friends online` : "Connected — no friends online";
    level = live.length ? "live" : "ok";
  }
  connText.textContent = text;
  conn.className = `conn ${level}`;
  document.getElementById("tab-dot").hidden = !(state === "online" && live.length);
}

let removing = null; // code of the friend whose removal is waiting for a yes
let focusAfterRender = null;

function confirmRow(f) {
  const li = document.createElement("li");
  li.className = "friend confirm";
  li.innerHTML = `<span class="who"><b></b><small>They won't be able to message you.</small></span>
    <span class="actions"><button type="button" class="cancel">Cancel</button>
    <button type="button" class="danger">Remove</button></span>`;
  li.querySelector("b").textContent = `Are you sure you want to remove ${friendName(f)}?`;
  const cancel = () => {
    removing = null;
    focusAfterRender = f.code;
    renderFriends();
  };
  li.querySelector(".cancel").addEventListener("click", cancel);
  li.querySelector(".danger").addEventListener("click", () => {
    removing = null;
    chrome.storage.local.set({ friends: chat.friends.filter((x) => x.code !== f.code) });
  });
  li.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cancel();
  });
  return li;
}

function renderFriends() {
  friendsEl.replaceChildren();
  if (!chat.friends.some((f) => f.code === removing)) removing = null;
  chat.friends.forEach((f, i) => {
    if (f.code === removing) {
      const li = confirmRow(f);
      friendsEl.append(li);
      if (focusAfterRender === f.code) li.querySelector(".cancel").focus();
      return;
    }
    const li = document.createElement("li");
    li.className = f.code in chat.online ? "friend live" : "friend";
    // friends saved before the limit existed stay listed, but only the first 3 can chat
    if (i >= MAX_FRIENDS) li.classList.add("inactive");
    li.innerHTML = `<span class="dot"></span><span class="who"><b></b><small></small></span>
      <button type="button" title="Remove friend">✕</button>`;
    li.querySelector("b").textContent = friendName(f);
    li.querySelector("small").textContent =
      i >= MAX_FRIENDS ? "Not active — over the 3-friend limit" :
      !f.confirmed ? `⏳ Send them your code to connect · ${pretty(f.code)}` :
      f.label && f.name && f.label !== f.name ? `${f.name} · ${pretty(f.code)}` : pretty(f.code);
    const remove = li.querySelector("button");
    remove.setAttribute("aria-label", `Remove ${friendName(f)}`);
    remove.addEventListener("click", () => {
      removing = f.code;
      focusAfterRender = f.code;
      renderFriends();
    });
    friendsEl.append(li);
    if (focusAfterRender === f.code) remove.focus();
  });
  focusAfterRender = null;
  const full = chat.friends.length >= MAX_FRIENDS;
  document.getElementById("no-friends").hidden = chat.friends.length > 0;
  document.getElementById("circle-full").hidden = !full;
  document.getElementById("circle-count").textContent = `${Math.min(chat.friends.length, MAX_FRIENDS)}/${MAX_FRIENDS}`;
  addForm.hidden = full;
}

function renderChat() {
  // the server makes the code, so there is none until the first connection
  document.getElementById("my-code").textContent = chat.myCode ? pretty(chat.myCode) : "";
  document.getElementById("my-code").hidden = !chat.myCode;
  document.getElementById("no-code").hidden = !!chat.myCode;
  document.getElementById("copy").hidden = !chat.myCode;
  renderConn();
  renderFriends();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const keys = ["conn", "online", "friends", "myCode"].filter((k) => k in changes);
  if (!keys.length) return;
  for (const k of keys) chat[k] = changes[k].newValue ?? (k === "online" ? {} : k === "friends" ? [] : "");
  renderChat();
});

toggle.addEventListener("change", () => {
  chrome.storage.local.set({ beeEnabled: toggle.checked });
  render(toggle.checked);
});

document.getElementById("copy").addEventListener("click", async (e) => {
  if (!chat.myCode) return;
  await navigator.clipboard.writeText(pretty(chat.myCode));
  e.target.textContent = "Copied ✓";
  setTimeout(() => (e.target.textContent = "Copy"), 1500);
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  chrome.storage.local.set({ name: nameInput.value.trim() });
  saveBtn.textContent = "Saved ✓";
  setTimeout(() => (saveBtn.textContent = "Save"), 1500);
});

addForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const code = cleanCode(codeInput.value);
  const label = labelInput.value.trim();
  const fail = (text) => {
    addError.textContent = text;
    addError.hidden = false;
  };
  if (!code) return fail("Paste your friend's bee code first.");
  if (!CODE_RE.test(code)) return fail("That doesn't look like a bee code (10 letters and numbers).");
  if (code === chat.myCode) return fail("That's your own code — share it with a friend instead.");
  const existing = chat.friends.find((f) => f.code === code);
  if (existing && !label) return fail(`${friendName(existing)} is already in your circle.`);
  if (!existing && chat.friends.length >= MAX_FRIENDS) return fail("Your circle is full.");
  addError.hidden = true;
  // adding someone already listed with a nickname just renames them
  const friends = existing
    ? chat.friends.map((f) => (f.code === code ? { ...f, label } : f))
    : [...chat.friends, { code, label, name: "" }];
  chrome.storage.local.set({ friends, chatTo: code });
  codeInput.value = labelInput.value = "";
});
codeInput.addEventListener("input", () => (addError.hidden = true));

// ---- donate ----

const giveRazorpay = document.getElementById("give-razorpay");
const giveBmc = document.getElementById("give-bmc");
if (RAZORPAY_URL) {
  document.getElementById("razorpay-link").href = RAZORPAY_URL;
  giveRazorpay.hidden = false;
}
if (SUPPORT_URL) {
  document.getElementById("bmc-link").href = SUPPORT_URL;
  giveBmc.hidden = false;
}
// people in India see the rupee option first (Chrome may report either name)
const inIndia = ["Asia/Kolkata", "Asia/Calcutta"].includes(Intl.DateTimeFormat().resolvedOptions().timeZone);
if (!inIndia) giveBmc.after(giveRazorpay);
if (!RAZORPAY_URL && !SUPPORT_URL) document.getElementById("tab-donate").remove();

// ---- tabs ----

const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(tab) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute("aria-selected", String(on));
    document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
  }
}
for (const tab of tabs) {
  tab.addEventListener("click", () => {
    selectTab(tab);
    try {
      localStorage.setItem("popupTab", tab.id);
    } catch {}
  });
}
// reopen on the tab that was showing when the popup last closed.
// localStorage is synchronous, so the popup never flashes the wrong tab first
try {
  const saved = document.getElementById(localStorage.getItem("popupTab"));
  if (tabs.includes(saved)) selectTab(saved);
} catch {}

// ---- style ----

const { PRESETS, OPTIONS, DEFAULT_SKIN, MAX_BEES, normalize, skinForBee, svg } = BuzzyBeeArt;
let skin = { ...DEFAULT_SKIN };
const swarm = { beeCount: 1, randomOutfits: false, randomSeed: 1 };

const COLOR_FIELDS = [
  ["body", "Body"],
  ["stripes", "Stripes"],
  ["antenna", "Antenna"],
  ["wings", "Wings"],
  ["hatColor", "Hat"],
  ["outfitColor", "Outfit"],
  ["trailColor", "Trail"],
];
const PART_FIELDS = [
  ["hat", "Hat"],
  ["glasses", "Glasses"],
  ["outfit", "Outfit"],
  ["wingStyle", "Wings"],
  ["pattern", "Pattern"],
  ["trail", "Trail"],
];

// wing/blink animations for the preview bee
const artStyle = document.createElement("style");
artStyle.textContent = BuzzyBeeArt.CSS + BuzzyBeeArt.TRAIL_CSS;
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
  // the chat bee big, companions small, each in the look it will have on the page
  const looks = { skin, ...swarm };
  preview.innerHTML = "";
  for (let i = 0; i < swarm.beeCount; i++) {
    const b = document.createElement("div");
    b.className = i === 0 ? "preview-bee main" : "preview-bee";
    b.style.animationDelay = `${-i * 0.37}s`;
    const width = i === 0 ? (swarm.beeCount > 1 ? 110 : 150) : 58;
    b.innerHTML = svg(skinForBee(i, looks), { width, uid: `preview-${i}` });
    preview.append(b);
  }
  preview.classList.toggle("many", swarm.beeCount > 1);
  previewTrail = document.createElement("div");
  previewTrail.className = "preview-trail";
  preview.append(previewTrail);

  document.getElementById("count").value = swarm.beeCount;
  document.getElementById("count-label").textContent = swarm.beeCount === 1 ? "bee" : "bees";
  document.getElementById("dec").disabled = swarm.beeCount <= 1;
  document.getElementById("inc").disabled = swarm.beeCount >= MAX_BEES;
  document.getElementById("random").checked = swarm.randomOutfits;
  document.getElementById("shuffle").hidden = !swarm.randomOutfits;
  document.getElementById("custom").classList.toggle("locked", swarm.randomOutfits);
  document.getElementById("locked-hint").hidden = !swarm.randomOutfits;

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

// ---- preview trails ----
// the preview bees hover in place, so particles drift left as if they were flying right

let previewTrail = null;
const trailDist = [];
setInterval(() => {
  if (!previewTrail || document.hidden) return;
  const box = preview.getBoundingClientRect();
  const looks = { skin, ...swarm };
  preview.querySelectorAll(".preview-bee svg").forEach((el, i) => {
    const look = skinForBee(i, looks);
    const spacing = BuzzyBeeArt.TRAIL_SPACING[look.trail];
    if (!spacing) return;
    trailDist[i] = (trailDist[i] || 0) + 6;
    if (trailDist[i] < spacing) return;
    trailDist[i] = 0;
    const r = el.getBoundingClientRect();
    const o = BuzzyBeeArt.TRAIL_ORIGIN;
    const scale = r.width / 110;
    BuzzyBeeArt.spawnTrail(previewTrail, look.trail, look.trailColor,
      r.left - box.left + r.width * o.x, r.top - box.top + r.height * o.y,
      { scale, drift: [-50 * scale, 0] });
  });
}, 50);

// ---- swarm ----

function setSwarm(patch) {
  Object.assign(swarm, patch);
  renderStyle();
  chrome.storage.local.set(patch);
}
document.getElementById("dec").addEventListener("click", () => setSwarm({ beeCount: Math.max(1, swarm.beeCount - 1) }));
document.getElementById("inc").addEventListener("click", () => setSwarm({ beeCount: Math.min(MAX_BEES, swarm.beeCount + 1) }));
const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
document.getElementById("random").addEventListener("change", (e) => {
  // a fresh roll each time it's switched on
  setSwarm(e.target.checked ? { randomOutfits: true, randomSeed: newSeed() } : { randomOutfits: false });
});
document.getElementById("shuffle").addEventListener("click", () => setSwarm({ randomSeed: newSeed() }));

// load saved state last, once every element and function above exists
chrome.storage.local.get(
  {
    beeEnabled: false, name: "", conn: "unconfigured", online: {}, friends: [], myCode: "",
    skin: null, beeCount: 1, randomOutfits: false, randomSeed: 1,
  },
  (s) => {
    render(s.beeEnabled);
    skin = BuzzyBeeArt.normalize(s.skin);
    Object.assign(swarm, {
      beeCount: Math.min(Math.max(s.beeCount | 0, 1), MAX_BEES),
      randomOutfits: s.randomOutfits,
      randomSeed: s.randomSeed,
    });
    renderStyle();
    nameInput.value = s.name;
    Object.assign(chat, { conn: s.conn, online: s.online, friends: s.friends, myCode: s.myCode });
    renderChat();
  }
);
