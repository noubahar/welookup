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
