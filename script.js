const elements = {
  input: document.getElementById("searchInput"),
  button: document.getElementById("searchBtn"),
  results: document.getElementById("results"),
  feedback: document.getElementById("feedback"),
};

const DEFAULT_SEARCH_ENDPOINTS = [
  "/api/search",
  "https://welookup-website.pages.dev/api/search",
];
const REQUEST_TIMEOUT_MS = 2200;
let preferredEndpoint = "";

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
    setFeedback(`No matching shop found for "${query}". Try another domain or store title.`);
    return;
  }

  setFeedback(
    `Found ${items.length} matching shop${items.length > 1 ? "s" : ""} for "${normalizedQuery}".`
  );

  const cardsHtml = items
    .map((shop) => {
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

          ${
            domainChips
              ? `<div class="meta-label">Domains</div><div class="chips">${domainChips}</div>`
              : ""
          }
          ${
            linksHtml
              ? `<div class="meta-label" style="margin-top:10px;">Links</div><div class="chips">${linksHtml}</div>`
              : ""
          }

          ${
            shop.description
              ? `<p class="result-description">${escapeHtml(shop.description).slice(0, 420)}</p>`
              : ""
          }
        </article>
      `;
    })
    .join("");

  elements.results.innerHTML = cardsHtml;
}

async function runSearch() {
  const query = normalizeQuery(elements.input.value);
  if (!query) {
    elements.results.innerHTML = "";
    setFeedback("Enter a domain or title to begin.");
    return;
  }

  if (query.length < 2) {
    elements.results.innerHTML = "";
    setFeedback("Type at least 2 characters.");
    return;
  }

  elements.button.disabled = true;
  setFeedback("Searching...", false);

  try {
    let payload = null;
    let lastError = null;
    const endpoints = buildEndpointOrder();

    for (const baseUrl of endpoints) {
      try {
        const response = await fetchWithTimeout(
          `${baseUrl}?q=${encodeURIComponent(query)}`,
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

    renderResults(payload.results || [], query, payload.normalizedQuery || query);
  } catch (error) {
    elements.results.innerHTML = "";
    setFeedback(
      "Search is temporarily unavailable. Please try again in a few moments.",
      true
    );
    console.error(error);
  } finally {
    elements.button.disabled = false;
  }
}

elements.button.addEventListener("click", runSearch);
elements.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter") runSearch();
});

setFeedback("Enter a query to start exploring Shopify store data.");
