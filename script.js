let rawData = [];

// Load CSV
fetch("data.csv")
  .then((res) => res.text())
  .then((text) => {
    const rows = text
      .split("\n")
      .map((row) => row.trim())
      .filter((row) => row);

    const headers = rows[0].split(",").map((h) => h.trim());

    rawData = rows.slice(1).map((row) => {
      const values = row.split(",");
      const obj = {};

      headers.forEach((header, index) => {
        obj[header] = values[index]?.trim() || "";
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

// Find matching row
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

// Render result
function renderResult(query, row) {
  const resultsDiv = document.getElementById("results");

  if (!row) {
    resultsDiv.innerHTML = "";
    return;
  }

  const storeDetails = [
    ["Created At", row["created_at"]],
    ["Currency Code", row["currency_code"]],
    ["Language Code", row["language_code"]]
  ];

  const pages = [
    ["Contact Page", row["contact_page"]],
    ["Financing Page", row["financing_page"]],
    ["FAQ Page", row["faq_page"]],
    ["About Us", row["about_us"]]
  ];

  const social = [
    ["Facebook", row["Facebook"]],
    ["Instagram", row["Instagram"]],
    ["Email", row["Email"]]
  ];

  function renderItems(items, isLink = false, isEmail = false) {
    return items
      .filter(([, value]) => value && value.trim() !== "")
      .map(([label, value]) => {
        let content = value;

        if (isEmail) {
          content = `<a href="mailto:${value}" style="color: var(--accent); text-decoration: none;">${value}</a>`;
        } else if (isLink) {
          content = `<a href="${value}" target="_blank" rel="noopener noreferrer" style="color: var(--accent); text-decoration: none;">${value}</a>`;
        }

        return `
          <div style="margin-bottom:10px;">
            <strong>${label}:</strong> ${content}
          </div>
        `;
      })
      .join("");
  }

  const locationHtml = `
    ${row["location"] ? `<div style="margin-bottom:10px;"><strong>Location:</strong> ${row["location"]}</div>` : ""}
    ${row["country_code"] ? `<div style="margin-bottom:10px;"><strong>Country Code:</strong> ${row["country_code"]}</div>` : ""}
  `;

  const storeDetailsHtml = renderItems(storeDetails);
  const pagesHtml = renderItems(pages, true, false);
  const socialHtml = `
    ${renderItems(social.filter(([label]) => label !== "Email"), true, false)}
    ${renderItems(social.filter(([label]) => label === "Email"), false, true)}
  `;

  resultsDiv.innerHTML = `
    <div style="
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 18px;
      padding: 24px;
      margin-top: 24px;
    ">
      <div style="margin-bottom: 26px;">
        <h2 style="margin:0 0 10px 0;">Matched Domain</h2>
        <div style="color: var(--muted);">${query}</div>
      </div>

      ${locationHtml ? `
        <div style="margin-bottom: 24px;">
          <h3 style="margin:0 0 12px 0;">Location</h3>
          ${locationHtml}
        </div>
      ` : ""}

      ${storeDetailsHtml ? `
        <div style="margin-bottom: 24px;">
          <h3 style="margin:0 0 12px 0;">Store Details</h3>
          ${storeDetailsHtml}
        </div>
      ` : ""}

      ${pagesHtml ? `
        <div style="margin-bottom: 24px;">
          <h3 style="margin:0 0 12px 0;">Pages</h3>
          ${pagesHtml}
        </div>
      ` : ""}

      ${socialHtml ? `
        <div>
          <h3 style="margin:0 0 12px 0;">Social & Contact</h3>
          ${socialHtml}
        </div>
      ` : ""}
    </div>
  `;
}

// Run search
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

// Events
document.getElementById("searchBtn").addEventListener("click", runSearch);

document.getElementById("searchInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    runSearch();
  }
});
