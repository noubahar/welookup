const elements = {
  input: document.getElementById("searchInput"),
  button: document.getElementById("searchBtn"),
  results: document.getElementById("results"),
  feedback: document.getElementById("feedback"),
  controls: document.getElementById("resultsControls"),
  prevPageBtn: document.getElementById("prevPageBtn"),
  nextPageBtn: document.getElementById("nextPageBtn"),
  pageInfo: document.getElementById("pageInfo"),
};

const DEFAULT_SEARCH_ENDPOINTS = [
  "/api/search",
  "https://welookup-website.pages.dev/api/search",
];
/** D1 search can take several seconds (cold start + parallel queries); keep above typical latency. */
const REQUEST_TIMEOUT_MS = 45000;
const DEFAULT_LIMIT = 10;
let preferredEndpoint = "";
const state = {
  query: "",
  normalizedQuery: "",
  page: 1,
  limit: DEFAULT_LIMIT,
  hasMore: false,
  loading: false,
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeQuery(input) {
  if (!input) return "";
  return String(input).trim();
}

function safeExternalLink(value) {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("mailto:")
  ) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function pickTopDomains(domains) {
  return (domains || [])
    .map((d) => d.domain)
    .filter(Boolean)
    .slice(0, 8);
}

function pickTopLinks(links) {
  const preferred = (links || []).filter((item) =>
    ["contact_info[].value", "contact_page", "about_us", "faq_page"].includes(item.source)
  );
  return preferred.slice(0, 6);
}

function setFeedback(message, isError = false) {
  elements.feedback.className = isError ? "search-feedback error" : "search-feedback";
  elements.feedback.textContent = message || "";
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildEndpointOrder() {
  if (preferredEndpoint) {
    return [preferredEndpoint, ...DEFAULT_SEARCH_ENDPOINTS.filter((x) => x !== preferredEndpoint)];
  }

  // welookup.info is currently served by GitHub Pages, so skip /api there.
  if (location.hostname === "welookup.info" || location.hostname === "www.welookup.info") {
    return [
      "https://welookup-website.pages.dev/api/search",
      "/api/search",
    ];
  }

  return DEFAULT_SEARCH_ENDPOINTS;
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function renderResults(items, query, normalizedQuery) {
  if (!items.length) {
    elements.results.innerHTML = "";
    elements.controls.style.display = "none";
    setFeedback(`No matching shop found for "${query}". Try another domain or store title.`);
    return;
  }
}

function buildCardHtml(shop) {
  const domainChips = pickTopDomains(shop.domains)
    .map((domain) => `<span class="chip">${escapeHtml(domain)}</span>`)
    .join("");

  const linksHtml = pickTopLinks(shop.links)
    .map((item) => {
      const href = safeExternalLink(item.link);
      const label = item.type || item.source || "link";
      return `<a class="chip" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
    })
    .join("");

  return `
    <article class="result-card">
      <div class="result-head">
        <h2 class="result-title">${escapeHtml(shop.title || shop.platform_domain || "Shop Profile")}</h2>
        <span class="pill">${escapeHtml(shop.platform || "shopify")}</span>
      </div>

      <p class="result-sub">${escapeHtml(shop.platform_domain || "No platform domain available")}</p>

      <div class="meta-grid">
        <div class="meta-item">
          <div class="meta-label">Location</div>
          <div class="meta-value">${escapeHtml(shop.location || "—")}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Country</div>
          <div class="meta-value">${escapeHtml(shop.country_code || "—")}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Language</div>
          <div class="meta-value">${escapeHtml(shop.language_code || "—")}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Currency</div>
          <div class="meta-value">${escapeHtml(shop.currency_code || "—")}</div>
        </div>
      </div>

      ${domainChips ? `<div class="meta-label">Domains</div><div class="chips">${domainChips}</div>` : ""}
      ${linksHtml ? `<div class="meta-label" style="margin-top:10px;">Links</div><div class="chips">${linksHtml}</div>` : ""}
      ${shop.description ? `<p class="result-description">${escapeHtml(shop.description).slice(0, 420)}</p>` : ""}
    </article>
  `;
}

async function progressiveRenderResults(items) {
  elements.results.innerHTML = "";
  for (let i = 0; i < items.length; i += 1) {
    elements.results.insertAdjacentHTML("beforeend", buildCardHtml(items[i]));
    if (i < 3) {
      // Fast first paint for perceived responsiveness.
      await waitMs(25);
    } else {
      await waitMs(12);
    }
  }
}

function updateControls() {
  const hasResults = elements.results.children.length > 0;
  elements.controls.style.display = hasResults ? "flex" : "none";
  elements.prevPageBtn.disabled = state.loading || state.page <= 1;
  elements.nextPageBtn.disabled = state.loading || !state.hasMore;
  elements.pageInfo.textContent = `Page ${state.page}`;
}

async function runSearch(targetPage = 1) {
  const query = normalizeQuery(elements.input.value);
  if (!query) {
    elements.results.innerHTML = "";
    elements.controls.style.display = "none";
    setFeedback("Enter a domain or title to begin.");
    return;
  }

  if (query.length < 2) {
    elements.results.innerHTML = "";
    elements.controls.style.display = "none";
    setFeedback("Type at least 2 characters.");
    return;
  }

  state.query = query;
  state.page = targetPage;
  state.loading = true;
  elements.button.disabled = true;
  updateControls();
  setFeedback(`Searching page ${state.page}...`, false);

  try {
    let payload = null;
    let lastError = null;
    const endpoints = buildEndpointOrder();

    for (const baseUrl of endpoints) {
      try {
        const response = await fetchWithTimeout(
          `${baseUrl}?q=${encodeURIComponent(query)}&page=${state.page}&limit=${state.limit}`,
          REQUEST_TIMEOUT_MS
        );
        if (!response.ok) {
          throw new Error(`Search API failed (${response.status}) at ${baseUrl}`);
        }
        payload = await response.json();
        preferredEndpoint = baseUrl;
        break;
      } catch (endpointError) {
        lastError = endpointError;
      }
    }

    if (!payload) {
      throw lastError || new Error("All search endpoints failed");
    }

    state.normalizedQuery = payload.normalizedQuery || query;
    state.page = Number(payload.page) || state.page;
    state.limit = Number(payload.limit) || state.limit;
    state.hasMore = Boolean(payload.has_more);

    const results = payload.results || [];
    if (!results.length) {
      elements.results.innerHTML = "";
      elements.controls.style.display = "none";
      setFeedback(`No matching shop found for "${query}". Try another domain or store title.`);
      return;
    }

    setFeedback(
      `Showing ${results.length} result${results.length > 1 ? "s" : ""} on page ${state.page} for "${state.normalizedQuery}".`,
      false
    );
    await progressiveRenderResults(results);
    updateControls();
  } catch (error) {
    elements.results.innerHTML = "";
    elements.controls.style.display = "none";
    const timedOut = error && error.name === "AbortError";
    setFeedback(
      timedOut
        ? "Search timed out before results arrived. Please try again."
        : "Search is temporarily unavailable. Please try again in a few moments.",
      true
    );
    console.error(error);
  } finally {
    state.loading = false;
    elements.button.disabled = false;
    updateControls();
  }
}

elements.button.addEventListener("click", () => runSearch(1));
elements.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter") runSearch(1);
});
elements.prevPageBtn.addEventListener("click", () => {
  if (state.page > 1 && !state.loading) runSearch(state.page - 1);
});
elements.nextPageBtn.addEventListener("click", () => {
  if (state.hasMore && !state.loading) runSearch(state.page + 1);
});

setFeedback("Enter a query to start exploring Shopify store data.");
