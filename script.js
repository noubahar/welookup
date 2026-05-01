const elements = {
  input: document.getElementById("searchInput"),
  button: document.getElementById("searchBtn"),
  results: document.getElementById("results"),
  feedback: document.getElementById("feedback"),
  controls: document.getElementById("resultsControls"),
  loadMoreBtn: document.getElementById("loadMoreBtn"),
};

const DEFAULT_SEARCH_ENDPOINTS = [
  "/api/search",
  "https://welookup-website.pages.dev/api/search",
];
/** D1 search can take several seconds (cold start + parallel queries); keep above typical latency. */
const REQUEST_TIMEOUT_MS = 45000;
const DEFAULT_LIMIT = 5;
const MAX_PAGES = 10;
let preferredEndpoint = "";
const state = {
  query: "",
  normalizedQuery: "",
  page: 1,
  limit: DEFAULT_LIMIT,
  hasMore: false,
  loading: false,
  loadedCount: 0,
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

async function progressiveRenderResults(items, append = false) {
  if (!append) {
    elements.results.innerHTML = "";
  }
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
  const hasResults = state.loadedCount > 0;
  elements.controls.style.display = hasResults ? "flex" : "none";
  elements.loadMoreBtn.disabled = state.loading || !state.hasMore || state.page >= MAX_PAGES;
  elements.loadMoreBtn.textContent = state.loading ? "Loading..." : "More";
}

async function fetchSearchPage(targetPage = 1, append = false) {
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

  if (targetPage > MAX_PAGES) return;

  state.query = query;
  state.page = targetPage;
  state.loading = true;
  if (!append) {
    elements.button.disabled = true;
    state.loadedCount = 0;
  }
  updateControls();
  setFeedback(append ? "Loading more..." : "Searching...", false);

  try {
    let payload = null;
    let lastError = null;
    const endpoints = buildEndpointOrder();

    for (const baseUrl of endpoints) {
      try {
        const response = await fetchWithTimeout(
          `${baseUrl}?q=${encodeURIComponent(query)}&page=${state.page}&limit=${state.limit}&details=0`,
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
      if (!append) {
        elements.results.innerHTML = "";
        elements.controls.style.display = "none";
      }
      setFeedback(`No matching shop found for "${query}". Try another domain or store title.`);
      return;
    }

    await progressiveRenderResults(results, append);
    state.loadedCount = elements.results.children.length;
    const moreHint =
      state.hasMore && state.page < MAX_PAGES
        ? ` Click "More" to load next ${state.limit}.`
        : " End of available results.";
    setFeedback(
      `Loaded ${state.loadedCount} result${state.loadedCount > 1 ? "s" : ""} for "${state.normalizedQuery}".${moreHint}`,
      false
    );
    updateControls();
  } catch (error) {
    if (!append) {
      elements.results.innerHTML = "";
      elements.controls.style.display = "none";
    }
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

async function runSearchFromStart() {
  elements.results.innerHTML = "";
  state.page = 1;
  state.hasMore = false;
  await fetchSearchPage(1, false);
}

elements.button.addEventListener("click", runSearchFromStart);
elements.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter") runSearchFromStart();
});
elements.loadMoreBtn.addEventListener("click", async () => {
  if (!state.loading && state.hasMore && state.page < MAX_PAGES) {
    await fetchSearchPage(state.page + 1, true);
  }
});

setFeedback("Enter a query to start exploring Shopify store data.");
