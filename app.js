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
  const themeToggle = document.getElementById("theme-toggle");
  const searchInput = document.getElementById("search-input");
  const windowFilter = document.getElementById("window-filter");

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

  function articleId(article) {
    return article.pmid ? `pmid:${article.pmid}` : `url:${article.url}`;
  }

  function collectAllIds(data) {
    const ids = new Set();
    (data.trending && data.trending.articles || []).forEach((a) => ids.add(articleId(a)));
    (data.foamed && data.foamed.articles || []).forEach((a) => ids.add(`url:${a.url}`));
    (data.categories || []).forEach((c) => c.articles.forEach((a) => ids.add(articleId(a))));
    return ids;
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

  function articleCard(article) {
    const id = articleId(article);
    const isNew = !isFirstVisit && !previousSeenIds.has(id);
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

    const card = document.createElement("article");
    card.className = "article-card" + (isNew ? " is-new" : "");
    card.innerHTML = `
      <h3 class="article-title"><a href="${article.url}" target="_blank" rel="noopener">${escapeHtml(article.title)}</a>${newBadge}${topJournalBadge}${foamedBadge}${citationBadge}</h3>
      <div class="article-meta">
        <span class="journal" style="--journal-hue: ${journalHue(article.journal)}">${escapeHtml(article.journal || "")}</span> · ${escapeHtml(article.pubdate || "")}<br/>
        ${escapeHtml(authors)}
      </div>
      ${aiBlock}
      ${abstractBlock}
      <div class="article-links">
        <a href="${article.url}" target="_blank" rel="noopener">${article.is_foamed ? "Read post" : "PubMed"}</a>
        ${doiLink}
      </div>
    `;

    const toggle = card.querySelector(".abstract-toggle");
    const abstractEl = card.querySelector(".article-abstract");
    if (toggle && abstractEl) {
      toggle.addEventListener("click", () => {
        const expanded = abstractEl.classList.toggle("expanded");
        toggle.textContent = expanded ? "Show less" : "Show more";
      });
    }
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
      citation_count: 0,
      is_top_journal: false,
      is_foamed: true,
      url: item.url,
    };
  }

  function renderTrending(trending, term, days) {
    const articles = filterList((trending && trending.articles) || [], term, days);
    if (!articles.length) {
      trendingSection.hidden = true;
      return;
    }
    trendingSection.hidden = false;
    trendingCount.textContent = `${articles.length} article${articles.length === 1 ? "" : "s"} · last ${trending.window_days} days`;
    trendingList.innerHTML = "";
    articles.forEach((article) => trendingList.appendChild(articleCard(article)));
  }

  function renderFoamed(foamed, term, days) {
    const posts = filterList(((foamed && foamed.articles) || []).map(foamedToArticle), term, days);
    if (!posts.length) {
      foamedSection.hidden = true;
      return;
    }
    foamedSection.hidden = false;
    foamedCount.textContent = `${posts.length} post${posts.length === 1 ? "" : "s"} · last ${foamed.window_days} days`;
    foamedList.innerHTML = "";
    posts.forEach((item) => foamedList.appendChild(articleCard(item)));
  }

  function filterList(list, term, days) {
    return list.filter((a) => matchesSearch(a, term) && withinWindow(a, days));
  }

  function renderCategories(categories, term, days) {
    nav.innerHTML = "";
    content.innerHTML = "";

    const filtered = categories.map((cat) => ({
      ...cat,
      articles: sortArticles(categorySort[cat.id] || "newest", filterList(cat.articles, term, days)),
    }));

    filtered.forEach((cat, idx) => {
      const icon = CATEGORY_ICONS[cat.id] || "";
      const chip = document.createElement("button");
      chip.className = "nav-chip" + (idx === 0 ? " active" : "");
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
          <button type="button" class="sort-btn${mode === "newest" ? " active" : ""}" data-mode="newest">Newest</button>
          <button type="button" class="sort-btn${mode === "cited" ? " active" : ""}" data-mode="cited">Most cited</button>
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
          chip.classList.toggle("active", filtered[idx] && filtered[idx].id === currentId);
        });
      };
      document.addEventListener("scroll", scrollHandler, { passive: true });
    }
  }

  function applyFiltersAndRender() {
    if (!rawData) return;
    const term = searchInput.value.trim().toLowerCase();
    const days = windowFilter.value === "all" ? null : Number(windowFilter.value);

    currentSessionIds = new Set();
    renderTrending(rawData.trending, term, days);
    renderFoamed(rawData.foamed, term, days);
    renderCategories(rawData.categories || [], term, days);
  }

  initTheme();
  previousSeenIds = loadSeenIds();

  searchInput.addEventListener("input", () => applyFiltersAndRender());
  windowFilter.addEventListener("change", () => applyFiltersAndRender());

  fetch(`data/articles.json?t=${Date.now()}`, { cache: "no-store" })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((data) => {
      rawData = data;
      updatedLine.textContent = formatUpdatedAt(data.generated_at, data.window_days);
      applyFiltersAndRender();
      saveSeenIds(collectAllIds(data));
    })
    .catch((err) => {
      content.innerHTML = `<p class="empty">Couldn't load article data (${escapeHtml(err.message)}).</p>`;
    });
})();
