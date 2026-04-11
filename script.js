let rawData = [];

// Robust CSV parser
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") i++;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim() !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

// Load CSV
fetch("data.csv")
  .then((res) => res.text())
  .then((text) => {
    const rows = parseCSV(text);

    if (!rows.length) {
      console.error("CSV is empty");
      return;
    }

    const headers = rows[0].map((h) => h.trim());

    rawData = rows.slice(1).map((values) => {
      const obj = {};

      headers.forEach((header, index) => {
        obj[header] = (values[index] || "").trim();
      });

      return obj;
    });

    console.log("CSV loaded:", rawData.length);
  })
  .catch((error) => {
    console.error("CSV load error:", error);
  });

// Normalize domain/url
function normalize(input) {
  if (!input) return "";

  try {
    let value = input.toLowerCase().trim();

    if (!value.startsWith("http://") && !value.startsWith("https://")) {
      value = "https://" + value;
    }

    const url = new URL(value);
    let host = url.hostname.trim();

    if (host.startsWith("www.")) {
      host = host.slice(4);
    }

    return host.replace(/\/$/, "");
  } catch {
    return input
      .toLowerCase()
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0]
      .replace(/\/$/, "");
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeLink(url) {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("mailto:")
  ) {
    return trimmed;
  }

  return "https://" + trimmed;
}

function findMatch(query) {
  return rawData.find((row) => {
    const domains = [
      row["Domain 1"],
      row["Domain 2"],
      row["Domain 3"],
      row["Domain 4"],
      row["Domain 5"],
      row["Domain 6"]
    ];

    return domains.some((domain) => normalize(domain) === query);
  });
}

function renderField(label, value, type = "text") {
  if (!value || !value.trim()) return "";

  let content = escapeHtml(value);

  if (type === "link") {
    const href = safeLink(value);
    content = `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(value)}</a>`;
  }

  if (type === "email") {
    const href = "mailto:" + value.trim();
    content = `<a href="${escapeHtml(href)}">${escapeHtml(value)}</a>`;
  }

  return `
    <div style="margin-bottom:14px;">
      <div style="font-size:12px; letter-spacing:0.06em; text-transform:uppercase; color:var(--muted); margin-bottom:4px;">
        ${escapeHtml(label)}
      </div>
      <div style="color:var(--text); line-height:1.6; word-break:break-word;">
        ${content}
      </div>
    </div>
  `;
}

function renderSection(title, fieldsHtml) {
  if (!fieldsHtml.trim()) return "";

  return `
    <div class="section">
      <h2 style="margin-top:0;">${escapeHtml(title)}</h2>
      ${fieldsHtml}
    </div>
  `;
}

function renderResult(query, row) {
  const resultsDiv = document.getElementById("results");

  if (!row) {
    resultsDiv.innerHTML = "";
    return;
  }

  const matchedSection = `
    <div class="section">
      <div style="font-size:12px; letter-spacing:0.06em; text-transform:uppercase; color:var(--muted); margin-bottom:8px;">
        Matched Domain
      </div>
      <div style="font-size:22px; font-weight:700; color:var(--text); word-break:break-word;">
        ${escapeHtml(query)}
      </div>
    </div>
  `;

  const locationHtml =
    renderField("Location", row["location"]) +
    renderField("Country Code", row["country_code"]);

  const storeDetailsHtml =
    renderField("Created At", row["created_at"]) +
    renderField("Currency Code", row["currency_code"]) +
    renderField("Language Code", row["language_code"]);

  const pagesHtml =
    renderField("Contact Page", row["contact_page"], "link") +
    renderField("Financing Page", row["financing_page"], "link") +
    renderField("FAQ Page", row["faq_page"], "link") +
    renderField("About Us", row["about_us"], "link");

  const socialHtml =
    renderField("Facebook", row["Facebook"], "link") +
    renderField("Instagram", row["Instagram"], "link") +
    renderField("Email", row["Email"], "email");

  resultsDiv.innerHTML = `
    ${matchedSection}
    ${renderSection("Location", locationHtml)}
    ${renderSection("Store Details", storeDetailsHtml)}
    ${renderSection("Pages", pagesHtml)}
    ${renderSection("Social & Contact", socialHtml)}
  `;
}

function runSearch() {
  const input = document.getElementById("searchInput").value;
  const query = normalize(input);

  if (!query) {
    document.getElementById("results").innerHTML = "";
    return;
  }

  const result = findMatch(query);
  renderResult(query, result);
}

document.getElementById("searchBtn").addEventListener("click", runSearch);

document.getElementById("searchInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    runSearch();
  }
});
