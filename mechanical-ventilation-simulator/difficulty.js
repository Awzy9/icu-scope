(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Learner level: gates how much guidance the page volunteers, without
  // touching what the underlying monitor/alarms show. The distinction
  // matters — a real consultant still sees a high plateau-pressure alarm
  // at the bedside; what they don't get is a tutor explaining why it
  // matters or what to do about it. So warnings, alerts, and evidence
  // citations stay visible at every level; the things gated are the
  // TUTORING layers: the physiology explanation panel, itemized failure
  // reasons in clinical cases, interpretive labels on RSBI/NIF, framework
  // reminder text in alarms, and the course log's reasoning sentence.
  //
  // Four levels, matching the vision doc: beginner (full guidance) <
  // resident (limited hints) < fellow (minimal guidance) < consultant
  // (no hints). CSS handles simple show/hide via [data-difficulty] on
  // <html>; modules that need to change WHAT they render (not just
  // whether) call MVSIM_DIFFICULTY.atLeast() directly — cases.js,
  // weaning.js, alarms.js, progression.js.
  // ---------------------------------------------------------------------

  const LEVELS = ["beginner", "resident", "fellow", "consultant"];
  const STORAGE_KEY = "mvsim-difficulty";

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
  }

  function current() {
    const attr = document.documentElement.getAttribute("data-difficulty");
    return LEVELS.includes(attr) ? attr : "beginner";
  }

  function atLeast(level) {
    return LEVELS.indexOf(current()) >= LEVELS.indexOf(level);
  }

  function apply(level) {
    document.documentElement.setAttribute("data-difficulty", level);
    storageSet(STORAGE_KEY, level);
    const select = document.getElementById("difficulty-select");
    if (select) select.value = level;
    // CSS-gated content (.guidance-only/.gated-note) updates itself the
    // instant the attribute changes — no JS needed. But content whose
    // MARKUP differs by level (the beginner suggestions list, weaning's
    // interpretive labels) needs an explicit re-render to update
    // immediately rather than waiting for the next slider nudge.
    if (window.MVSIM && window.MVSIM.rerender) window.MVSIM.rerender();
    if (typeof window.onDifficultyChange === "function") window.onDifficultyChange(level);
  }

  function init() {
    const select = document.getElementById("difficulty-select");
    // The <head> inline script already set data-difficulty before paint
    // (avoiding a flash of over- or under-guided content); just sync the
    // select to match it now that the DOM exists.
    if (select) {
      select.value = current();
      select.addEventListener("change", () => apply(select.value));
    }
  }

  window.MVSIM_DIFFICULTY = { current, atLeast, LEVELS };
  document.addEventListener("DOMContentLoaded", init);
})();
