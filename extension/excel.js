/** Playwright RCA Helper - Excel Module v5.1
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

    /*
     * Build label lookup maps for O(1) matching.
     *
     * New format (v2.4+): label keys are testIds, and sc/name are stored inside labelData.
     * Old format (pre-v2.4): keys were "SC_015|Test name".
     *
     * We build two maps:
     *   byTestId  — key is testId (for new entries)
     *   byScName  — key is "SC|name" (for old entries AND new, via labelData.sc + labelData.name)
     * This ensures both old and new entries are found regardless of format.
     */
    var byTestId = {}, byScName = {};
    Object.keys(labels).forEach(function (k) {
      var lbl = labels[k];
      byTestId[k] = lbl; /* works when k is a testId */
      if (lbl.sc && lbl.name) {
        byScName[lbl.sc + "|" + lbl.name] = lbl; /* new format: sc/name in data */
      } else {
        byScName[k] = lbl; /* old format: key IS "SC|name" */
      }
    });

    /* Use scraped as authoritative list, enrich with labels via O(1) lookup */
    scraped.forEach(function (s) {
      /* Try testId key first (new format), then SC|name (old format) */
      var lbl = (s.testId ? byTestId[s.testId] : null) || byScName[s.sc + "|" + s.name];
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

    /* Sort by SC ascending; within same SC sort by name alphabetically
       (matches excelmaker.js file-alphabetical order since filenames start with SC_NNN_name) */
    allRows.sort(function (a, b) {
      var aNum = parseInt((a.sc || "").replace(/\D/g, ""), 10) || 99999;
      var bNum = parseInt((b.sc || "").replace(/\D/g, ""), 10) || 99999;
      if (aNum !== bNum) return aNum - bNum;
      return (a.name || "").localeCompare(b.name || "");
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
      ["Playwright RCA Helper — Report"],
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
    XLSX.writeFile(wb, "rca-report-" + dateStr + ".xlsx", { cellStyles: true });
    showToast("Exported " + allRows.length + " tests (" + labelledCount + " labelled)", "success");
  });
}

/**
 * downloadMultiBannerExcel()
 * --------------------------
 * Exports a combined workbook for all banners that share the same
 * environment + build number as the current Jenkins URL.
 *
 * Requires:
 *   - Current URL matches Jenkins pattern (env/banner/build/html-report)
 *   - At least one banner's report in pw_reports has labels
 *
 * Sheet layout:
 *   - One "Details" sheet per banner (same columns as downloadExcel)
 *   - One "Summary" sheet: all tests across all banners
 *     Columns: Banner | SC No | Scenario Name | Result | Label | Category | Owner | Jira
 *
 * File name: "rca-multi-YYYY-MM-DD.xlsx"
 */
function downloadMultiBannerExcel() {
  if (typeof XLSX === "undefined") {
    showToast("XLSX not loaded", "error");
    return;
  }

  var currentParsed = parseJenkinsUrl(location.href);
  if (!currentParsed) {
    showToast("Multi-export requires a Jenkins URL", "warning");
    return;
  }

  chrome.storage.local.get(["pw_reports"], function (data) {
    var allReports = data.pw_reports || {};

    /* Collect all reports for same env + buildNumber that have labels */
    var bannerReports = [];
    Object.keys(allReports).forEach(function (url) {
      var report = allReports[url];
      var parsed = parseJenkinsUrl(report.url || "");
      if (!parsed) return;
      if (parsed.environment !== currentParsed.environment) return;
      if (parsed.buildNumber !== currentParsed.buildNumber) return;
      if (!report.labels || !Object.keys(report.labels).length) return;
      bannerReports.push({ banner: parsed.banner, report: report });
    });

    if (!bannerReports.length) {
      showToast("No labelled banners found for this build", "warning");
      return;
    }

    /* Sort banners alphabetically */
    bannerReports.sort(function (a, b) { return a.banner.localeCompare(b.banner); });

    var wb          = XLSX.utils.book_new();
    var summaryRows = [];
    var totalTests  = 0;
    var totalLabels = 0;

    bannerReports.forEach(function (br) {
      var report  = br.report;
      var scraped = report.scraped || [];
      var labels  = report.labels  || {};

      /* Build lookup maps (same logic as downloadExcel) */
      var byTestId = {}, byScName = {};
      Object.keys(labels).forEach(function (k) {
        var lbl = labels[k];
        byTestId[k] = lbl;
        if (lbl.sc && lbl.name) { byScName[lbl.sc + "|" + lbl.name] = lbl; }
        else                    { byScName[k] = lbl; }
      });

      var sheetRows    = [];
      var labelledHere = 0;
      scraped.forEach(function (s) {
        var lbl = (s.testId ? byTestId[s.testId] : null) || byScName[s.sc + "|" + s.name];
        var row = {
          sc:       s.sc,
          name:     s.name,
          result:   s.result,
          label:    lbl ? ((lbl.labelDate ? lbl.labelDate + ": " : "") + (lbl.label || "")) : "",
          category: lbl ? (lbl.category || "") : "",
          owner:    lbl ? (lbl.owner || "")    : "",
          jira:     lbl ? (lbl.jira || "")     : ""
        };
        sheetRows.push(row);
        if (lbl) labelledHere++;
        /* Add to cross-banner summary */
        summaryRows.push([br.banner, s.sc, s.name, s.result, row.label, row.category, row.owner, row.jira]);
      });

      sheetRows.sort(function (a, b) {
        var aNum = parseInt((a.sc || "").replace(/\D/g, ""), 10) || 99999;
        var bNum = parseInt((b.sc || "").replace(/\D/g, ""), 10) || 99999;
        return aNum !== bNum ? aNum - bNum : (a.name || "").localeCompare(b.name || "");
      });

      totalTests  += scraped.length;
      totalLabels += labelledHere;

      /* Per-banner Details sheet */
      var header = ["SC No", "Scenario Name", "Result", "Label", "Category", "Owner", "Jira"];
      var ws = XLSX.utils.aoa_to_sheet([header].concat(sheetRows.map(function (r) {
        return [r.sc, r.name, r.result, r.label, r.category, r.owner, r.jira];
      })));
      ws["!cols"] = [
        { width: 12 }, { width: 48 }, { width: 10 }, { width: 28 },
        { width: 18 }, { width: 18 }, { width: 14 }
      ];
      /* Header row style */
      ["A","B","C","D","E","F","G"].forEach(function (col) {
        var ref = col + "1";
        if (ws[ref]) ws[ref].s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "374151" } },
          alignment: { horizontal: "center" }
        };
      });
      /* Truncate sheet name to 31 chars (Excel limit) */
      var sheetName = br.banner.slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    /* Cross-banner Summary sheet */
    var summaryHeader = ["Banner", "SC No", "Scenario Name", "Result", "Label", "Category", "Owner", "Jira"];
    summaryRows.sort(function (a, b) {
      return a[0].localeCompare(b[0]) ||
        (parseInt((a[1] || "").replace(/\D/g, ""), 10) || 99999) -
        (parseInt((b[1] || "").replace(/\D/g, ""), 10) || 99999);
    });
    var wsSummary = XLSX.utils.aoa_to_sheet([summaryHeader].concat(summaryRows));
    wsSummary["!cols"] = [
      { width: 18 }, { width: 12 }, { width: 44 }, { width: 10 },
      { width: 28 }, { width: 18 }, { width: 18 }, { width: 14 }
    ];
    ["A","B","C","D","E","F","G","H"].forEach(function (col) {
      var ref = col + "1";
      if (wsSummary[ref]) wsSummary[ref].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "2563EB" } },
        alignment: { horizontal: "center" }
      };
    });
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

    var now     = new Date();
    var dateStr = now.getFullYear() + "-" +
      String(now.getMonth() + 1).padStart(2, "0") + "-" +
      String(now.getDate()).padStart(2, "0");
    XLSX.writeFile(wb, "rca-multi-" + dateStr + ".xlsx", { cellStyles: true });
    showToast(
      "Exported " + bannerReports.length + " banner" + (bannerReports.length === 1 ? "" : "s") +
      " \u00b7 " + totalTests + " tests \u00b7 " + totalLabels + " labelled",
      "success"
    );
  });
}
