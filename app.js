(function () {
  const nav = document.getElementById("category-nav");
  const content = document.getElementById("content");
  const updatedLine = document.getElementById("updated-line");
  const trendingSection = document.getElementById("trending-section");
  const trendingList = document.getElementById("trending-list");
  const trendingCount = document.getElementById("trending-count");
  const foamedSection = document.getElementById("foamed-section");
  const foamedList = document.getElementById("foamed-list");
  const foamedCount = document.getElementById("foamed-count");
  const guidelineSection = document.getElementById("guideline-section");
  const guidelineList = document.getElementById("guideline-list");
  const guidelineCount = document.getElementById("guideline-count");
  const guidelineWindow = document.getElementById("guideline-window");
  const spotlightSection = document.getElementById("spotlight-section");
  const spotlightBody = document.getElementById("spotlight-body");
  const spotlightWeek = document.getElementById("spotlight-week");
  const savedSection = document.getElementById("saved-section");
  const savedList = document.getElementById("saved-list");
  const savedCount = document.getElementById("saved-count");
  const savedCountBadge = document.getElementById("saved-count-badge");
  const savedToggle = document.getElementById("saved-toggle");
  const themeToggle = document.getElementById("theme-toggle");
  const searchInput = document.getElementById("search-input");
  const windowFilter = document.getElementById("window-filter");
  const studyTypeFilter = document.getElementById("study-type-filter");

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
  };

  let rawData = null;
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

  function articleId(article) {
    return article.pmid ? `pmid:${article.pmid}` : `url:${article.url}`;
  }

  function collectAllIds(data) {
    const ids = new Set();
    (data.trending && data.trending.articles || []).forEach((a) => ids.add(articleId(a)));
    (data.foamed && data.foamed.articles || []).forEach((a) => ids.add(`url:${a.url}`));
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
    (data.guidelines && data.guidelines.articles || []).forEach(add);
    (data.categories || []).forEach((c) => c.articles.forEach(add));
    return map;
  }

  function formatUpdatedAt(iso, windowDays) {
    if (!iso) return "";
    const d = new Date(iso);
    const formatted = d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    return `Last updated ${formatted} · showing articles from the last ${windowDays} day${windowDays === 1 ? "" : "s"}`;
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
      ? `<p class="article-abstract">${escapeHtml(article.abstract)}</p>
         <button class="abstract-toggle" type="button">${abstractToggleLabel}</button>`
      : "";
    const aiBlock = hasAiSummary
      ? `<div class="ai-summary">
           <div class="ai-summary-label">✨ AI Summary</div>
           ${article.ai_summary ? `<p class="ai-summary-text">${escapeHtml(article.ai_summary)}</p>` : ""}
           ${article.ai_significance ? `<p class="ai-significance"><strong>Why it matters:</strong> ${escapeHtml(article.ai_significance)}</p>` : ""}
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
    const studyTypeBadge = article.study_type && article.study_type !== "Study"
      ? `<span class="study-type-badge">${escapeHtml(article.study_type)}</span>`
      : "";

    const card = document.createElement("article");
    card.className = "article-card" + (isNew ? " is-new" : "");
    card.innerHTML = `
      <h3 class="article-title"><a href="${article.url}" target="_blank" rel="noopener">${escapeHtml(article.title)}</a>${newBadge}${topJournalBadge}${foamedBadge}${studyTypeBadge}${citationBadge}</h3>
      <div class="article-meta">
        <span class="journal" style="--journal-hue: ${journalHue(article.journal)}">${escapeHtml(article.journal || "")}</span> · ${escapeHtml(article.pubdate || "")}<br/>
        ${escapeHtml(authors)}
      </div>
      ${aiBlock}
      ${abstractBlock}
      <div class="article-links">
        <a href="${article.url}" target="_blank" rel="noopener">${article.is_foamed ? "Read post" : "PubMed"}</a>
        ${doiLink}
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
      ai_summary: item.ai_summary,
      ai_significance: item.ai_significance,
      citation_count: 0,
      is_top_journal: false,
      is_foamed: true,
      study_type: item.study_type || "FOAMed/Blog",
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
    spotlightWeek.textContent = spotlight.week || "";
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

    filtered.forEach((cat, idx) => {
      const icon = CATEGORY_ICONS[cat.id] || "";
      const chip = document.createElement("button");
      chip.className = "nav-chip" + (idx === 0 ? " active" : "");
      chip.setAttribute("aria-pressed", idx === 0 ? "true" : "false");
      chip.textContent = `${icon} ${cat.abbr} (${cat.articles.length})`;
      chip.addEventListener("click", () => {
        document.getElementById(`cat-${cat.id}`).scrollIntoView({ behavior: "smooth", block: "start" });
      });
      nav.appendChild(chip);

      const section = document.createElement("section");
      section.className = "category-section";
      section.id = `cat-${cat.id}`;

      const heading = document.createElement("div");
      heading.className = "category-heading";
      const mode = categorySort[cat.id] || "newest";
      heading.innerHTML = `
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

      if (!cat.articles.length) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "No articles match the current filters.";
        section.appendChild(empty);
      } else {
        cat.articles.forEach((article) => section.appendChild(articleCard(article)));
      }

      content.appendChild(section);
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

    currentSessionIds = new Set();
    renderSpotlight(rawData.spotlight);
    renderSaved(buildArticleIndex(rawData));
    renderGuidelines(rawData.guidelines, term, days, studyType);
    renderTrending(rawData.trending, term, days, studyType);
    renderFoamed(rawData.foamed, term, days, studyType);
    renderCategories(rawData.categories || [], term, days, studyType);
  }

  initTheme();
  previousSeenIds = loadSeenIds();
  bookmarkedIds = loadBookmarks();

  searchInput.addEventListener("input", () => applyFiltersAndRender());
  windowFilter.addEventListener("change", () => applyFiltersAndRender());
  studyTypeFilter.addEventListener("change", () => applyFiltersAndRender());
  savedToggle.addEventListener("click", () => {
    if (!savedSection.hidden) {
      savedSection.scrollIntoView({ behavior: "smooth", block: "start" });
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
