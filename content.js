(() => {
  if (window.__buzzyBeeLoaded) return;
  window.__buzzyBeeLoaded = true;

  const SIZE = 110; // rendered bee width in px

  const HEIGHT = SIZE * 110 / 140;
  const TOP_PAD = 26; // room for hats above the bee's head

  const STYLE = `
:host { all: initial; }
.bee {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 2147483647;
  pointer-events: auto;
  cursor: pointer;
  will-change: transform;
}
.bee-spin-wrap { filter: drop-shadow(0 6px 6px rgba(0,0,0,0.18)); }

.bee-stack {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  z-index: 1;
  width: 240px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  pointer-events: none;
  font: 14px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.bee-stack.below { bottom: auto; top: calc(100% + 6px); flex-direction: column-reverse; }

.bee-input, .bee-bubble {
  box-sizing: border-box;
  width: 100%;
  border: 2.5px solid #3b2a14;
  border-radius: 14px;
  background: #fffaf0;
  color: #3b2a14;
  font: inherit;
  box-shadow: 0 4px 10px rgba(0,0,0,0.18);
  pointer-events: auto;
  animation: pop 0.18s ease-out;
}
.bee-input {
  display: none;
  padding: 8px 12px;
  outline: none;
  cursor: text;
}
.bee-input::placeholder { color: #a08b6c; }
.bee-input:focus { border-color: #e0a800; box-shadow: 0 0 0 3px rgba(255,194,26,0.4), 0 4px 10px rgba(0,0,0,0.18); }
.bee-input.error { border-color: #d64545; animation: shake 0.3s; }
.bee.open .bee-input { display: block; }

.bee-bubble {
  display: none;
  padding: 8px 12px;
  cursor: pointer;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.bee-bubble.show { display: block; }
.bee-bubble.notice { background: #eafbea; border-color: #2f8f46; }
.bee-bubble .from { display: block; font-size: 12px; font-weight: 700; color: #b07d00; }
.bee-bubble.notice .from { color: #2f8f46; }

.bee-messages {
  display: none;
  box-sizing: border-box;
  width: 100%;
  max-height: 240px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 12px;
  border: 2.5px solid #3b2a14;
  border-radius: 14px;
  background: #fffaf0;
  color: #3b2a14;
  box-shadow: 0 4px 10px rgba(0,0,0,0.18);
  pointer-events: auto;
  cursor: pointer;
  animation: pop 0.18s ease-out;
}
.bee-messages.show { display: block; }
.bee-messages .missed {
  margin: 4px 0 2px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #a08b6c;
}
.bee-messages .msg { padding: 6px 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.bee-messages .msg + .msg { border-top: 1px dashed #e6dcc8; }
.bee-messages .meta { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; }
.bee-messages .from { font-weight: 700; color: #b07d00; }
.bee-messages .time { color: #a08b6c; }
.bee-messages .msg.new { animation: pop 0.18s ease-out; }

.bee.open .bee-bob { animation-play-state: paused; }

.bee-flip { transition: transform 0.35s ease; }
.bee-flip.left { transform: scaleX(-1); }
.bee-bob { animation: bob 1.4s ease-in-out infinite; }
.bee-spin { animation: spin 0.7s ease-in-out; }

@keyframes bob {
  0%, 100% { transform: translateY(-6px) rotate(-3deg); }
  50%      { transform: translateY(6px) rotate(3deg); }
}
@keyframes pop {
  from { opacity: 0; transform: translateY(6px) scale(0.96); }
  to   { opacity: 1; transform: none; }
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}
@keyframes spin {
  0%   { transform: rotate(0) scale(1); }
  50%  { transform: rotate(180deg) scale(1.25); }
  100% { transform: rotate(360deg) scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .bee-bob { animation-duration: 3s; }
}`;

  let host = null; // one shadow root holds every bee on the page
  let root = null;
  let rafId = null;
  const bees = []; // bees[0] is the chat bee; the rest just fly around
  const chat = { conn: "unconfigured", peer: null };
  // look + swarm settings, from the popup's Style tab
  const looks = { skin: null, randomOutfits: false, randomSeed: 1 };
  let beeCount = 1;

  // index 0 is the chat bee (input box, messages, online ring); others are companions
  function createBee(index) {
    const main = index === 0;
    const size = main ? SIZE : Math.round(SIZE * 0.8);
    const bee = document.createElement("div");
    bee.className = "bee";
    bee.innerHTML = `
        ${main ? `<div class="bee-stack">
          <div class="bee-bubble" role="status"><span class="from"></span><span class="text"></span></div>
          <div class="bee-messages" role="log" title="Click to dismiss"></div>
          <input class="bee-input" type="text" maxlength="500" autocomplete="off">
        </div>` : ""}
        <div class="bee-spin-wrap"><div class="bee-bob"><div class="bee-flip"></div></div></div>`;
    root.append(bee);

    const flip = bee.querySelector(".bee-flip");
    const spinWrap = bee.querySelector(".bee-spin-wrap");
    const input = bee.querySelector(".bee-input");
    const stack = bee.querySelector(".bee-stack");
    const bubble = bee.querySelector(".bee-bubble");
    const list = bee.querySelector(".bee-messages");
    const STACK_W = 240;
    const w = size;
    const h = size * 110 / 140;

    // each bee bobs on its own rhythm so a swarm doesn't move in lockstep
    bee.querySelector(".bee-bob").style.animationDelay = `${-index * 0.37}s`;

    function setSkin() {
      flip.innerHTML = BuzzyBeeArt.svg(BuzzyBeeArt.skinForBee(index, looks), { width: size, uid: `page-${index}` });
    }
    setSkin();

    const bounds = () => ({ maxX: window.innerWidth - w, maxY: window.innerHeight - h });
    const randomTarget = () => {
      const { maxX, maxY } = bounds();
      return { x: Math.random() * Math.max(0, maxX), y: TOP_PAD + Math.random() * Math.max(0, maxY - TOP_PAD) };
    };

    const { maxX, maxY } = bounds();
    let pos = main ? { x: maxX * 0.8, y: maxY * 0.3 } : randomTarget();
    let vel = { x: 0, y: 0 };
    let target = randomTarget();
    let restUntil = 0;
    let facingLeft = false;
    let last = performance.now();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const speed = reducedMotion ? 0.4 : 1;

    let hovering = false;
    let prevFocus = null; // page element that had focus before we grabbed it
    const isOpen = () => hovering || (main && input === root.activeElement);

    function open() {
      bee.classList.add("open");
      vel.x = vel.y = 0;
      if (main && input !== root.activeElement) {
        prevFocus = document.activeElement;
        input.focus({ preventScroll: true });
      }
    }

    function close() {
      if (isOpen()) return;
      bee.classList.remove("open");
      restUntil = performance.now() + 500; // brief pause before flying off
    }

    function placeStack() {
      if (!main) return;
      // keep the input/bubble fully on screen: flip below the bee near the top
      // edge, and shift sideways near the left/right edges
      stack.classList.toggle("below", pos.y < stack.offsetHeight + 8);
      const left = Math.min(Math.max((w - STACK_W) / 2, 8 - pos.x), window.innerWidth - 8 - pos.x - STACK_W);
      stack.style.left = `${left}px`;
    }

    function step(now) {
      const dt = Math.min(50, now - last) / 16.67; // frames at 60fps
      last = now;

      const dx = target.x - pos.x;
      const dy = target.y - pos.y;
      const dist = Math.hypot(dx, dy);

      if (isOpen()) {
        // stay put while the user is hovering or typing
      } else if (now > restUntil) {
        if (dist < 20) {
          restUntil = now + 600 + Math.random() * 1800; // hover in place a moment
          target = randomTarget();
        } else {
          // steer toward target, with a little wobble
          vel.x += (dx / dist) * 0.12 * speed * dt + (Math.random() - 0.5) * 0.15 * dt;
          vel.y += (dy / dist) * 0.12 * speed * dt + (Math.random() - 0.5) * 0.15 * dt;
        }
      }

      vel.x *= Math.pow(0.95, dt);
      vel.y *= Math.pow(0.95, dt);
      const max = 3.2 * speed;
      const v = Math.hypot(vel.x, vel.y);
      if (v > max) { vel.x = (vel.x / v) * max; vel.y = (vel.y / v) * max; }

      const b = bounds();
      pos.x = Math.min(Math.max(pos.x + vel.x * dt, 0), Math.max(0, b.maxX));
      pos.y = Math.min(Math.max(pos.y + vel.y * dt, TOP_PAD), Math.max(TOP_PAD, b.maxY));

      if (vel.x < -0.3 && !facingLeft) { facingLeft = true; flip.classList.add("left"); }
      else if (vel.x > 0.3 && facingLeft) { facingLeft = false; flip.classList.remove("left"); }

      bee.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
      placeStack();
    }

    let leaveTimer = null;
    bee.addEventListener("mouseenter", () => {
      clearTimeout(leaveTimer);
      hovering = true;
      open();
    });
    bee.addEventListener("mouseleave", () => {
      // short grace period so crossing the gap between bee and input doesn't close it
      leaveTimer = setTimeout(() => {
        hovering = false;
        // nothing typed yet: give focus back to the page and fly on.
        // text in progress: stay open until the user clicks elsewhere.
        if (main && !input.value && input === root.activeElement) {
          input.blur();
          prevFocus?.focus?.({ preventScroll: true });
        }
        close();
      }, 250);
    });
    function spin() {
      spinWrap.classList.remove("bee-spin");
      void spinWrap.offsetWidth; // restart animation
      spinWrap.classList.add("bee-spin");
    }

    spinWrap.addEventListener("click", () => {
      spin();
      if (main) input.focus({ preventScroll: true });
    });

    const remove = () => bee.remove();
    if (!main) return { step, setSkin, remove };

    input.addEventListener("blur", close);

    // keep keystrokes from triggering the page's own keyboard shortcuts
    for (const type of ["keydown", "keyup", "keypress"]) {
      input.addEventListener(type, (e) => e.stopPropagation());
    }
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") input.blur();
    });

    // ---- chat ----

    let bubbleTimer = null;
    function showBubble(from, text, { notice = false, ms = 10000 } = {}) {
      bubble.querySelector(".from").textContent = from;
      bubble.querySelector(".text").textContent = text;
      bubble.classList.toggle("notice", notice);
      bubble.classList.remove("show");
      void bubble.offsetWidth; // replay the pop-in animation
      bubble.classList.add("show");
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(() => bubble.classList.remove("show"), ms);
    }
    bubble.addEventListener("click", (e) => {
      e.stopPropagation();
      bubble.classList.remove("show");
    });

    // received messages pile up in one scrollable list until it's dismissed or times out
    const MAX_SHOWN = 30;
    let listTimer = null;
    const timeFmt = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" });

    function hideList() {
      if (hovering) {
        listTimer = setTimeout(hideList, 2000); // don't vanish while being read
        return;
      }
      list.classList.remove("show");
      list.replaceChildren();
    }

    function addMessages(messages, missed) {
      if (missed) {
        const label = document.createElement("div");
        label.className = "missed";
        label.textContent = "While you were away";
        list.append(label);
      }
      for (const m of messages) {
        const row = document.createElement("div");
        row.className = "msg new";
        const meta = document.createElement("div");
        meta.className = "meta";
        const from = document.createElement("span");
        from.className = "from";
        from.textContent = m.from;
        const time = document.createElement("span");
        time.className = "time";
        time.textContent = timeFmt.format(new Date(m.ts));
        meta.append(from, time);
        const text = document.createElement("div");
        text.textContent = m.text;
        row.append(meta, text);
        list.append(row);
      }
      while (list.querySelectorAll(".msg").length > MAX_SHOWN) list.firstElementChild.remove();
      list.classList.add("show");
      list.scrollTop = list.scrollHeight;

      const count = list.querySelectorAll(".msg").length;
      clearTimeout(listTimer);
      listTimer = setTimeout(hideList, Math.min(60000, 10000 + 4000 * count));
    }

    list.addEventListener("click", (e) => {
      e.stopPropagation();
      clearTimeout(listTimer);
      list.classList.remove("show");
      list.replaceChildren();
    });
    // keep scrolling inside the list from scrolling the page
    list.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });

    function refreshPlaceholder() {
      const { conn, peer } = chat;
      input.placeholder =
        conn === "unconfigured" ? "Set up chat in the Buzzy menu first" :
        conn === "room-full" ? "That room already has two people" :
        conn !== "online" ? "Connecting to chat…" :
        peer?.online ? `Message ${peer.name}…` :
        "Friend is offline — they'll get it later";
    }

    let statusTimer = null;
    function flashStatus(text) {
      input.placeholder = text;
      clearTimeout(statusTimer);
      statusTimer = setTimeout(refreshPlaceholder, 2000);
    }

    function flashError(text) {
      input.classList.remove("error");
      void input.offsetWidth;
      input.classList.add("error");
      setTimeout(() => input.classList.remove("error"), 1500);
      showBubble("Buzzy", text, { ms: 4000 });
    }

    let sending = false;
    async function sendTyped() {
      const text = input.value.trim();
      if (!text || sending) return;
      if (chat.conn !== "online") return flashError(input.placeholder);
      sending = true;
      let res;
      try {
        res = await chrome.runtime.sendMessage({ type: "send", text });
      } catch {
        res = { ok: false, reason: "extension-reloaded" };
      }
      sending = false;
      if (!res?.ok) {
        return flashError(res?.reason === "extension-reloaded"
          ? "Buzzy was updated — refresh this page"
          : "Couldn't send. Try again in a moment.");
      }
      input.value = "";
      flashStatus(res.delivered ? "Sent ✓" : "Saved — it'll arrive when they're online");
    }

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        sendTyped();
      }
    });

    refreshPlaceholder();
    bee.classList.toggle("peer-online", !!chat.peer?.online);

    return {
      step,
      setSkin,
      remove,
      onChat(prev) {
        refreshPlaceholder();
        const online = !!chat.peer?.online;
        bee.classList.toggle("peer-online", online);
        if (online && !prev.peer?.online) {
          showBubble(chat.peer.name, "is online now 👋", { notice: true, ms: 5000 });
          spin();
        }
      },
      onIncoming({ messages, missed }) {
        if (!messages?.length) return;
        addMessages(messages, missed);
        spin();
        // hover in place so the messages are easy to read
        restUntil = performance.now() + Math.min(15000, 4000 + 2000 * messages.length);
      },
    };
  }

  function loop(now) {
    for (const b of bees) b.step(now);
    rafId = requestAnimationFrame(loop);
  }

  // add or remove bees until the page matches the settings
  function sync(enabled) {
    const want = enabled ? Math.min(Math.max(beeCount | 0, 1), BuzzyBeeArt.MAX_BEES) : 0;
    if (want && !host) {
      host = document.createElement("buzzy-bee-root");
      root = host.attachShadow({ mode: "closed" });
      root.innerHTML = `<style>${BuzzyBeeArt.CSS}${STYLE}</style>`;
      document.documentElement.appendChild(host);
      rafId = requestAnimationFrame(loop);
    }
    while (bees.length < want) bees.push(createBee(bees.length));
    while (bees.length > want) bees.pop().remove();
    if (!want && host) {
      cancelAnimationFrame(rafId);
      rafId = null;
      host.remove();
      host = root = null;
    }
  }

  let enabled = false;
  const ui = () => bees[0]; // the chat bee, if any

  const SAVED = {
    beeEnabled: false, beeCount: 1, conn: "unconfigured", peer: null,
    skin: null, randomOutfits: false, randomSeed: 1,
  };
  chrome.storage.local.get(SAVED, (s) => {
    Object.assign(looks, { skin: s.skin, randomOutfits: s.randomOutfits, randomSeed: s.randomSeed });
    beeCount = s.beeCount;
    chat.conn = s.conn;
    chat.peer = s.peer;
    enabled = s.beeEnabled;
    sync(enabled);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if ("conn" in changes || "peer" in changes) {
      const prev = { ...chat };
      if ("conn" in changes) chat.conn = changes.conn.newValue;
      if ("peer" in changes) chat.peer = changes.peer.newValue;
      ui()?.onChat(prev);
    }
    if ("incoming" in changes && changes.incoming.newValue) ui()?.onIncoming(changes.incoming.newValue);
    if (["skin", "randomOutfits", "randomSeed"].some((k) => k in changes)) {
      for (const k of ["skin", "randomOutfits", "randomSeed"]) if (k in changes) looks[k] = changes[k].newValue;
      for (const b of bees) b.setSkin();
    }
    if ("beeCount" in changes) beeCount = changes.beeCount.newValue;
    if ("beeEnabled" in changes) enabled = changes.beeEnabled.newValue;
    if ("beeCount" in changes || "beeEnabled" in changes) sync(enabled);
  });
})();
