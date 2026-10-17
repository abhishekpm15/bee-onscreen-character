(() => {
  if (window.__buzzyBeeLoaded) return;
  window.__buzzyBeeLoaded = true;

  const SIZE = 110; // rendered bee width in px

  const BEE_SVG = `
<svg class="bee-svg" viewBox="0 0 140 110" width="${SIZE}" height="${SIZE * 110 / 140}" aria-hidden="true">
  <defs>
    <clipPath id="buzzy-body-clip">
      <ellipse cx="62" cy="66" rx="36" ry="28"/>
    </clipPath>
  </defs>

  <!-- back wing -->
  <g class="wing wing-back">
    <ellipse cx="58" cy="22" rx="17" ry="26" transform="rotate(-28 58 22)"
      fill="#cdeeff" fill-opacity="0.75" stroke="#3b2a14" stroke-width="3"/>
  </g>

  <!-- stinger -->
  <path d="M28 64 L10 70 L28 76 Z" fill="#3b2a14" stroke="#3b2a14" stroke-width="3" stroke-linejoin="round"/>

  <!-- legs -->
  <g stroke="#3b2a14" stroke-width="4" stroke-linecap="round" fill="none">
    <path class="leg leg-1" d="M50 92 q-2 8 -7 10"/>
    <path class="leg leg-2" d="M66 93 q0 8 -4 11"/>
    <path class="leg leg-3" d="M80 90 q2 8 -1 12"/>
  </g>

  <!-- body -->
  <ellipse cx="62" cy="66" rx="36" ry="28" fill="#ffd23f"/>
  <g clip-path="url(#buzzy-body-clip)" fill="#3b2a14">
    <rect x="38" y="30" width="11" height="72" rx="4"/>
    <rect x="60" y="30" width="11" height="72" rx="4"/>
  </g>
  <ellipse cx="60" cy="54" rx="20" ry="7" fill="#fff" fill-opacity="0.35"/>
  <ellipse cx="62" cy="66" rx="36" ry="28" fill="none" stroke="#3b2a14" stroke-width="3.5"/>

  <!-- antennae -->
  <g stroke="#3b2a14" stroke-width="3.5" stroke-linecap="round" fill="none">
    <path d="M102 34 q-2 -16 -12 -22"/>
    <path d="M110 36 q6 -15 18 -18"/>
  </g>
  <circle class="antenna-tip" cx="89" cy="11" r="5" fill="#3b2a14"/>
  <circle class="antenna-tip" cx="129" cy="17" r="5" fill="#3b2a14"/>

  <!-- head -->
  <circle cx="106" cy="58" r="24" fill="#ffd23f" stroke="#3b2a14" stroke-width="3.5"/>

  <!-- eye -->
  <g class="eye">
    <ellipse cx="113" cy="52" rx="8" ry="10" fill="#fff" stroke="#3b2a14" stroke-width="2.5"/>
    <ellipse cx="115" cy="54" rx="5" ry="6.5" fill="#1d140a"/>
    <circle cx="117" cy="51" r="2" fill="#fff"/>
  </g>
  <ellipse class="eyelid" cx="113" cy="52" rx="8.5" ry="10.5" fill="#ffd23f" stroke="#3b2a14" stroke-width="2.5"/>

  <!-- cheek + smile -->
  <ellipse cx="104" cy="68" rx="6" ry="4" fill="#ff8fa3" fill-opacity="0.8"/>
  <path d="M112 68 q6 7 13 1" stroke="#3b2a14" stroke-width="3" stroke-linecap="round" fill="none"/>

  <!-- front wing -->
  <g class="wing wing-front">
    <ellipse cx="72" cy="24" rx="19" ry="29" transform="rotate(18 72 24)"
      fill="#e3f6ff" fill-opacity="0.85" stroke="#3b2a14" stroke-width="3"/>
    <path d="M70 12 q4 10 2 22" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.9"/>
  </g>
</svg>`;

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

.antenna-tip { transition: fill 0.3s; }
.bee.peer-online .antenna-tip { fill: #2ecc71; animation: glow 1.6s ease-in-out infinite; }

.bee.open .bee-bob { animation-play-state: paused; }

.bee-flip { transition: transform 0.35s ease; }
.bee-flip.left { transform: scaleX(-1); }
.bee-bob { animation: bob 1.4s ease-in-out infinite; }
.bee-spin { animation: spin 0.7s ease-in-out; }
.bee-svg { display: block; overflow: visible; }

.wing { transform-box: fill-box; animation: flap 0.09s ease-in-out infinite alternate; }
.wing-back  { transform-origin: 70% 95%; animation-delay: -0.045s; }
.wing-front { transform-origin: 20% 95%; }

.eyelid { transform-box: fill-box; transform-origin: 50% 0%; transform: scaleY(0); animation: blink 4s infinite; }

.leg { animation: wiggle 0.6s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: 50% 0%; }
.leg-2 { animation-delay: -0.2s; }
.leg-3 { animation-delay: -0.4s; }

@keyframes flap {
  from { transform: rotate(-14deg) scaleY(1); }
  to   { transform: rotate(16deg) scaleY(0.55); }
}
@keyframes bob {
  0%, 100% { transform: translateY(-6px) rotate(-3deg); }
  50%      { transform: translateY(6px) rotate(3deg); }
}
@keyframes blink {
  0%, 92%, 100% { transform: scaleY(0); }
  95%           { transform: scaleY(1); }
}
@keyframes wiggle {
  from { transform: rotate(-12deg); }
  to   { transform: rotate(12deg); }
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
@keyframes glow {
  0%, 100% { filter: drop-shadow(0 0 1px #2ecc71); }
  50%      { filter: drop-shadow(0 0 6px #2ecc71); }
}
@keyframes spin {
  0%   { transform: rotate(0) scale(1); }
  50%  { transform: rotate(180deg) scale(1.25); }
  100% { transform: rotate(360deg) scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .bee-bob { animation-duration: 3s; }
}`;

  let host = null;
  let rafId = null;
  let ui = null; // chat hooks returned by createBee
  const chat = { conn: "unconfigured", peer: null };

  function createBee() {
    host = document.createElement("buzzy-bee-root");
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>${STYLE}</style>
      <div class="bee">
        <div class="bee-stack">
          <div class="bee-bubble" role="status"><span class="from"></span><span class="text"></span></div>
          <div class="bee-messages" role="log" title="Click to dismiss"></div>
          <input class="bee-input" type="text" maxlength="500" autocomplete="off">
        </div>
        <div class="bee-spin-wrap"><div class="bee-bob"><div class="bee-flip">${BEE_SVG}</div></div></div>
      </div>`;
    document.documentElement.appendChild(host);

    const bee = root.querySelector(".bee");
    const flip = root.querySelector(".bee-flip");
    const spinWrap = root.querySelector(".bee-spin-wrap");
    const input = root.querySelector(".bee-input");
    const stack = root.querySelector(".bee-stack");
    const bubble = root.querySelector(".bee-bubble");
    const list = root.querySelector(".bee-messages");
    const STACK_W = 240;
    const w = SIZE;
    const h = SIZE * 110 / 140;

    const bounds = () => ({ maxX: window.innerWidth - w, maxY: window.innerHeight - h });
    const randomTarget = () => {
      const { maxX, maxY } = bounds();
      return { x: Math.random() * Math.max(0, maxX), y: Math.random() * Math.max(0, maxY) };
    };

    const { maxX, maxY } = bounds();
    let pos = { x: maxX * 0.8, y: maxY * 0.3 };
    let vel = { x: 0, y: 0 };
    let target = randomTarget();
    let restUntil = 0;
    let facingLeft = false;
    let last = performance.now();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const speed = reducedMotion ? 0.4 : 1;

    let hovering = false;
    let prevFocus = null; // page element that had focus before we grabbed it
    const isOpen = () => hovering || input === root.activeElement;

    function open() {
      bee.classList.add("open");
      vel.x = vel.y = 0;
      if (input !== root.activeElement) {
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
      // keep the input/bubble fully on screen: flip below the bee near the top
      // edge, and shift sideways near the left/right edges
      stack.classList.toggle("below", pos.y < stack.offsetHeight + 8);
      const left = Math.min(Math.max((w - STACK_W) / 2, 8 - pos.x), window.innerWidth - 8 - pos.x - STACK_W);
      stack.style.left = `${left}px`;
    }

    function tick(now) {
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
      pos.y = Math.min(Math.max(pos.y + vel.y * dt, 0), Math.max(0, b.maxY));

      if (vel.x < -0.3 && !facingLeft) { facingLeft = true; flip.classList.add("left"); }
      else if (vel.x > 0.3 && facingLeft) { facingLeft = false; flip.classList.remove("left"); }

      bee.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
      placeStack();
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);

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
        if (!input.value && input === root.activeElement) {
          input.blur();
          prevFocus?.focus?.({ preventScroll: true });
        }
        close();
      }, 250);
    });
    input.addEventListener("blur", close);

    // keep keystrokes from triggering the page's own keyboard shortcuts
    for (const type of ["keydown", "keyup", "keypress"]) {
      input.addEventListener(type, (e) => e.stopPropagation());
    }
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") input.blur();
    });

    function spin() {
      spinWrap.classList.remove("bee-spin");
      void spinWrap.offsetWidth; // restart animation
      spinWrap.classList.add("bee-spin");
    }

    spinWrap.addEventListener("click", () => {
      spin();
      input.focus({ preventScroll: true });
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

  function removeBee() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    host?.remove();
    host = null;
    ui = null;
  }

  function apply(enabled) {
    if (enabled && !host) ui = createBee();
    else if (!enabled && host) removeBee();
  }

  chrome.storage.local.get({ beeEnabled: false, conn: "unconfigured", peer: null }, (s) => {
    chat.conn = s.conn;
    chat.peer = s.peer;
    apply(s.beeEnabled);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if ("conn" in changes || "peer" in changes) {
      const prev = { ...chat };
      if ("conn" in changes) chat.conn = changes.conn.newValue;
      if ("peer" in changes) chat.peer = changes.peer.newValue;
      ui?.onChat(prev);
    }
    if ("incoming" in changes && changes.incoming.newValue) ui?.onIncoming(changes.incoming.newValue);
    if ("beeEnabled" in changes) apply(changes.beeEnabled.newValue);
  });
})();
