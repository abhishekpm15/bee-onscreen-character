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
  <circle cx="89" cy="11" r="5" fill="#3b2a14"/>
  <circle cx="129" cy="17" r="5" fill="#3b2a14"/>

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

.bee-input {
  position: absolute;
  bottom: calc(100% + 6px);
  z-index: 1;
  left: 0;
  width: 220px;
  box-sizing: border-box;
  padding: 8px 12px;
  border: 2.5px solid #3b2a14;
  border-radius: 14px;
  background: #fffaf0;
  color: #3b2a14;
  font: 14px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif;
  outline: none;
  box-shadow: 0 4px 10px rgba(0,0,0,0.18);
  cursor: text;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: translateY(6px);
  transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s;
}
.bee-input.below { bottom: auto; top: calc(100% + 6px); }
.bee-input::placeholder { color: #a08b6c; }
.bee-input:focus { border-color: #e0a800; box-shadow: 0 0 0 3px rgba(255,194,26,0.4), 0 4px 10px rgba(0,0,0,0.18); }
.bee.open .bee-input { opacity: 1; visibility: visible; pointer-events: auto; transform: none; }
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

  function createBee() {
    host = document.createElement("buzzy-bee-root");
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>${STYLE}</style>
      <div class="bee">
        <input class="bee-input" type="text" placeholder="Say something to Buzzy…" maxlength="200" autocomplete="off" spellcheck="false">
        <div class="bee-spin-wrap"><div class="bee-bob"><div class="bee-flip">${BEE_SVG}</div></div></div>
      </div>`;
    document.documentElement.appendChild(host);

    const bee = root.querySelector(".bee");
    const flip = root.querySelector(".bee-flip");
    const spinWrap = root.querySelector(".bee-spin-wrap");
    const input = root.querySelector(".bee-input");
    const INPUT_W = 220;
    const INPUT_H = 40;
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

    function placeInput() {
      // keep the input fully on screen: flip below the bee near the top edge,
      // and shift sideways near the left/right edges
      input.classList.toggle("below", pos.y < INPUT_H + 8);
      const left = Math.min(Math.max((w - INPUT_W) / 2, 8 - pos.x), window.innerWidth - 8 - pos.x - INPUT_W);
      input.style.left = `${left}px`;
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
      placeInput();
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

    spinWrap.addEventListener("click", () => {
      spinWrap.classList.remove("bee-spin");
      void spinWrap.offsetWidth; // restart animation
      spinWrap.classList.add("bee-spin");
      input.focus({ preventScroll: true });
    });
  }

  function removeBee() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    host?.remove();
    host = null;
  }

  function apply(enabled) {
    if (enabled && !host) createBee();
    else if (!enabled && host) removeBee();
  }

  chrome.storage.local.get({ beeEnabled: false }, ({ beeEnabled }) => apply(beeEnabled));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && "beeEnabled" in changes) apply(changes.beeEnabled.newValue);
  });
})();
