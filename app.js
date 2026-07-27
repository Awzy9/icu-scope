(function () {
  const nav = document.getElementById("category-nav");
  const content = document.getElementById("content");
  const updatedLine = document.getElementById("updated-line");
  const trendingSection = document.getElementById("trending-section");
  const trendingList = document.getElementById("trending-list");
  const trendingCount = document.getElementById("trending-count");
  const themeToggle = document.getElementById("theme-toggle");

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

  function formatUpdatedAt(iso, windowDays) {
    if (!iso) return "";
    const d = new Date(iso);
    const formatted = d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    return `Last updated ${formatted} · showing articles from the last ${windowDays} day${windowDays === 1 ? "" : "s"}`;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function articleCard(article, opts) {
    opts = opts || {};
    const authors = article.authors && article.authors.length
      ? article.authors.slice(0, 4).join(", ") + (article.authors.length > 4 ? ", et al." : "")
      : "Authors unavailable";
    const doiLink = article.doi
      ? `<a href="https://doi.org/${encodeURIComponent(article.doi)}" target="_blank" rel="noopener">DOI</a>`
      : "";
    const abstractBlock = article.abstract
      ? `<p class="article-abstract">${escapeHtml(article.abstract)}</p>
         <button class="abstract-toggle" type="button">Show more</button>`
      : "";
    const citationBadge = opts.showCitations && article.citation_count > 0
      ? `<span class="citation-badge">cited ${article.citation_count}×</span>`
      : "";

    const card = document.createElement("article");
    card.className = "article-card";
    card.innerHTML = `
      <h3 class="article-title"><a href="${article.url}" target="_blank" rel="noopener">${escapeHtml(article.title)}</a>${citationBadge}</h3>
      <div class="article-meta">
        <span class="journal">${escapeHtml(article.journal || "")}</span> · ${escapeHtml(article.pubdate || "")}<br/>
        ${escapeHtml(authors)}
      </div>
      ${abstractBlock}
      <div class="article-links">
        <a href="${article.url}" target="_blank" rel="noopener">PubMed</a>
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

  function renderTrending(trending) {
    const articles = (trending && trending.articles) || [];
    if (!articles.length) {
      trendingSection.hidden = true;
      return;
    }
    trendingSection.hidden = false;
    trendingCount.textContent = `${articles.length} article${articles.length === 1 ? "" : "s"} · last ${trending.window_days} days`;
    trendingList.innerHTML = "";
    articles.forEach((article) => trendingList.appendChild(articleCard(article, { showCitations: true })));
  }

  function render(data) {
    updatedLine.textContent = formatUpdatedAt(data.generated_at, data.window_days);
    renderTrending(data.trending);

    nav.innerHTML = "";
    content.innerHTML = "";

    const categoriesWithArticles = data.categories || [];

    categoriesWithArticles.forEach((cat, idx) => {
      const chip = document.createElement("button");
      chip.className = "nav-chip" + (idx === 0 ? " active" : "");
      chip.textContent = `${cat.abbr} (${cat.articles.length})`;
      chip.addEventListener("click", () => {
        document.getElementById(`cat-${cat.id}`).scrollIntoView({ behavior: "smooth", block: "start" });
      });
      nav.appendChild(chip);

      const section = document.createElement("section");
      section.className = "category-section";
      section.id = `cat-${cat.id}`;

      const heading = document.createElement("div");
      heading.className = "category-heading";
      heading.innerHTML = `<h2>${escapeHtml(cat.label)}</h2><span class="category-count">${cat.articles.length} article${cat.articles.length === 1 ? "" : "s"}</span>`;
      section.appendChild(heading);

      if (!cat.articles.length) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "No new articles in this window.";
        section.appendChild(empty);
      } else {
        cat.articles.forEach((article) => section.appendChild(articleCard(article)));
      }

      content.appendChild(section);
    });

    if (nav.children.length) {
      const onScroll = () => {
        let currentId = null;
        for (const cat of categoriesWithArticles) {
          const el = document.getElementById(`cat-${cat.id}`);
          if (el && el.getBoundingClientRect().top <= 80) {
            currentId = cat.id;
          }
        }
        [...nav.children].forEach((chip, idx) => {
          chip.classList.toggle("active", categoriesWithArticles[idx] && categoriesWithArticles[idx].id === currentId);
        });
      };
      document.addEventListener("scroll", onScroll, { passive: true });
    }
  }

  initTheme();

  fetch("data/articles.json", { cache: "no-store" })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(render)
    .catch((err) => {
      content.innerHTML = `<p class="empty">Couldn't load article data (${escapeHtml(err.message)}).</p>`;
    });
})();
