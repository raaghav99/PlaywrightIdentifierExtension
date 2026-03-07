/** Playwright Test Identifier - Core Bootstrap v5.1
 * Shared constants, state, helpers, and init. Loaded first.
 * ui.js -> form.js -> excel.js depend on globals defined here.
 *
 * Data model:
 *   pw_reports      {url: {url, scraped[], labels{}, lastAccessed}}  — multi-report, 10-day TTL
 *   pw_rca_library  [{id, label, category, owner, jira, useCount, lastUsed}] — persistent
 */

/* Guard: only run once */
if (document.getElementById("pw-ext-panel")) { /* already injected */ }
else {

function isPlaywrightReport() {
  if ((document.title || "").toLowerCase().includes("playwright")) return true;
  var scripts = document.querySelectorAll("script");
  for (var i = 0; i < scripts.length; i++) {
    if (scripts[i].textContent && scripts[i].textContent.includes("playwrightReportBase64")) return true;
  }
  return false;
}

if (isPlaywrightReport()) {

  /* ── Icon -> Status mapping ── */
  var ICON_STATUS = {
    "color-icon-success": "PASS",
    "color-icon-danger":  "FAIL",
    "color-icon-warning": "PASS",
    "color-icon-subtle":  "SKIPPED"
  };

  /* ── Name normalization ── */
  var NORM = {
    delimiters:     [":", "/", "|", "\u2013", "\u2014", "_"],
    removePatterns: [
      /\s*\u203a\s*Example\s*#?\d+/gi,
      /\s*-\s*Example\s*#?\d+/gi,
      /\s*\(\s*Example\s*#?\d+\s*\)/gi
    ],
    stdDelimiter: "-"
  };

  function normalizeName(name) {
    if (!name) return "";
    var clean = name.trim();
    NORM.removePatterns.forEach(function (p) { clean = clean.replace(p, ""); });
    NORM.delimiters.forEach(function (d) {
      var r = new RegExp("\\s*\\" + d + "\\s*", "g");
      clean = clean.replace(r, " " + NORM.stdDelimiter + " ");
    });
    clean = clean.replace(/\s+/g, " ").trim();
    var edgeRe = new RegExp("^\\s*\\" + NORM.stdDelimiter + "\\s*|\\s*\\" + NORM.stdDelimiter + "\\s*$", "g");
    clean = clean.replace(edgeRe, "").trim();
    var dblRe  = new RegExp("\\s*\\" + NORM.stdDelimiter + "\\s*\\" + NORM.stdDelimiter + "\\s*", "g");
    clean = clean.replace(dblRe, " " + NORM.stdDelimiter + " ");
    return clean.replace(/\s+/g, " ").trim();
  }

  /* ── HTML-escape helper ── */
  function esc(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ── Report URL (identifies a unique report) ── */
  function getReportUrl() {
    return location.origin + location.pathname;
  }

  /* ── Report storage helpers ── */
  var REPORT_TTL_DAYS = 10;

  function getReport(cb) {
    var url = getReportUrl();
    chrome.storage.local.get(["pw_reports"], function (data) {
      var reports = data.pw_reports || {};
      var report  = reports[url] || { url: url, scraped: [], labels: {}, lastAccessed: new Date().toISOString() };
      cb(report);
    });
  }

  function saveReport(report, cb) {
    chrome.storage.local.get(["pw_reports"], function (data) {
      var reports = data.pw_reports || {};
      report.lastAccessed = new Date().toISOString();
      reports[report.url] = report;
      chrome.storage.local.set({ pw_reports: reports }, function () {
        if (chrome.runtime.lastError) {
          console.error("pw-ext: save failed -", chrome.runtime.lastError.message);
        }
        if (cb) cb();
      });
    });
  }

  function purgeOldReports(cb) {
    chrome.storage.local.get(["pw_reports"], function (data) {
      var reports = data.pw_reports || {};
      var cutoff  = Date.now() - (REPORT_TTL_DAYS * 24 * 60 * 60 * 1000);
      var changed = false;
      Object.keys(reports).forEach(function (url) {
        var ts = new Date(reports[url].lastAccessed || 0).getTime();
        if (ts < cutoff) {
          delete reports[url];
          changed = true;
        }
      });
      if (changed) {
        chrome.storage.local.set({ pw_reports: reports }, function () {
          if (cb) cb();
        });
      } else {
        if (cb) cb();
      }
    });
  }

  /* ── Shared row data extraction ── */
  function extractRowData(row) {
    var icon   = row.querySelector("svg.octicon");
    var result = "UNKNOWN";
    if (icon) {
      var cls = icon.getAttribute("class") || "";
      for (var key in ICON_STATUS) {
        if (cls.indexOf(key) !== -1) { result = ICON_STATUS[key]; break; }
      }
    }
    if (result === "UNKNOWN") {
      var classes = Array.from(row.classList);
      for (var i = 0; i < classes.length; i++) {
        if (classes[i] === "test-file-test-outcome-expected")   { result = "PASS";    break; }
        if (classes[i] === "test-file-test-outcome-unexpected") { result = "FAIL";    break; }
        if (classes[i] === "test-file-test-outcome-flaky")      { result = "PASS";    break; }
        if (classes[i] === "test-file-test-outcome-skipped")    { result = "SKIPPED"; break; }
      }
    }

    var labels = row.querySelectorAll(".label");
    var sc = "N/A";
    for (var j = 0; j < labels.length; j++) {
      var txt = labels[j].textContent.trim();
      var m   = txt.match(/^SC[_\s-]?(\d+)$/i);
      if (m) { sc = "SC_" + String(parseInt(m[1], 10)).padStart(3, "0"); break; }
    }

    var titleEl = row.querySelector(".test-file-title");
    var rawName = titleEl ? titleEl.textContent.trim() : "";
    rawName = rawName.replace(/\s*\(retry\s*\d+\)\s*/gi, "").trim();
    var name = normalizeName(rawName);

    var testId = "";
    var anchor = row.querySelector('a[href*="testId="]');
    if (anchor) {
      var hrefMatch = (anchor.getAttribute("href") || "").match(/testId=([^&]+)/);
      if (hrefMatch) testId = decodeURIComponent(hrefMatch[1]);
    }

    return { sc: sc, name: name, result: result, testId: testId };
  }

  /* ── Panel state ── */
  var state = {
    side:       "right",
    width:      340,
    minimized:  false,
    formHidden: false,
    editingKey: null,
    lastUrl:    location.href,
    scraping:   false
  };

  /* ── Scrape all tests on page ── */
  function scrapeAllTests(cb) {
    if (state.scraping) return;
    state.scraping = true;

    var rows = document.querySelectorAll(".test-file-test");
    if (!rows.length) {
      state.scraping = false;
      if (cb) cb(0);
      return;
    }

    var scraped = [];
    rows.forEach(function (row, idx) {
      var data = extractRowData(row);
      var id = data.testId || (data.sc + "|" + data.name + "|" + idx);
      scraped.push({
        id:     id,
        sc:     data.sc,
        name:   data.name,
        result: data.result,
        testId: data.testId
      });
    });

    getReport(function (report) {
      report.scraped = scraped;
      saveReport(report, function () {
        state.scraping = false;
        if (cb) cb(scraped.length);
      });
    });
  }

  /* ── Bootstrap ── */
  function waitForTests(cb) {
    if (document.querySelector(".test-file-test")) { cb(); return; }
    var start = Date.now();
    var poll = setInterval(function () {
      if (document.querySelector(".test-file-test") || Date.now() - start > 10000) {
        clearInterval(poll); cb();
      }
    }, 400);
  }

  function init() {
    if (document.getElementById("pw-ext-panel")) return;

    /* Cleanup old storage keys from v4/v5.0 */
    chrome.storage.local.remove(["pw_entries", "pw_scraped", "pw_label_history", "pw_current_report"]);

    /* Purge reports older than 10 days */
    purgeOldReports();

    injectPanel();          /* ui.js */
    applyPanelPosition();   /* ui.js */
    attachListeners();      /* form.js */
    listenForTestClicks();  /* form.js */
    setupDragResize();      /* ui.js */
    setupUrlWatcher();      /* form.js */
    refreshCount();         /* form.js */
    renderLabelChips();     /* form.js */

    /* Only auto-scrape if this report has no saved scraped data */
    getReport(function (report) {
      if (report.scraped && report.scraped.length) {
        /* Existing report: touch lastAccessed, skip scrape */
        saveReport(report);
      } else {
        /* New report: scrape */
        scrapeAllTests();
      }
    });
  }

  waitForTests(init);

} /* end isPlaywrightReport */
} /* end guard */
