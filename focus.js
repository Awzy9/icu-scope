/* Presentation-only controls; the original evidence pipeline and renderers remain intact. */
(() => {
  const body = document.body;
  body.classList.add("focused-scope");
  const tabs = [...document.querySelectorAll("[data-scope-tab]")];
  const mobileTabs = [...document.querySelectorAll("[data-scope-mobile-tab]")];
  const intro = document.getElementById("scope-focus-intro");
  const archive = document.getElementById("scope-show-archive");
  const advanced = document.getElementById("scope-advanced-filters");
  const descriptions = {
    week:"New critical-care publications from the last seven days. Read the original source before applying findings clinically.",
    guidelines:"New and updated guideline records. Verification of bibliographic metadata is not equivalent to clinical endorsement.",
    trials:"Published clinical trial results, separate from registrations without results."
  };
  function activate(view) {
    if (!descriptions[view]) view = "week";
    body.dataset.scopeView = view;
    if (intro) intro.textContent = descriptions[view];
    tabs.forEach(button => {
      const selected = button.dataset.scopeTab === view;
      button.setAttribute("aria-pressed", String(selected));
    });
    mobileTabs.forEach(button => {
      const selected = button.dataset.scopeMobileTab === view;
      if(selected) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    const sectionId = view === "week" ? "this-week" : view === "guidelines" ? "guideline" : "trial-results";
    const section = document.getElementById(sectionId + "-section");
    const collapse = document.getElementById(sectionId + "-collapse-toggle");
    if (section && collapse && collapse.getAttribute("aria-expanded") === "false") collapse.click();
    if (section) section.scrollIntoView({block:"nearest",behavior:"auto"});
  }
  tabs.forEach(button => button.addEventListener("click", () => activate(button.dataset.scopeTab)));
  mobileTabs.forEach(button => button.addEventListener("click", () => activate(button.dataset.scopeMobileTab)));
  archive?.addEventListener("change", () => body.classList.toggle("scope-archive-open", archive.checked));
  advanced?.addEventListener("change", () => body.classList.toggle("scope-advanced-open", advanced.checked));
  activate("week");
})();
