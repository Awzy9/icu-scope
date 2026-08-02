(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Generic collapsible panels. The page has grown to a dozen sections
  // (patient, dashboard, settings, results, explanation, lung, waveforms,
  // weaning, alarms, CXR, ultrasound, cases) — some of it, like the lab
  // panel or the full settings block, a learner may want out of the way
  // once they've set up a scenario. This wires a collapse toggle onto
  // every top-level panel and onto the ABG/Labs sub-blocks specifically,
  // with the collapsed set persisted in localStorage.
  //
  // No per-panel special-casing: every .sim-panel and .pt-result-block in
  // this markup puts its header/title as the FIRST child element, so the
  // same code collapses all of them by hiding every sibling after that
  // first child. A panel added later needs no changes here to participate.
  // ---------------------------------------------------------------------

  const STORAGE_KEY = "mvsim-collapsed-panels";

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
  }

  function loadCollapsed() {
    try {
      const saved = JSON.parse(storageGet(STORAGE_KEY));
      if (Array.isArray(saved)) return new Set(saved);
    } catch (e) { /* corrupt or absent — start empty */ }
    return new Set();
  }

  const collapsed = loadCollapsed();

  function persist() {
    storageSet(STORAGE_KEY, JSON.stringify(Array.from(collapsed)));
  }

  function addToggle(container, storageId, label) {
    const header = container.firstElementChild;
    if (!header) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "panel-toggle-btn";
    btn.innerHTML = '<span class="chevron" aria-hidden="true">▾</span>';
    header.appendChild(btn);

    function apply(isCollapsed) {
      container.classList.toggle("is-collapsed", isCollapsed);
      btn.setAttribute("aria-expanded", String(!isCollapsed));
      btn.setAttribute("aria-label", `${isCollapsed ? "Expand" : "Collapse"} ${label}`);
    }
    apply(collapsed.has(storageId));

    btn.addEventListener("click", () => {
      const nowCollapsed = !container.classList.contains("is-collapsed");
      apply(nowCollapsed);
      if (nowCollapsed) collapsed.add(storageId); else collapsed.delete(storageId);
      persist();
    });
  }

  function labelFor(el, fallback) {
    const t = el.textContent && el.textContent.trim();
    return t || fallback;
  }

  function init() {
    document.querySelectorAll(".sim-panel[id]").forEach((panel) => {
      const label = panel.getAttribute("aria-label") || labelFor(panel.querySelector("h2"), panel.id);
      addToggle(panel, `panel:${panel.id}`, label);
    });
    document.querySelectorAll(".pt-result-block[id]").forEach((block) => {
      const label = labelFor(block.querySelector("h3"), block.id);
      addToggle(block, `block:${block.id}`, label);
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
