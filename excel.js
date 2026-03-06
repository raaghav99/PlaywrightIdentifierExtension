/** Playwright Test Identifier - Excel Module v4.0
 * Builds and downloads the .xlsx report.
 * Merges pw_scraped (all tests) + pw_entries (labelled) for full export.
 * Depends on: esc, showToast, state, stripDatePrefix from content.js / ui.js,
 *             and the XLSX global (xlsx.min.js). */

/* ======================================================
   EXCEL DOWNLOAD
   - Merges scraped + labelled data
   - Sorts by SC ascending
   - Filters by selected date (unless "All dates")
   ====================================================== */
function downloadExcel() {
  if (typeof XLSX === "undefined") {
    showToast("XLSX not loaded", "error");
    return;
  }

  chrome.storage.local.get(["pw_entries", "pw_scraped"], function (data) {
    var entries = data.pw_entries || [];
    var scraped = data.pw_scraped || [];

    /* Build merged list: scraped as base, entries patch in labels */
    var labelledMap = {};
    entries.forEach(function (e) {
      var key = e.sc + "|" + e.name;
      if (!labelledMap[key]) labelledMap[key] = [];
      labelledMap[key].push(e);
    });

    /* Date filter for labelled entries */
    var dateFilter = null;
    if (!state.allDates && state.selectedDate) {
      dateFilter = state.selectedDate + ":";
    }

    var allRows = [];
    var labelledCount = 0;

    /* First: add all labelled entries (possibly date-filtered) */
    var usedKeys = {};
    entries.forEach(function (e) {
      if (dateFilter && (e.label || "").indexOf(dateFilter) !== 0) return;
      allRows.push(e);
      labelledCount++;
      usedKeys[e.sc + "|" + e.name] = true;
    });

    /* Second: add scraped rows that have no labelled entry */
    scraped.forEach(function (s) {
      if (usedKeys[s.id]) return;
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
    });

    if (!allRows.length) {
      showToast("No tests found to export", "warning");
      return;
    }

    /* Sort by SC ascending */
    var sorted = allRows.sort(function (a, b) {
      var aNum = parseInt((a.sc || "").replace(/\D/g, ""), 10) || 99999;
      var bNum = parseInt((b.sc || "").replace(/\D/g, ""), 10) || 99999;
      return aNum - bNum;
    });

    var wb = XLSX.utils.book_new();

    /* ── Summary Sheet ── */
    var catCount = {}, ownCount = {}, resCount = {};
    sorted.forEach(function (e) {
      var res = e.result || "UNKNOWN";
      resCount[res] = (resCount[res] || 0) + 1;
      if (e.label) {
        var cat = e.category || "Uncategorised";
        var own = e.owner    || "Unassigned";
        catCount[cat] = (catCount[cat] || 0) + 1;
        ownCount[own] = (ownCount[own] || 0) + 1;
      }
    });

    var summaryRows = [
      ["Playwright Identifier Report"],
      ["Generated:", new Date().toLocaleString()],
      dateFilter ? ["Date Filter:", state.selectedDate] : [],
      [],
      ["Total Tests", sorted.length],
      ["Labelled", labelledCount],
      ["Unlabelled", sorted.length - labelledCount],
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
    var header = ["SC No", "Scenario Name", "Result", "Label", "Category", "Owner", "Jira", "Labeled Date"];
    var rows = sorted.map(function (e) {
      return [
        e.sc,
        e.name,
        e.result,
        e.label || "",
        e.category || "",
        e.owner || "",
        e.jira || "",
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
      if (val === "PASSED") {
        cell.s = { fill: { fgColor: { rgb: "C6EFCE" } }, font: { color: { rgb: "166534" }, bold: true }, alignment: { horizontal: "center" } };
      } else if (val === "FAILED") {
        cell.s = { fill: { fgColor: { rgb: "FEE2E2" } }, font: { color: { rgb: "991B1B" }, bold: true }, alignment: { horizontal: "center" } };
      } else if (val === "FLAKY") {
        cell.s = { fill: { fgColor: { rgb: "FEF9C3" } }, font: { color: { rgb: "713F12" }, bold: true }, alignment: { horizontal: "center" } };
      }
    }
    XLSX.utils.book_append_sheet(wb, wsDetails, "Details");

    var dateStr = new Date().toISOString().split("T")[0];
    XLSX.writeFile(wb, "identifier-report-" + dateStr + ".xlsx");
    showToast("Exported " + sorted.length + " tests (" + labelledCount + " labelled)", "success");
  });
}
