/** Playwright Test Identifier - Core Bootstrap v3.0
 * Shared constants, state, and init. Loaded first.
 * ui.js → form.js → excel.js depend on globals defined here. */

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

  /* ── Icon → Status mapping ── */
  var ICON_STATUS = {
    "color-icon-success": "PASSED",
    "color-icon-danger":  "FAILED",
    "color-icon-warning": "FLAKY",
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

  /* ── HTML-escape helper (used across all modules) ── */
  function esc(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ── Panel state (shared across modules) ── */
  var state = {
    side:      "right",
    width:     340,
    minimized: false,
    formHidden: false,
    editingId: null,
    lastUrl:   location.href
  };

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
  }

  waitForTests(init);

} /* end isPlaywrightReport */
} /* end guard */
