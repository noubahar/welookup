let rawData = [];

// load CSV
fetch("data.csv")
  .then(res => res.text())
  .then(text => {
    const rows = text.split("\n").map(r => r.trim()).filter(r => r);
    const headers = rows[0].split(",");
    
    rawData = rows.slice(1).map(row => {
      const values = row.split(",");
      let obj = {};
      headers.forEach((h, i) => {
        obj[h.trim()] = values[i]?.trim() || "";
      });
      return obj;
    });

    console.log("CSV loaded:", rawData.length);
  });
// normalize domain
function normalize(input) {
  try {
    input = input.toLowerCase().trim();

    if (!input.startsWith("http")) {
      input = "https://" + input;
    }

    const url = new URL(input);
    let host = url.hostname;

    if (host.startsWith("www.")) {
      host = host.replace("www.", "");
    }

    return host;
  } catch {
    return input.toLowerCase().trim();
  }
}

// search logic
document.getElementById("searchBtn").addEventListener("click", () => {
  const input = document.getElementById("searchInput").value;
  const query = normalize(input);

  const result = rawData.find(row => {
    return [
      row["Domain 1"],
      row["Domain 2"],
      row["Domain 3"],
      row["Domain 4"],
      row["Domain 5"],
      row["Domain 6"]
    ].some(d => normalize(d) === query);
  });

  console.log("Result:", result);
});
