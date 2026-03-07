/** Playwright Test Identifier - Core Bootstrap v5.0
 * Shared constants, state, helpers, and init. Loaded first.
 * ui.js -> form.js -> excel.js depend on globals defined here.
 *
 * Data model:
 *   pw_current_report  {url, scraped[], labels{}}  — per-report, cleared on URL change
 *   pw_rca_library     [{id, label, category, owner, jira, useCount, lastUsed}] — persistent
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
    editingKey: null,      /* sc|name key of test being edited */
    lastUrl:    location.href,
    scraping:   false
  };

  /* ── Auto-scrape all tests on page ── */
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

    var currentUrl = getReportUrl();
    chrome.storage.local.get(["pw_current_report"], function (data) {
      var report = data.pw_current_report || { url: "", scraped: [], labels: {} };

      if (report.url !== currentUrl) {
        /* Different report: fresh start with empty labels */
        report = { url: currentUrl, scraped: scraped, labels: {} };
      } else {
        /* Same report: refresh scraped data, keep labels */
        report.scraped = scraped;
      }

      chrome.storage.local.set({ pw_current_report: report }, function () {
        if (chrome.runtime.lastError) {
          console.error("pw-ext: scrape save failed -", chrome.runtime.lastError.message);
        }
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

    /* One-time cleanup of old storage keys from v4 */
    chrome.storage.local.remove(["pw_entries", "pw_scraped", "pw_label_history"]);

    injectPanel();          /* ui.js */
    applyPanelPosition();   /* ui.js */
    attachListeners();      /* form.js */
    listenForTestClicks();  /* form.js */
    setupDragResize();      /* ui.js */
    setupUrlWatcher();      /* form.js */
    refreshCount();         /* form.js */
    renderLabelChips();     /* form.js */
    scrapeAllTests();       /* auto-scrape */
  }

  waitForTests(init);

} /* end isPlaywrightReport */
} /* end guard */
