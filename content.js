/** Playwright Test Identifier - Core Bootstrap v4.0
 * Shared constants, state, helpers, and init. Loaded first.
 * ui.js -> form.js -> excel.js depend on globals defined here. */

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
    "color-icon-success": "PASSED",
    "color-icon-danger":  "FAILED",
    "color-icon-warning": "FLAKY",
    "color-icon-subtle":  "SKIPPED"
  };

  /* ── Name normalization (mirrors excelmaker.js) ── */
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

  /* ── Date helpers ── */
  function todayDDMM() {
    var d = new Date();
    return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");
  }

  function stripDatePrefix(label) {
    return (label || "").replace(/^\d{2}\/\d{2}:\s*/, "");
  }

  function getDatePrefix(label) {
    var m = (label || "").match(/^(\d{2}\/\d{2}):/);
    return m ? m[1] : null;
  }

  /* ── Shared row data extraction (used by populateForm + scrapeAllTests) ── */
  function extractRowData(row) {
    /* Result from icon */
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
        if (classes[i] === "test-file-test-outcome-expected")   { result = "PASSED";  break; }
        if (classes[i] === "test-file-test-outcome-unexpected") { result = "FAILED";  break; }
        if (classes[i] === "test-file-test-outcome-flaky")      { result = "FLAKY";   break; }
        if (classes[i] === "test-file-test-outcome-skipped")    { result = "SKIPPED"; break; }
      }
    }

    /* SC from labels */
    var labels = row.querySelectorAll(".label");
    var sc = "N/A";
    for (var j = 0; j < labels.length; j++) {
      var txt = labels[j].textContent.trim();
      var m   = txt.match(/^SC[_\s-]?(\d+)$/i);
      if (m) { sc = "SC_" + String(parseInt(m[1], 10)).padStart(3, "0"); break; }
    }

    /* Name from title -- normalized */
    var titleEl = row.querySelector(".test-file-title");
    var rawName = titleEl ? titleEl.textContent.trim() : "";
    rawName = rawName.replace(/\s*\(retry\s*\d+\)\s*/gi, "").trim();
    var name = normalizeName(rawName);

    return { sc: sc, name: name, result: result };
  }

  /* ── Panel state (shared across modules) ── */
  var state = {
    side:         "right",
    width:        340,
    minimized:    false,
    formHidden:   false,
    editingId:    null,
    lastUrl:      location.href,
    selectedDate: todayDDMM(),
    allDates:     false
  };

  /* ── Auto-scrape all tests on page ── */
  function scrapeAllTests() {
    var rows = document.querySelectorAll(".test-file-test");
    if (!rows.length) return;

    var scraped = [];
    rows.forEach(function (row) {
      var data = extractRowData(row);
      var id = data.sc + "|" + data.name;
      scraped.push({
        id:        id,
        sc:        data.sc,
        name:      data.name,
        result:    data.result,
        label:     "",
        category:  "",
        owner:     "",
        jira:      "",
        timestamp: null
      });
    });

    /* Upsert into pw_scraped: only overwrite result, never overwrite user-filled fields */
    chrome.storage.local.get(["pw_scraped"], function (store) {
      var existing = store.pw_scraped || [];
      var map = {};
      existing.forEach(function (e) { map[e.id] = e; });

      scraped.forEach(function (s) {
        if (map[s.id]) {
          /* Only update result */
          map[s.id].result = s.result;
        } else {
          map[s.id] = s;
        }
      });

      var merged = Object.values(map);
      chrome.storage.local.set({ pw_scraped: merged });
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
    injectPanel();          /* ui.js */
    applyPanelPosition();   /* ui.js */
    attachListeners();      /* form.js */
    listenForTestClicks();  /* form.js */
    setupDragResize();      /* ui.js */
    setupUrlWatcher();      /* form.js */
    refreshCount();         /* form.js */
    scrapeAllTests();       /* auto-scrape */
  }

  waitForTests(init);

} /* end isPlaywrightReport */
} /* end guard */
