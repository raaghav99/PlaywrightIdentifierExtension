/** Playwright Test Identifier - Excel Module v5.1
 * Builds and downloads the .xlsx report.
 * Reads from pw_reports via getReport() for the active report only.
 * Depends on: esc, showToast, getReport from content.js / ui.js,
 *             and the XLSX global (xlsx.min.js). */

function downloadExcel() {
  if (typeof XLSX === "undefined") {
    showToast("XLSX not loaded", "error");
    return;
  }

  getReport(function (report) {
    var scraped = report.scraped || [];
    var labels  = report.labels || {};

    if (!scraped.length) {
      showToast("No tests found to export. Scrape first.", "warning");
      return;
    }

    var allRows = [];
    var labelledCount = 0;

    /* Use scraped as authoritative list, enrich with labels via O(1) lookup */
    scraped.forEach(function (s) {
      var key = s.sc + "|" + s.name;
      var lbl = labels[key];
      if (lbl) {
        allRows.push({
          sc:        s.sc,
          name:      s.name,
          result:    s.result,
          label:     lbl.label || "",
          category:  lbl.category || "",
          owner:     lbl.owner || "",
          jira:      lbl.jira || "",
          timestamp: lbl.timestamp
        });
        labelledCount++;
      } else {
        allRows.push({
          sc:        s.sc,
          name:      s.name,
          result:    s.result,
          label:     "",
          category:  "",
          owner:     "",
          jira:      "",
          timestamp: null
        });
      }
    });

    /* Sort by SC ascending */
    allRows.sort(function (a, b) {
      var aNum = parseInt((a.sc || "").replace(/\D/g, ""), 10) || 99999;
      var bNum = parseInt((b.sc || "").replace(/\D/g, ""), 10) || 99999;
      return aNum - bNum;
    });

    var wb = XLSX.utils.book_new();

    /* ── Summary Sheet ── */
    var catCount = {}, ownCount = {}, resCount = {};
    allRows.forEach(function (e) {
      var res = e.result || "UNKNOWN";
      resCount[res] = (resCount[res] || 0) + 1;
      if (e.label) {
        catCount[e.category || "Uncategorised"] = (catCount[e.category || "Uncategorised"] || 0) + 1;
        ownCount[e.owner || "Unassigned"]       = (ownCount[e.owner || "Unassigned"] || 0) + 1;
      }
    });

    var summaryRows = [
      ["Playwright Identifier Report"],
      ["Generated:", new Date().toLocaleString()],
      ["Report URL:", report.url || "Unknown"],
      [],
      ["Total Tests", allRows.length],
      ["Labelled", labelledCount],
      ["Unlabelled", allRows.length - labelledCount],
      [],
      ["By Result", "Count"]
    ].concat(Object.entries(resCount).sort(function (a, b) { return b[1] - a[1]; }))
     .concat([[], ["By Category", "Count"]])
     .concat(Object.entries(catCount).sort(function (a, b) { return b[1] - a[1]; }))
     .concat([[], ["By Owner", "Count"]])
     .concat(Object.entries(ownCount).sort(function (a, b) { return b[1] - a[1]; }));

    var wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSummary["!cols"] = [{ width: 28 }, { width: 14 }];
    if (wsSummary["A1"]) {
      wsSummary["A1"].s = {
        font: { bold: true, size: 14, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "2563EB" } }
      };
    }
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

    /* ── Details Sheet ── */
    var header = ["SC No", "Scenario Name", "Result", "Label", "Category", "Owner", "Jira", "Timestamp"];
    var rows = allRows.map(function (e) {
      return [
        e.sc,
        e.name,
        e.result,
        e.label,
        e.category,
        e.owner,
        e.jira,
        e.timestamp ? new Date(e.timestamp).toLocaleString() : ""
      ];
    });
    var wsDetails = XLSX.utils.aoa_to_sheet([header].concat(rows));
    wsDetails["!cols"] = [
      { width: 12 }, { width: 48 }, { width: 10 }, { width: 28 },
      { width: 18 }, { width: 18 }, { width: 14 }, { width: 20 }
    ];

    /* Header row styling */
    ["A","B","C","D","E","F","G","H"].forEach(function (col) {
      var ref = col + "1";
      if (wsDetails[ref]) wsDetails[ref].s = {
        font:      { bold: true, color: { rgb: "FFFFFF" } },
        fill:      { fgColor: { rgb: "374151" } },
        alignment: { horizontal: "center" }
      };
    });

    /* Result cell colour coding */
    var range = XLSX.utils.decode_range(wsDetails["!ref"]);
    for (var R = 1; R <= range.e.r; R++) {
      var cellRef = XLSX.utils.encode_cell({ r: R, c: 2 });
      var cell    = wsDetails[cellRef];
      if (!cell) continue;
      var val = (cell.v || "").toUpperCase();
      if (val === "PASS" || val === "PASSED") {
        cell.s = { fill: { fgColor: { rgb: "C6EFCE" } }, font: { color: { rgb: "166534" }, bold: true }, alignment: { horizontal: "center" } };
      } else if (val === "FAIL" || val === "FAILED") {
        cell.s = { fill: { fgColor: { rgb: "FEE2E2" } }, font: { color: { rgb: "991B1B" }, bold: true }, alignment: { horizontal: "center" } };
      }
    }
    XLSX.utils.book_append_sheet(wb, wsDetails, "Details");

    var now = new Date();
    var dateStr = now.getFullYear() + "-" +
      String(now.getMonth() + 1).padStart(2, "0") + "-" +
      String(now.getDate()).padStart(2, "0");
    XLSX.writeFile(wb, "identifier-report-" + dateStr + ".xlsx", { cellStyles: true });
    showToast("Exported " + allRows.length + " tests (" + labelledCount + " labelled)", "success");
  });
}
