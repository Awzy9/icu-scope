(function () {
  // Set this to your deployed Cloudflare Worker URL to enable the
  // "Ask about this article" feature (see cloudflare-worker/ + README).
  // Left blank, the feature stays hidden — no broken UI for anyone who
  // hasn't set up the Worker.
  const ASK_AI_ENDPOINT = "";

  const nav = document.getElementById("category-nav");
  const content = document.getElementById("content");
  const updatedLine = document.getElementById("updated-line");
  const trendingSection = document.getElementById("trending-section");
  const trendingBody = document.getElementById("trending-body");
  const trendingList = document.getElementById("trending-list");
  const trendingCount = document.getElementById("trending-count");
  const foamedSection = document.getElementById("foamed-section");
  const foamedBody = document.getElementById("foamed-body");
  const foamedList = document.getElementById("foamed-list");
  const foamedCount = document.getElementById("foamed-count");
  const preprintSection = document.getElementById("preprint-section");
  const preprintBody = document.getElementById("preprint-body");
  const preprintList = document.getElementById("preprint-list");
  const preprintCount = document.getElementById("preprint-count");
  const preprintWindow = document.getElementById("preprint-window");
  const trialSection = document.getElementById("trial-section");
  const trialBody = document.getElementById("trial-body");
  const trialList = document.getElementById("trial-list");
  const trialCount = document.getElementById("trial-count");
  const trialWindow = document.getElementById("trial-window");
  const classicsBody = document.getElementById("classics-body");
  const classicsList = document.getElementById("classics-list");
  const guidelineSection = document.getElementById("guideline-section");
  const guidelineBody = document.getElementById("guideline-body");
  const guidelineList = document.getElementById("guideline-list");
  const guidelineCount = document.getElementById("guideline-count");
  const guidelineWindow = document.getElementById("guideline-window");
  const spotlightSection = document.getElementById("spotlight-section");
  const spotlightBody = document.getElementById("spotlight-body");
  const spotlightWeek = document.getElementById("spotlight-week");
  const savedSection = document.getElementById("saved-section");
  const savedBody = document.getElementById("saved-body");
  const savedList = document.getElementById("saved-list");
  const savedCount = document.getElementById("saved-count");
  const savedCountBadge = document.getElementById("saved-count-badge");
  const savedToggle = document.getElementById("saved-toggle");

  const COLLAPSIBLE_SECTIONS = [
    { id: "spotlight", body: spotlightBody, toggle: document.getElementById("spotlight-collapse-toggle") },
    { id: "saved", body: savedBody, toggle: document.getElementById("saved-collapse-toggle") },
    { id: "guideline", body: guidelineBody, toggle: document.getElementById("guideline-collapse-toggle") },
    { id: "trending", body: trendingBody, toggle: document.getElementById("trending-collapse-toggle") },
    { id: "foamed", body: foamedBody, toggle: document.getElementById("foamed-collapse-toggle") },
    { id: "preprint", body: preprintBody, toggle: document.getElementById("preprint-collapse-toggle") },
    { id: "trial", body: trialBody, toggle: document.getElementById("trial-collapse-toggle") },
    { id: "classics", body: classicsBody, toggle: document.getElementById("classics-collapse-toggle") },
  ];
  const themeToggle = document.getElementById("theme-toggle");
  const searchInput = document.getElementById("search-input");
  const windowFilter = document.getElementById("window-filter");
  const studyTypeFilter = document.getElementById("study-type-filter");
  const compactToggle = document.getElementById("compact-toggle");
  const digestBtn = document.getElementById("digest-btn");
  const spotlightPrintBtn = document.getElementById("spotlight-print-btn");
  const backToTopBtn = document.getElementById("back-to-top");
  const sectionJumpNav = document.getElementById("section-jump");
  const sectionJumpClose = document.getElementById("section-jump-close");
  const bottomNav = document.getElementById("bottom-nav");
  const bottomNavBackdrop = document.getElementById("bottom-nav-backdrop");
  const bottomNavTop = document.getElementById("bottom-nav-top");
  const bottomNavTrending = document.getElementById("bottom-nav-trending");
  const bottomNavSaved = document.getElementById("bottom-nav-saved");
  const bottomNavMore = document.getElementById("bottom-nav-more");

  const SECTION_JUMP_TARGETS = [
    { sectionId: "spotlight", label: "Article of the Week", icon: "📌" },
    { sectionId: "saved", label: "Saved", icon: "🔖" },
    { sectionId: "guideline", label: "Guideline Watch", icon: "📋" },
    { sectionId: "trending", label: "Trending this month", icon: "🔥" },
    { sectionId: "foamed", label: "FOAMed & Blogs", icon: "📚" },
    { sectionId: "preprint", label: "Preprints", icon: "🧪" },
    { sectionId: "trial", label: "Trial Tracker", icon: "🔬" },
    { sectionId: "classics", label: "ICU Classics", icon: "🏛️" },
  ];

  const CATEGORY_ICONS = {
    cardiovascular: "❤️",
    respiratory: "🫁",
    neurology: "🧠",
    renal: "🫘",
    "gi-nutrition": "🍽️",
    "endocrine-metabolic": "🧪",
    "infectious-sepsis": "🦠",
    "hematology-coag": "🩸",
    "trauma-surgical": "🚑",
    "procedures-pocus": "🩺",
    pharmacology: "💊",
  };

  const CATEGORY_COLORS = {
    cardiovascular: "#d6336c",
    respiratory: "#1c7ed6",
    neurology: "#7048e8",
    renal: "#c92a2a",
    "gi-nutrition": "#e8590c",
    "endocrine-metabolic": "#0ca678",
    "infectious-sepsis": "#2f9e44",
    "hematology-coag": "#e03131",
    "trauma-surgical": "#f08c00",
    "procedures-pocus": "#1098ad",
    pharmacology: "#9c36b5",
  };

  // Curated once, not part of the daily fetch pipeline. Each links to a
  // PubMed search on the trial's distinctive title rather than a hardcoded
  // PMID, since a mistyped PMID would silently point at the wrong paper.
  const CLASSIC_TRIALS = [
    {
      title: "ARDSNet ARMA: Lower tidal volumes for ARDS",
      journal: "New England Journal of Medicine",
      pubdate: "2000",
      authors: ["ARDS Network"],
      doi: null,
      abstract: "Established that ventilating with 6 mL/kg predicted body weight instead of the traditional 12 mL/kg reduced mortality in acute lung injury/ARDS — the trial that made low tidal volume ventilation standard of care.",
      citation_count: 0,
      is_top_journal: true,
      is_open_access: false,
      study_type: "Landmark Trial",
      url: "https://pubmed.ncbi.nlm.nih.gov/?term=ventilation+lower+tidal+volumes+acute+respiratory+distress+syndrome+network",
    },
    {
      title: "Rivers et al.: Early Goal-Directed Therapy in septic shock",
      journal: "New England Journal of Medicine",
      pubdate: "2001",
      authors: ["Rivers E", "et al."],
      doi: null,
      abstract: "A single-center trial that popularized protocolized hemodynamic resuscitation (EGDT) for early severe sepsis/septic shock. Later multicenter trials (ProCESS, ARISE, ProMISe) failed to reproduce its mortality benefit, but it reshaped a generation of sepsis care.",
      citation_count: 0,
      is_top_journal: true,
      is_open_access: false,
      study_type: "Landmark Trial",
      url: "https://pubmed.ncbi.nlm.nih.gov/?term=early+goal-directed+therapy+treatment+severe+sepsis+septic+shock+rivers",
    },
    {
      title: "NICE-SUGAR: Intensive vs conventional glucose control",
      journal: "New England Journal of Medicine",
      pubdate: "2009",
      authors: ["NICE-SUGAR Study Investigators"],
      doi: null,
      abstract: "Found that tight glycemic control (81-108 mg/dL) increased mortality compared to a more conventional target (<180 mg/dL) in critically ill adults, reversing the prior push toward intensive insulin therapy.",
      citation_count: 0,
      is_top_journal: true,
      is_open_access: false,
      study_type: "Landmark Trial",
      url: "https://pubmed.ncbi.nlm.nih.gov/?term=intensive+versus+conventional+glucose+control+critically+ill+patients+NICE-SUGAR",
    },
    {
      title: "PROSEVA: Prone positioning in severe ARDS",
      journal: "New England Journal of Medicine",
      pubdate: "2013",
      authors: ["Guerin C", "et al."],
      doi: null,
      abstract: "Showed a substantial mortality reduction with early, prolonged prone positioning in severe ARDS, establishing prone ventilation as standard practice for this population.",
      citation_count: 0,
      is_top_journal: true,
      is_open_access: false,
      study_type: "Landmark Trial",
      url: "https://pubmed.ncbi.nlm.nih.gov/?term=prone+positioning+severe+acute+respiratory+distress+syndrome+guerin",
    },
    {
      title: "TTM Trial: Targeted temperature management after cardiac arrest",
      journal: "New England Journal of Medicine",
      pubdate: "2013",
      authors: ["Nielsen N", "et al."],
      doi: null,
      abstract: "Found no difference in outcomes between targeting 33°C vs 36°C after out-of-hospital cardiac arrest, challenging the assumption that deeper cooling is necessary and shifting practice toward fever avoidance/targeted normothermia.",
      citation_count: 0,
      is_top_journal: true,
      is_open_access: false,
      study_type: "Landmark Trial",
      url: "https://pubmed.ncbi.nlm.nih.gov/?term=targeted+temperature+management+33+36+degrees+after+cardiac+arrest+nielsen",
    },
    {
      title: "ProCESS: Protocol-based care for early septic shock",
      journal: "New England Journal of Medicine",
      pubdate: "2014",
      authors: ["ProCESS Investigators"],
      doi: null,
      abstract: "Along with ARISE and ProMISe, found no mortality benefit of protocolized EGDT over usual care in modern sepsis management, effectively retiring the strict Rivers protocol while keeping its underlying principles (early recognition, early antibiotics/fluids).",
      citation_count: 0,
      is_top_journal: true,
      is_open_access: false,
      study_type: "Landmark Trial",
      url: "https://pubmed.ncbi.nlm.nih.gov/?term=randomized+trial+protocol-based+care+early+septic+shock+ProCESS",
    },
    {
      title: "EOLIA: ECMO for severe ARDS",
      journal: "New England Journal of Medicine",
      pubdate: "2018",
      authors: ["Combes A", "et al."],
      doi: null,
      abstract: "A trial of early ECMO vs conventional ventilation (with crossover to ECMO as rescue) in very severe ARDS; the primary mortality endpoint was not statistically significant, but high crossover and post-hoc analyses kept ECMO's role in severe ARDS actively debated.",
      citation_count: 0,
      is_top_journal: true,
      is_open_access: false,
      study_type: "Landmark Trial",
      url: "https://pubmed.ncbi.nlm.nih.gov/?term=extracorporeal+membrane+oxygenation+severe+acute+respiratory+distress+syndrome+combes",
    },
    {
      title: "CRASH-2: Tranexamic acid in trauma hemorrhage",
      journal: "The Lancet",
      pubdate: "2010",
      authors: ["CRASH-2 Collaborators"],
      doi: null,
      abstract: "A large multicenter trial showing tranexamic acid reduced death from bleeding in trauma patients when given early, especially within 3 hours of injury — now standard in trauma resuscitation protocols worldwide.",
      citation_count: 0,
      is_top_journal: true,
      is_open_access: false,
      study_type: "Landmark Trial",
      url: "https://pubmed.ncbi.nlm.nih.gov/?term=effects+tranexamic+acid+death+vascular+occlusive+events+blood+transfusion+trauma+CRASH-2",
    },
    {
      title: "SAFE Study: Albumin vs saline for fluid resuscitation",
      journal: "New England Journal of Medicine",
      pubdate: "2004",
      authors: ["SAFE Study Investigators"],
      doi: null,
      abstract: "Found no overall mortality difference between 4% albumin and normal saline for ICU fluid resuscitation, though subgroup signals (traumatic brain injury did worse with albumin) still influence fluid choice today.",
      citation_count: 0,
      is_top_journal: true,
      is_open_access: false,
      study_type: "Landmark Trial",
      url: "https://pubmed.ncbi.nlm.nih.gov/?term=comparison+albumin+saline+fluid+resuscitation+intensive+care+unit+SAFE+study",
    },
    {
      title: "ADRENAL: Hydrocortisone in septic shock",
      journal: "New England Journal of Medicine",
      pubdate: "2018",
      authors: ["ADRENAL Trial Investigators"],
      doi: null,
      abstract: "Found hydrocortisone sped resolution of septic shock and reduced time on ventilation/ICU length of stay, without a statistically significant 90-day mortality benefit — informing current selective-use steroid practice in refractory septic shock.",
      citation_count: 0,
      is_top_journal: true,
      is_open_access: false,
      study_type: "Landmark Trial",
      url: "https://pubmed.ncbi.nlm.nih.gov/?term=adjunctive+glucocorticoid+therapy+patients+septic+shock+ADRENAL",
    },
  ];

  let rawData = null;
  let currentSearchTerm = "";
  let scrollHandler = null;
  const categorySort = {}; // category id -> "newest" | "cited"
  let previousSeenIds = new Set();
  let isFirstVisit = true;
  let currentSessionIds = new Set();
  let bookmarkedIds = new Set();

  function initTheme() {
    const saved = localStorage.getItem("icu-scope-theme");
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const effective = saved || (prefersDark ? "dark" : "light");
    themeToggle.textContent = effective === "dark" ? "☀️" : "🌙";
    themeToggle.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme")
        || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("icu-scope-theme", next);
      themeToggle.textContent = next === "dark" ? "☀️" : "🌙";
    });
  }

  function initCompactView() {
    const saved = localStorage.getItem("icu-scope-compact") === "1";
    document.body.classList.toggle("compact-view", saved);
    compactToggle.setAttribute("aria-pressed", String(saved));
    compactToggle.textContent = saved ? "☰ Full view" : "☰ Compact view";
    compactToggle.addEventListener("click", () => {
      const active = document.body.classList.toggle("compact-view");
      compactToggle.setAttribute("aria-pressed", String(active));
      compactToggle.textContent = active ? "☰ Full view" : "☰ Compact view";
      localStorage.setItem("icu-scope-compact", active ? "1" : "0");
    });
  }

  function loadSeenIds() {
    try {
      const raw = localStorage.getItem("icu-scope-seen");
      if (raw === null) {
        isFirstVisit = true;
        return new Set();
      }
      isFirstVisit = false;
      return new Set(JSON.parse(raw));
    } catch (e) {
      return new Set();
    }
  }

  function saveSeenIds(ids) {
    try {
      localStorage.setItem("icu-scope-seen", JSON.stringify([...ids]));
    } catch (e) {
      /* localStorage unavailable, skip */
    }
  }

  function loadBookmarks() {
    try {
      return new Set(JSON.parse(localStorage.getItem("icu-scope-bookmarks") || "[]"));
    } catch (e) {
      return new Set();
    }
  }

  function saveBookmarks() {
    try {
      localStorage.setItem("icu-scope-bookmarks", JSON.stringify([...bookmarkedIds]));
    } catch (e) {
      /* localStorage unavailable, skip */
    }
  }

  function loadCollapseState() {
    try {
      return JSON.parse(localStorage.getItem("icu-scope-collapsed") || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveCollapseState(state) {
    try {
      localStorage.setItem("icu-scope-collapsed", JSON.stringify(state));
    } catch (e) {
      /* localStorage unavailable, skip */
    }
  }

  function setSectionCollapsed(entry, collapsed) {
    const body = entry.body;
    // max-height drives the animation, but a fixed guess clips longer
    // sections (bit us on mobile, where cards run taller). Measure the
    // real content height instead: scrollHeight is unaffected by the
    // current max-height/overflow clipping, so it's always accurate.
    if (collapsed) {
      body.style.maxHeight = `${body.scrollHeight}px`;
      body.offsetHeight; // force layout so the browser registers the start height
      body.style.maxHeight = "0px";
    } else {
      body.style.maxHeight = `${body.scrollHeight}px`;
      body.addEventListener("transitionend", function onEnd(e) {
        if (e.propertyName === "max-height") {
          body.style.maxHeight = "";
          body.removeEventListener("transitionend", onEnd);
        }
      });
    }
    body.classList.toggle("collapsed", collapsed);
    entry.toggle.setAttribute("aria-expanded", String(!collapsed));
    entry.toggle.textContent = collapsed ? "▸" : "▾";
  }

  function initCollapsibleSections() {
    const state = loadCollapseState();
    COLLAPSIBLE_SECTIONS.forEach((entry) => {
      const collapsed = state[entry.id] === undefined ? true : state[entry.id];
      setSectionCollapsed(entry, collapsed);
      entry.toggle.addEventListener("click", () => {
        const nowCollapsed = !entry.body.classList.contains("collapsed");
        setSectionCollapsed(entry, nowCollapsed);
        const current = loadCollapseState();
        current[entry.id] = nowCollapsed;
        saveCollapseState(current);
      });
    });
  }

  function jumpToSection(sectionId) {
    const entry = COLLAPSIBLE_SECTIONS.find((e) => e.id === sectionId);
    const sectionEl = document.getElementById(`${sectionId}-section`);
    if (!sectionEl || sectionEl.hidden) return;
    if (entry && entry.body.classList.contains("collapsed")) {
      setSectionCollapsed(entry, false);
      const current = loadCollapseState();
      current[sectionId] = false;
      saveCollapseState(current);
    }
    sectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeSectionJumpMenu() {
    sectionJumpNav.classList.remove("open");
    bottomNavBackdrop.hidden = true;
    bottomNavMore.setAttribute("aria-expanded", "false");
  }

  function initSectionJump() {
    sectionJumpNav.querySelectorAll(".section-jump-btn").forEach((btn) => { btn.remove(); });
    SECTION_JUMP_TARGETS.forEach((target) => {
      const btn = document.createElement("button");
      btn.className = "section-jump-btn";
      btn.type = "button";
      btn.innerHTML = `<span>${target.icon}</span><span>${escapeHtml(target.label)}</span>`;
      btn.addEventListener("click", () => {
        jumpToSection(target.sectionId);
        closeSectionJumpMenu();
      });
      sectionJumpNav.appendChild(btn);
    });
    document.documentElement.style.setProperty("--section-jump-height", `${sectionJumpNav.offsetHeight}px`);
  }

  function articleId(article) {
    return article.pmid ? `pmid:${article.pmid}` : `url:${article.url}`;
  }

  function collectAllIds(data) {
    const ids = new Set();
    (data.trending && data.trending.articles || []).forEach((a) => ids.add(articleId(a)));
    (data.foamed && data.foamed.articles || []).forEach((a) => ids.add(`url:${a.url}`));
    (data.preprints && data.preprints.articles || []).forEach((a) => ids.add(`url:${a.url}`));
    (data.trials && data.trials.articles || []).forEach((a) => ids.add(`url:${a.url}`));
    CLASSIC_TRIALS.forEach((a) => ids.add(articleId(a)));
    (data.guidelines && data.guidelines.articles || []).forEach((a) => ids.add(articleId(a)));
    (data.categories || []).forEach((c) => c.articles.forEach((a) => ids.add(articleId(a))));
    return ids;
  }

  function buildArticleIndex(data) {
    const map = new Map();
    const add = (a) => {
      const id = articleId(a);
      if (!map.has(id)) map.set(id, a);
    };
    (data.trending && data.trending.articles || []).forEach(add);
    ((data.foamed && data.foamed.articles) || []).map(foamedToArticle).forEach(add);
    ((data.preprints && data.preprints.articles) || []).map(preprintToArticle).forEach(add);
    ((data.trials && data.trials.articles) || []).map(trialToArticle).forEach(add);
    CLASSIC_TRIALS.forEach(add);
    (data.guidelines && data.guidelines.articles || []).forEach(add);
    (data.categories || []).forEach((c) => c.articles.forEach(add));
    return map;
  }

  function formatUpdatedAt(iso, windowDays) {
    if (!iso) return "";
    const d = new Date(iso);
    const formatted = d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    return `Last updated ${formatted} · new articles pulled from the last ${windowDays} day${windowDays === 1 ? "" : "s"}`;
  }

  function journalHue(name) {
    let hash = 0;
    const str = name || "unknown";
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    }
    return hash % 360;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function highlightMatch(str, term) {
    const escaped = escapeHtml(str);
    if (!term) return escaped;
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return escaped.replace(new RegExp(`(${escapedTerm})`, "ig"), "<mark>$1</mark>");
  }

  function parsePubDate(str) {
    if (!str) return null;
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  function matchesSearch(article, term) {
    if (!term) return true;
    const hay = `${article.title} ${article.journal || ""} ${article.abstract || ""} ${article.ai_summary || ""} ${article.ai_significance || ""} ${(article.authors || []).join(" ")}`.toLowerCase();
    return hay.includes(term);
  }

  function withinWindow(article, days) {
    if (!days) return true;
    const d = parsePubDate(article.pubdate);
    if (!d) return false;
    const cutoff = Date.now() - days * 86400000;
    return d.getTime() >= cutoff;
  }

  function matchesStudyType(article, type) {
    if (!type || type === "all") return true;
    return (article.study_type || "Study") === type;
  }

  function filterList(list, term, days, studyType) {
    return list.filter((a) => matchesSearch(a, term) && withinWindow(a, days) && matchesStudyType(a, studyType));
  }

  function sortArticles(mode, articles) {
    const copy = articles.slice();
    if (mode === "cited") {
      copy.sort((a, b) => (b.citation_count || 0) - (a.citation_count || 0));
    } else {
      copy.sort((a, b) => {
        const da = parsePubDate(a.pubdate);
        const db = parsePubDate(b.pubdate);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return db - da;
      });
    }
    return copy;
  }

  function formatCitation(article) {
    if (article.is_foamed) {
      const author = (article.authors && article.authors[0]) || article.journal || "Unknown author";
      return `${author}. ${article.title} [Internet]. ${article.journal || ""}; ${article.pubdate || ""}. Available from: ${article.url}`;
    }
    const authors = article.authors && article.authors.length ? article.authors.join(", ") : "[Author unavailable]";
    const yearMatch = (article.pubdate || "").match(/\d{4}/);
    const year = yearMatch ? yearMatch[0] : "";
    let citation = `${authors}. ${article.title} ${article.journal || ""}. ${year}`;
    if (article.volume) citation += `;${article.volume}`;
    if (article.issue) citation += `(${article.issue})`;
    if (article.pages) citation += `:${article.pages}`;
    citation += ".";
    if (article.doi) citation += ` doi:${article.doi}`;
    return citation;
  }

  function buildDigestText(data) {
    if (!data) return "";
    const lines = [`ICU Scope — Weekly Digest (${new Date().toLocaleDateString()})`, ""];

    if (data.spotlight && data.spotlight.title) {
      lines.push(`📌 Article of the Week: ${data.spotlight.title}`);
      if (data.spotlight.why_selected) lines.push(`   ${data.spotlight.why_selected}`);
      lines.push(`   ${data.spotlight.url}`, "");
    }

    const trending = ((data.trending && data.trending.articles) || []).slice(0, 5);
    if (trending.length) {
      lines.push("🔥 Trending this month:");
      trending.forEach((a) => {
        lines.push(`- ${a.title} (${a.journal || ""}, ${a.pubdate || ""})`);
        if (a.ai_significance) lines.push(`  ${a.ai_significance}`);
        lines.push(`  ${a.url}`);
      });
      lines.push("");
    }

    const guidelines = ((data.guidelines && data.guidelines.articles) || []).slice(0, 5);
    if (guidelines.length) {
      lines.push("📋 Guideline Watch:");
      guidelines.forEach((a) => {
        lines.push(`- ${a.title}${a.society ? ` (${a.society})` : ""}`);
        lines.push(`  ${a.url}`);
      });
    }

    return lines.join("\n").trim();
  }

  function articleCard(article) {
    const id = articleId(article);
    const isNew = !isFirstVisit && !previousSeenIds.has(id);
    const isBookmarked = bookmarkedIds.has(id);
    currentSessionIds.add(id);

    const authors = article.authors && article.authors.length
      ? article.authors.slice(0, 4).join(", ") + (article.authors.length > 4 ? ", et al." : "")
      : "Authors unavailable";
    const doiLink = article.doi
      ? `<a href="https://doi.org/${encodeURIComponent(article.doi)}" target="_blank" rel="noopener">DOI</a>`
      : "";
    const hasAiSummary = !!(article.ai_summary || article.ai_significance);
    const abstractToggleLabel = hasAiSummary ? "Show original text" : "Show more";
    const abstractBlock = article.abstract
      ? `<p class="article-abstract">${highlightMatch(article.abstract, currentSearchTerm)}</p>
         <button class="abstract-toggle" type="button">${abstractToggleLabel}</button>`
      : "";
    const askContext = article.abstract || article.summary || "";
    const askBlock = (ASK_AI_ENDPOINT && askContext)
      ? `<div class="ask-ai">
           <button class="ask-toggle" type="button">💬 Ask about this article</button>
           <div class="ask-panel" hidden>
             <div class="ask-input-row">
               <input type="text" class="ask-input" placeholder="e.g. What was the sample size?" maxlength="300" />
               <button class="ask-submit" type="button">Ask</button>
             </div>
             <p class="ask-answer" hidden></p>
             <p class="ai-disclaimer">AI-generated from this article's abstract only — verify against the source.</p>
           </div>
         </div>`
      : "";
    const aiBlock = hasAiSummary
      ? `<div class="ai-summary">
           <div class="ai-summary-label">✨ AI Summary</div>
           ${article.ai_key_stats ? `<p class="ai-key-stats">${escapeHtml(article.ai_key_stats)}</p>` : ""}
           ${article.ai_significance ? `<p class="ai-significance"><strong>Why it matters:</strong> ${escapeHtml(article.ai_significance)}</p>` : ""}
           ${article.ai_summary ? `<p class="ai-summary-text">${escapeHtml(article.ai_summary)}</p>` : ""}
           ${article.ai_summary ? `<button class="ai-summary-toggle" type="button">Show full summary</button>` : ""}
           <p class="ai-disclaimer">AI-generated — verify against the source before relying on it clinically.</p>
         </div>`
      : "";
    const citationBadge = article.citation_count > 0
      ? `<span class="citation-badge">cited ${article.citation_count}×</span>`
      : "";
    const topJournalBadge = article.is_top_journal
      ? `<span class="top-journal-badge">★ Top Journal</span>`
      : "";
    const foamedBadge = article.is_foamed
      ? `<span class="foamed-badge">FOAMed</span>`
      : "";
    const newBadge = isNew ? `<span class="new-badge">● New</span>` : "";
    const studyTypeBadge = article.study_type
      ? `<span class="study-type-badge">${escapeHtml(article.study_type)}</span>`
      : "";
    const societyBadge = article.society
      ? `<span class="society-badge">${escapeHtml(article.society)}</span>`
      : "";
    const oaBadge = article.is_open_access
      ? `<span class="oa-badge">🔓 Open Access</span>`
      : "";
    const brokenBadge = article.link_broken
      ? `<span class="broken-link-badge" title="This link may no longer resolve">⚠ Link may be broken</span>`
      : "";
    const fullTextLink = article.pmc_url
      ? `<a href="${article.pmc_url}" target="_blank" rel="noopener">Free full text</a>`
      : "";
    const readLabel = article.is_foamed
      ? "Read post"
      : article.is_preprint
        ? "Read preprint"
        : article.is_trial
          ? "ClinicalTrials.gov"
          : "PubMed";

    const card = document.createElement("article");
    card.className = "article-card" + (isNew ? " is-new" : "");
    card.innerHTML = `
      <h3 class="article-title"><a href="${article.url}" target="_blank" rel="noopener">${highlightMatch(article.title, currentSearchTerm)}</a>${newBadge}${topJournalBadge}${foamedBadge}${citationBadge}</h3>
      <div class="article-meta">
        <span class="journal" style="--journal-hue: ${journalHue(article.journal)}">${escapeHtml(article.journal || "")}</span> · ${escapeHtml(article.pubdate || "")}<br/>
        ${escapeHtml(authors)}
      </div>
      <div class="article-tags">${studyTypeBadge}${societyBadge}${oaBadge}${brokenBadge}</div>
      ${aiBlock}
      ${abstractBlock}
      ${askBlock}
      <div class="article-links">
        <a href="${article.url}" target="_blank" rel="noopener">${readLabel}</a>
        ${doiLink}
        ${fullTextLink}
        <button class="cite-btn" type="button">Cite</button>
        <button class="bookmark-btn${isBookmarked ? " active" : ""}" type="button" aria-pressed="${isBookmarked}" aria-label="${isBookmarked ? "Remove from saved" : "Save article"}">${isBookmarked ? "🔖 Saved" : "🔖 Save"}</button>
      </div>
    `;

    const toggle = card.querySelector(".abstract-toggle");
    const abstractEl = card.querySelector(".article-abstract");
    if (toggle && abstractEl) {
      toggle.addEventListener("click", () => {
        const expanded = abstractEl.classList.toggle("expanded");
        toggle.textContent = expanded ? "Show less" : abstractToggleLabel;
      });
    }

    const aiToggle = card.querySelector(".ai-summary-toggle");
    const aiSummaryEl = card.querySelector(".ai-summary-text");
    if (aiToggle && aiSummaryEl) {
      aiToggle.addEventListener("click", () => {
        const expanded = aiSummaryEl.classList.toggle("expanded");
        aiToggle.textContent = expanded ? "Hide full summary" : "Show full summary";
      });
    }

    const askToggle = card.querySelector(".ask-toggle");
    const askPanel = card.querySelector(".ask-panel");
    if (askToggle && askPanel) {
      askToggle.addEventListener("click", () => {
        askPanel.hidden = !askPanel.hidden;
      });
      const askInput = card.querySelector(".ask-input");
      const askSubmit = card.querySelector(".ask-submit");
      const askAnswer = card.querySelector(".ask-answer");
      const submitQuestion = () => {
        const question = askInput.value.trim();
        if (!question) return;
        askSubmit.disabled = true;
        askInput.disabled = true;
        askAnswer.hidden = false;
        askAnswer.textContent = "Thinking…";
        fetch(ASK_AI_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, title: article.title, context: askContext }),
        })
          .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
          .then(({ ok, data }) => {
            askAnswer.textContent = ok ? (data.answer || "No answer generated.") : (data.error || "Something went wrong.");
          })
          .catch(() => {
            askAnswer.textContent = "Couldn't reach the AI service. Try again later.";
          })
          .finally(() => {
            askSubmit.disabled = false;
            askInput.disabled = false;
          });
      };
      askSubmit.addEventListener("click", submitQuestion);
      askInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submitQuestion();
      });
    }

    const citeBtn = card.querySelector(".cite-btn");
    citeBtn.addEventListener("click", () => {
      const text = formatCitation(article);
      const original = citeBtn.textContent;
      const flash = (label) => {
        citeBtn.textContent = label;
        setTimeout(() => { citeBtn.textContent = original; }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => flash("Copied!")).catch(() => flash("Copy failed"));
      } else {
        flash("Copy unsupported");
      }
    });

    const bookmarkBtn = card.querySelector(".bookmark-btn");
    bookmarkBtn.addEventListener("click", () => {
      if (bookmarkedIds.has(id)) {
        bookmarkedIds.delete(id);
      } else {
        bookmarkedIds.add(id);
      }
      saveBookmarks();
      applyFiltersAndRender();
    });

    return card;
  }

  function foamedToArticle(item) {
    return {
      title: item.title,
      journal: item.source,
      pubdate: item.pubdate,
      authors: item.author ? [item.author] : [],
      doi: null,
      abstract: item.summary,
      ai_key_stats: item.ai_key_stats,
      ai_summary: item.ai_summary,
      ai_significance: item.ai_significance,
      citation_count: 0,
      is_top_journal: false,
      is_foamed: true,
      is_open_access: item.is_open_access !== false,
      study_type: item.study_type || "FOAMed/Blog",
      url: item.url,
    };
  }

  function preprintToArticle(item) {
    return {
      title: item.title,
      journal: item.source,
      pubdate: item.pubdate,
      authors: item.author ? [item.author] : [],
      doi: null,
      abstract: item.summary,
      ai_key_stats: item.ai_key_stats,
      ai_summary: item.ai_summary,
      ai_significance: item.ai_significance,
      citation_count: 0,
      is_top_journal: false,
      is_open_access: true,
      is_preprint: true,
      study_type: item.study_type || "Preprint (not peer-reviewed)",
      url: item.url,
    };
  }

  function trialToArticle(item) {
    return {
      title: item.title,
      journal: item.source,
      pubdate: item.pubdate,
      authors: [],
      doi: null,
      abstract: item.summary,
      ai_key_stats: item.ai_key_stats,
      ai_summary: item.ai_summary,
      ai_significance: item.ai_significance,
      citation_count: 0,
      is_top_journal: false,
      is_open_access: true,
      is_trial: true,
      study_type: item.study_type || "Clinical Trial",
      url: item.url,
    };
  }

  function renderTrending(trending, term, days, studyType) {
    const articles = filterList((trending && trending.articles) || [], term, days, studyType);
    if (!articles.length) {
      trendingSection.hidden = true;
      return;
    }
    trendingSection.hidden = false;
    trendingCount.textContent = `${articles.length} article${articles.length === 1 ? "" : "s"} · last ${trending.window_days} days`;
    trendingList.innerHTML = "";
    articles.forEach((article) => trendingList.appendChild(articleCard(article)));
  }

  function renderFoamed(foamed, term, days, studyType) {
    const posts = filterList(((foamed && foamed.articles) || []).map(foamedToArticle), term, days, studyType);
    if (!posts.length) {
      foamedSection.hidden = true;
      return;
    }
    foamedSection.hidden = false;
    foamedCount.textContent = `${posts.length} post${posts.length === 1 ? "" : "s"} · last ${foamed.window_days} days`;
    foamedList.innerHTML = "";
    posts.forEach((item) => foamedList.appendChild(articleCard(item)));
  }

  function renderPreprints(preprints, term, days, studyType) {
    const articles = filterList(((preprints && preprints.articles) || []).map(preprintToArticle), term, days, studyType);
    preprintWindow.textContent = preprints ? preprints.window_days : "";
    if (!articles.length) {
      preprintSection.hidden = true;
      return;
    }
    preprintSection.hidden = false;
    preprintCount.textContent = `${articles.length} preprint${articles.length === 1 ? "" : "s"}`;
    preprintList.innerHTML = "";
    articles.forEach((article) => preprintList.appendChild(articleCard(article)));
  }

  function renderTrials(trials, term, days, studyType) {
    const articles = filterList(((trials && trials.articles) || []).map(trialToArticle), term, days, studyType);
    trialWindow.textContent = trials ? trials.window_days : "";
    if (!articles.length) {
      trialSection.hidden = true;
      return;
    }
    trialSection.hidden = false;
    trialCount.textContent = `${articles.length} trial${articles.length === 1 ? "" : "s"}`;
    trialList.innerHTML = "";
    articles.forEach((article) => trialList.appendChild(articleCard(article)));
  }

  function renderGuidelines(guidelines, term, days, studyType) {
    const articles = filterList((guidelines && guidelines.articles) || [], term, days, studyType);
    guidelineWindow.textContent = guidelines ? guidelines.window_days : "";
    if (!articles.length) {
      guidelineSection.hidden = true;
      return;
    }
    guidelineSection.hidden = false;
    guidelineCount.textContent = `${articles.length} guideline${articles.length === 1 ? "" : "s"}`;
    guidelineList.innerHTML = "";
    articles.forEach((article) => guidelineList.appendChild(articleCard(article)));
  }

  function renderSpotlight(spotlight) {
    if (!spotlight || !spotlight.title) {
      spotlightSection.hidden = true;
      return;
    }
    spotlightSection.hidden = false;
    spotlightWeek.textContent = spotlight.week
      ? `Week of ${new Date(`${spotlight.week}T00:00:00Z`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}`
      : "";
    const prompts = (spotlight.discussion_prompts || []).map((p) => `<li>${escapeHtml(p)}</li>`).join("");
    spotlightBody.innerHTML = `
      <div class="article-card spotlight-card">
        <h3 class="article-title"><a href="${spotlight.url}" target="_blank" rel="noopener">${escapeHtml(spotlight.title)}</a></h3>
        <div class="article-meta">
          <span class="journal" style="--journal-hue: ${journalHue(spotlight.journal)}">${escapeHtml(spotlight.journal || "")}</span> · ${escapeHtml(spotlight.pubdate || "")}
        </div>
        ${spotlight.why_selected ? `<p class="ai-significance"><strong>Why this pick:</strong> ${escapeHtml(spotlight.why_selected)}</p>` : ""}
        ${prompts ? `<div class="discussion-prompts"><strong>Discussion prompts:</strong><ul>${prompts}</ul></div>` : ""}
        <div class="article-links"><a href="${spotlight.url}" target="_blank" rel="noopener">PubMed</a></div>
      </div>
    `;
  }

  function renderClassics() {
    classicsList.innerHTML = "";
    CLASSIC_TRIALS.forEach((trial) => classicsList.appendChild(articleCard(trial)));
  }

  function renderSaved(articleIndex) {
    const saved = [...bookmarkedIds].map((id) => articleIndex.get(id)).filter(Boolean);
    savedCountBadge.textContent = String(saved.length);
    if (!saved.length) {
      savedSection.hidden = true;
      return;
    }
    savedSection.hidden = false;
    savedCount.textContent = `${saved.length} article${saved.length === 1 ? "" : "s"}`;
    savedList.innerHTML = "";
    saved.forEach((a) => savedList.appendChild(articleCard(a)));
  }

  function populateStudyTypeOptions(data) {
    const types = new Set();
    const collect = (list) => list.forEach((a) => types.add(a.study_type || "Study"));
    collect((data.trending && data.trending.articles) || []);
    collect(((data.foamed && data.foamed.articles) || []).map(foamedToArticle));
    collect(((data.preprints && data.preprints.articles) || []).map(preprintToArticle));
    collect(((data.trials && data.trials.articles) || []).map(trialToArticle));
    collect((data.guidelines && data.guidelines.articles) || []);
    (data.categories || []).forEach((c) => collect(c.articles));
    const sorted = [...types].sort();
    studyTypeFilter.innerHTML = '<option value="all">All study types</option>'
      + sorted.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
  }

  function renderCategories(categories, term, days, studyType) {
    nav.innerHTML = "";
    content.innerHTML = "";

    const filtered = categories.map((cat) => ({
      ...cat,
      articles: sortArticles(categorySort[cat.id] || "newest", filterList(cat.articles, term, days, studyType)),
    }));

    const collapseState = loadCollapseState();

    filtered.forEach((cat, idx) => {
      const icon = CATEGORY_ICONS[cat.id] || "";
      const collapseId = `category-${cat.id}`;
      const bodyId = `cat-body-${cat.id}`;
      const chip = document.createElement("button");
      chip.className = "nav-chip" + (idx === 0 ? " active" : "");
      chip.setAttribute("aria-pressed", idx === 0 ? "true" : "false");
      chip.style.setProperty("--cat-accent", CATEGORY_COLORS[cat.id] || "");
      chip.textContent = `${icon} ${cat.abbr} (${cat.articles.length})`;
      chip.addEventListener("click", () => {
        const body = document.getElementById(bodyId);
        if (body && body.classList.contains("collapsed")) {
          document.querySelector(`#cat-${cat.id} .collapse-toggle`).click();
        }
        document.getElementById(`cat-${cat.id}`).scrollIntoView({ behavior: "smooth", block: "start" });
      });
      nav.appendChild(chip);

      const section = document.createElement("section");
      section.className = "category-section";
      section.id = `cat-${cat.id}`;
      section.style.setProperty("--cat-accent", CATEGORY_COLORS[cat.id] || "");

      const heading = document.createElement("div");
      heading.className = "category-heading";
      const mode = categorySort[cat.id] || "newest";
      heading.innerHTML = `
        <button class="collapse-toggle" type="button" aria-controls="${bodyId}">▸</button>
        <h2>${icon} ${escapeHtml(cat.label)}</h2>
        <span class="category-count">${cat.articles.length} article${cat.articles.length === 1 ? "" : "s"}</span>
        <div class="sort-toggle">
          <button type="button" class="sort-btn${mode === "newest" ? " active" : ""}" aria-pressed="${mode === "newest"}" data-mode="newest">Newest</button>
          <button type="button" class="sort-btn${mode === "cited" ? " active" : ""}" aria-pressed="${mode === "cited"}" data-mode="cited">Most cited</button>
        </div>
      `;
      heading.querySelectorAll(".sort-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          categorySort[cat.id] = btn.dataset.mode;
          applyFiltersAndRender();
        });
      });
      section.appendChild(heading);

      const body = document.createElement("div");
      body.className = "section-body category-body";
      body.id = bodyId;

      if (!cat.articles.length) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "No articles match the current filters.";
        body.appendChild(empty);
      } else {
        cat.articles.forEach((article) => body.appendChild(articleCard(article)));
      }

      section.appendChild(body);
      content.appendChild(section);

      const collapseToggle = heading.querySelector(".collapse-toggle");
      const entry = { body, toggle: collapseToggle };
      const collapsed = collapseState[collapseId] === undefined ? true : collapseState[collapseId];
      setSectionCollapsed(entry, collapsed);
      collapseToggle.addEventListener("click", () => {
        const nowCollapsed = !body.classList.contains("collapsed");
        setSectionCollapsed(entry, nowCollapsed);
        const current = loadCollapseState();
        current[collapseId] = nowCollapsed;
        saveCollapseState(current);
      });
    });

    if (scrollHandler) {
      document.removeEventListener("scroll", scrollHandler);
    }
    if (nav.children.length) {
      scrollHandler = () => {
        let currentId = null;
        for (const cat of filtered) {
          const el = document.getElementById(`cat-${cat.id}`);
          if (el && el.getBoundingClientRect().top <= 80) {
            currentId = cat.id;
          }
        }
        [...nav.children].forEach((chip, idx) => {
          const active = filtered[idx] && filtered[idx].id === currentId;
          chip.classList.toggle("active", active);
          chip.setAttribute("aria-pressed", active ? "true" : "false");
        });
      };
      document.addEventListener("scroll", scrollHandler, { passive: true });
    }
  }

  function applyFiltersAndRender() {
    if (!rawData) return;
    const term = searchInput.value.trim().toLowerCase();
    const days = windowFilter.value === "all" ? null : Number(windowFilter.value);
    const studyType = studyTypeFilter.value;
    currentSearchTerm = term;

    currentSessionIds = new Set();
    renderSpotlight(rawData.spotlight);
    renderSaved(buildArticleIndex(rawData));
    renderGuidelines(rawData.guidelines, term, days, studyType);
    renderTrending(rawData.trending, term, days, studyType);
    renderFoamed(rawData.foamed, term, days, studyType);
    renderPreprints(rawData.preprints, term, days, studyType);
    renderTrials(rawData.trials, term, days, studyType);
    renderCategories(rawData.categories || [], term, days, studyType);
  }

  initTheme();
  initCompactView();
  initCollapsibleSections();
  renderClassics();
  initSectionJump();

  backToTopBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  window.addEventListener("scroll", () => {
    backToTopBtn.hidden = window.scrollY < 600;
  }, { passive: true });
  previousSeenIds = loadSeenIds();
  bookmarkedIds = loadBookmarks();

  bottomNavTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  bottomNavTrending.addEventListener("click", () => jumpToSection("trending"));
  bottomNavSaved.addEventListener("click", () => jumpToSection("saved"));
  bottomNavMore.addEventListener("click", () => {
    const isOpen = sectionJumpNav.classList.toggle("open");
    bottomNavBackdrop.hidden = !isOpen;
    bottomNavMore.setAttribute("aria-expanded", String(isOpen));
  });
  sectionJumpClose.addEventListener("click", closeSectionJumpMenu);
  bottomNavBackdrop.addEventListener("click", closeSectionJumpMenu);

  searchInput.addEventListener("input", () => applyFiltersAndRender());
  windowFilter.addEventListener("change", () => applyFiltersAndRender());
  studyTypeFilter.addEventListener("change", () => applyFiltersAndRender());
  savedToggle.addEventListener("click", () => {
    if (savedSection.hidden) return;
    const savedEntry = COLLAPSIBLE_SECTIONS.find((e) => e.id === "saved");
    if (savedBody.classList.contains("collapsed")) {
      setSectionCollapsed(savedEntry, false);
      const current = loadCollapseState();
      current.saved = false;
      saveCollapseState(current);
    }
    savedSection.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  spotlightPrintBtn.addEventListener("click", () => {
    const spotlightEntry = COLLAPSIBLE_SECTIONS.find((e) => e.id === "spotlight");
    const wasCollapsed = spotlightBody.classList.contains("collapsed");
    spotlightBody.classList.remove("collapsed");
    spotlightBody.style.maxHeight = "none";
    document.body.classList.add("printing-spotlight");
    const restore = () => {
      document.body.classList.remove("printing-spotlight");
      if (wasCollapsed) {
        setSectionCollapsed(spotlightEntry, true);
      } else {
        spotlightBody.style.maxHeight = "";
      }
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  });

  digestBtn.addEventListener("click", () => {
    const text = buildDigestText(rawData);
    const original = digestBtn.textContent;
    const flash = (label) => {
      digestBtn.textContent = label;
      setTimeout(() => { digestBtn.textContent = original; }, 1500);
    };
    if (!text) {
      flash("Nothing to copy yet");
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => flash("Copied!")).catch(() => flash("Copy failed"));
    } else {
      flash("Copy unsupported");
    }
  });

  fetch(`data/articles.json?t=${Date.now()}`, { cache: "no-store" })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((data) => {
      rawData = data;
      updatedLine.textContent = formatUpdatedAt(data.generated_at, data.window_days);
      populateStudyTypeOptions(data);
      applyFiltersAndRender();
      saveSeenIds(collectAllIds(data));
    })
    .catch((err) => {
      content.innerHTML = `<p class="empty">Couldn't load article data (${escapeHtml(err.message)}).</p>`;
    });
})();
