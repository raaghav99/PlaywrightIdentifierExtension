/** Playwright Test Identifier - Excel Module v5.1
 * Builds and downloads the .xlsx report.
 * Reads from pw_reports via getReport() for the active report only.
 * Depends on: esc, showToast, getReport from content.js / ui.js,
 *             and the XLSX global (xlsx.min.js). */

/**
 * downloadExcel()
 * ---------------
 * Reads the current report from storage, merges scraped tests with their
 * labels, builds a two-sheet Excel workbook, and downloads it as a .xlsx file.
 *
 * Triggered by: clicking #pw-download-btn in the header.
 * Dependency: global XLSX object from xlsx.min.js (SheetJS community edition).
 *
 * Data flow:
 *   getReport() → report.scraped[] + report.labels{} →
 *   merge by "SC|Name" key → allRows[] → Summary sheet + Details sheet →
 *   XLSX.writeFile()
 *
 * Input data shapes:
 *
 *   report.scraped[] = [{
 *     id, sc, name, result, testId
 *   }]
 *   — authoritative list of ALL tests on the page, scraped by scrapeAllTests()
 *
 *   report.labels{} = {
 *     "SC_015|Cart - View Cart list...": {
 *       label, category, owner, jira,
 *       labelDate: "DD/MM",      — user-set date shown in label column
 *       timestamp: ISO string    — when the entry was saved
 *     }
 *   }
 *   — only tests the user has labeled
 *
 * Output: "identifier-report-YYYY-MM-DD.xlsx" downloaded via browser.
 *
 * Sheet 1 — Summary:
 *   Title, generation date, report URL
 *   Total/Labelled/Unlabelled counts
 *   Breakdown by Result (PASS/FAIL count)
 *   Breakdown by Category (labeled only)
 *   Breakdown by Owner (labeled only)
 *
 * Sheet 2 — Details:
 *   Columns: SC No | Scenario Name | Result | Label | Category | Owner | Jira
 *   All tests included (labeled and unlabeled)
 *   Sorted by SC number ascending (non-SC rows sort to end)
 *   Result column colour-coded: PASS=green, FAIL=red
 *
 * KNOWN ISSUE: Cell styles (.s property) in SheetJS community edition
 * require { cellStyles: true } in writeFile options (already set here).
 * However, full style support (fill colors, fonts) may need SheetJS Pro.
 * If the exported file shows no colors, this is a SheetJS CE limitation.
 * — TO REVIEW: verify style output on different environments.
 *
 * NOTE: Label column value = "DD/MM: label text" if labelDate is set,
 * otherwise just the label text. The date prefix comes from the date picker
 * the user set when saving the entry, not the save timestamp.
 */
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
          label:     (lbl.labelDate ? lbl.labelDate + ": " : "") + (lbl.label || ""),
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
    /*
     * catCount, ownCount, resCount: built by iterating allRows.
     * Only labeled rows (those with a label string) contribute to catCount/ownCount.
     * All rows contribute to resCount regardless of label status.
     */
    var catCount = {}, ownCount = {}, resCount = {};
    allRows.forEach(function (e) {
      var res = e.result || "UNKNOWN";
      resCount[res] = (resCount[res] || 0) + 1;
      if (e.label) {
        catCount[e.category || "Uncategorised"] = (catCount[e.category || "Uncategorised"] || 0) + 1;
        ownCount[e.owner || "Unassigned"]       = (ownCount[e.owner || "Unassigned"] || 0) + 1;
      }
    });

    /*
     * summaryRows: array of arrays (rows of cells).
     * XLSX.utils.aoa_to_sheet() converts this to a worksheet.
     * Empty arrays [] produce blank rows for spacing.
     * Object.entries().sort() produces [label, count] pairs sorted by count desc.
     */
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
    var header = ["SC No", "Scenario Name", "Result", "Label", "Category", "Owner", "Jira"];
    var rows = allRows.map(function (e) {
      return [
        e.sc,
        e.name,
        e.result,
        e.label,
        e.category,
        e.owner,
        e.jira
      ];
    });
    var wsDetails = XLSX.utils.aoa_to_sheet([header].concat(rows));
    wsDetails["!cols"] = [
      { width: 12 }, { width: 48 }, { width: 10 }, { width: 28 },
      { width: 18 }, { width: 18 }, { width: 14 }
    ];

    /*
     * Header row styling — applied to row 1 (A1 through G1).
     * White bold text on dark grey background, centered.
     * Cell ref format: "A1", "B1", etc.
     */
    ["A","B","C","D","E","F","G"].forEach(function (col) {
      var ref = col + "1";
      if (wsDetails[ref]) wsDetails[ref].s = {
        font:      { bold: true, color: { rgb: "FFFFFF" } },
        fill:      { fgColor: { rgb: "374151" } },
        alignment: { horizontal: "center" }
      };
    });

    /*
     * Result cell colour coding — applied to column C (index 2), rows 2+.
     * XLSX.utils.decode_range parses the sheet's !ref (e.g. "A1:G99") into
     * { s: {r,c}, e: {r,c} } (start/end row+col, 0-indexed).
     * We iterate R from 1 (skip header row 0) to range.e.r (last row).
     * encode_cell({r, c:2}) gives the cell address string e.g. "C5".
     */
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

    /*
     * File name: "identifier-report-YYYY-MM-DD.xlsx"
     * { cellStyles: true } is required for SheetJS to include the .s style
     * objects in the output. Without this option all styling is stripped.
     */
    var now = new Date();
    var dateStr = now.getFullYear() + "-" +
      String(now.getMonth() + 1).padStart(2, "0") + "-" +
      String(now.getDate()).padStart(2, "0");
    XLSX.writeFile(wb, "identifier-report-" + dateStr + ".xlsx", { cellStyles: true });
    showToast("Exported " + allRows.length + " tests (" + labelledCount + " labelled)", "success");
  });
}
