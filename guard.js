// Runs at document_start, before any page script, so these window capture
// listeners fire ahead of everything the page registers. Events from inside the
// bee's closed shadow root reach the page retargeted to <buzzy-bee-root>; the page
// can't tell someone is typing in the bee and may pull focus back to its own
// inputs (type-anywhere shortcuts, focus traps, click-to-focus editors). Hide
// those events from the page. Default actions (typing, caret, select dropdown)
// still happen; content.js gets key events through onKey instead.
(() => {
  if (window.__buzzyGuard) return;
  const guard = (window.__buzzyGuard = { onKey: null });
  const isBee = (node) => node?.localName === "buzzy-bee-root";

  const fromBee = [
    "keydown", "keyup", "keypress",
    "beforeinput", "input", "compositionstart", "compositionupdate", "compositionend",
    "paste", "copy", "cut",
    "pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend",
    "focusin", "focus",
  ];
  for (const type of fromBee) {
    window.addEventListener(type, (e) => {
      if (!isBee(e.target)) return;
      e.stopImmediatePropagation();
      if (type.startsWith("key")) guard.onKey?.(e);
    }, true);
  }

  // the page's own element losing focus to the bee: pages often refocus it on blur
  for (const type of ["focusout", "blur"]) {
    window.addEventListener(type, (e) => {
      if (isBee(e.relatedTarget)) e.stopImmediatePropagation();
    }, true);
  }
})();
