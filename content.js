/** Playwright RCA Helper - Core Bootstrap v5.1
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

/**
 * isPlaywrightReport()
 * --------------------
 * Detects whether the current page is a Playwright HTML report so the
 * extension only activates on valid pages.
 *
 * Detection strategy (two checks, either is enough):
 *  1. Page <title> contains the word "playwright" (case-insensitive)
 *     e.g. "Playwright Test Report" or "Playwright HTML Report"
 *  2. Any <script> tag's inline text contains the string "playwrightReportBase64"
 *     which Playwright injects into its self-contained HTML report bundle.
 *
 * @returns {boolean} true if this looks like a Playwright report page
 *
 * NOTE: If Playwright changes their embedded bundle variable name, check #2
 * will silently stop working. Both checks should still pass for official reports.
 */
function isPlaywrightReport() {
  if ((document.title || "").toLowerCase().includes("playwright")) return true;
  var scripts = document.querySelectorAll("script");
  for (var i = 0; i < scripts.length; i++) {
    if (scripts[i].textContent && scripts[i].textContent.includes("playwrightReportBase64")) return true;
  }
  return false;
}

if (isPlaywrightReport()) {

  /*
   * ICON_STATUS
   * -----------
   * Maps Playwright's SVG icon CSS classes to our internal result strings.
   * These class names come from Playwright's own report HTML/CSS.
   *
   * Format: { "css-class-substring": "RESULT_STRING" }
   *   "color-icon-success" → PASS   (green tick)
   *   "color-icon-danger"  → FAIL   (red cross)
   *   "color-icon-warning" → PASS   (yellow — flaky test, treated as pass)
   *   "color-icon-subtle"  → SKIPPED (grey — skipped test)
   *
   * NOTE: If Playwright updates their icon class names this map needs updating.
   */
  var ICON_STATUS = {
    "color-icon-success": "PASS",
    "color-icon-danger":  "FAIL",
    "color-icon-warning": "PASS",
    "color-icon-subtle":  "SKIPPED"
  };

  /*
   * NORM
   * ----
   * Configuration for test name normalisation.
   *
   * delimiters     — characters that act as word/segment separators in raw test names.
   *                  All get replaced with a single standard delimiter " - " for consistency.
   *                  Includes: colon, slash, pipe, en-dash (U+2013), em-dash (U+2014), underscore.
   *
   * removePatterns — regex patterns stripped out of names before normalising.
   *                  Removes Playwright parameterised-test suffixes like:
   *                    "› Example #1"  or  "- Example 2"  or  "(Example #3)"
   *
   * stdDelimiter   — the single delimiter all others are converted to: "-"
   */
  var NORM = {
    delimiters:     [":", "/", "|", "\u2013", "\u2014", "_"],
    removePatterns: [
      /\s*\u203a\s*Example\s*#?\d+/gi,
      /\s*-\s*Example\s*#?\d+/gi,
      /\s*\(\s*Example\s*#?\d+\s*\)/gi
    ],
    stdDelimiter: "-"
  };

  /**
   * normalizeName(name)
   * -------------------
   * Cleans up a raw test name scraped from the Playwright report DOM so it
   * stores and compares consistently regardless of how the test author wrote it.
   *
   * Steps (in order):
   *  1. Trim whitespace
   *  2. Strip parameterised-example suffixes (e.g. "› Example #2")
   *  3. Replace all NORM.delimiters with " - " (space-dash-space)
   *  4. Collapse multiple spaces to one
   *  5. Strip leading/trailing " - " that may remain after substitution
   *  6. Collapse double delimiters "- -" → "- "
   *  7. Final whitespace cleanup
   *
   * @param {string} name  Raw test title text from DOM
   *                       e.g. "Login: should redirect user | smoke"
   * @returns {string}     Normalised name
   *                       e.g. "Login - should redirect user - smoke"
   */
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

  /**
   * esc(str)
   * --------
   * HTML-escapes a string so it is safe to inject into innerHTML.
   * Converts: & < > " into their HTML entity equivalents.
   *
   * Used everywhere we build HTML strings dynamically to prevent XSS when
   * test names, labels, owners, or jira fields contain special characters.
   *
   * @param {string|any} str  Any value — coerced to string first
   * @returns {string}        HTML-safe string, or "" if falsy input
   *
   * e.g. esc('<script>alert(1)</script>')
   *      → '&lt;script&gt;alert(1)&lt;/script&gt;'
   */
  function esc(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * getReportUrl()
   * --------------
   * Builds the storage key that uniquely identifies the current report.
   * Uses origin + pathname (strips query/hash) so:
   *   http://localhost:9323/index.html#?testId=abc  →  http://localhost:9323/index.html
   *
   * This means all tests from the same report file share one storage entry
   * regardless of which test the user is currently viewing.
   *
   * @returns {string}  URL string used as the key in pw_reports object
   */
  function getReportUrl() {
    return location.origin + location.pathname;
  }

  /* ======================================================
     INDEXEDDB WRAPPER — RCA library storage
     Stores pw_rca_library in the PAGE's IndexedDB (origin-scoped)
     so data survives extension reinstalls. Opened once, reused.
     ====================================================== */

  var _idbInstance = null;

  /**
   * openRcaDb(cb)
   * Opens (or creates) the IndexedDB database at the current page's origin.
   * DB: "pw_identifier_db"  version: 1  store: "rca_library"  keyPath: "id"
   * Caches the db handle in _idbInstance to avoid reopening on every call.
   * Handles unexpected DB close/version-change by clearing the cache so the
   * next call reopens a fresh connection instead of using a stale handle.
   * @param {function} cb  Called with the IDBDatabase instance, or null on error.
   */
  function openRcaDb(cb) {
    if (_idbInstance) { cb(_idbInstance); return; }
    var req = indexedDB.open("pw_identifier_db", 1);
    req.onupgradeneeded = function (e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains("rca_library")) {
        db.createObjectStore("rca_library", { keyPath: "id" });
      }
    };
    req.onsuccess = function (e) {
      _idbInstance = e.target.result;
      /* Invalidate cache if browser closes or upgrades the DB externally */
      _idbInstance.onclose = function () { _idbInstance = null; };
      _idbInstance.onversionchange = function () {
        _idbInstance.close();
        _idbInstance = null;
      };
      cb(_idbInstance);
    };
    req.onerror = function () {
      console.error("pw-ext: IndexedDB open failed");
      cb(null);
    };
  }

  /**
   * rcaGetAll(cb)
   * Reads all entries from the "rca_library" IndexedDB store.
   * @param {function} cb  Called with Array of entry objects (empty array on error).
   *                       Entry shape: { id, label, category, owner, jira, useCount, lastUsed }
   */
  function rcaGetAll(cb) {
    openRcaDb(function (db) {
      if (!db) { cb([]); return; }
      var req = db.transaction("rca_library", "readonly").objectStore("rca_library").getAll();
      req.onsuccess = function () { cb(req.result || []); };
      req.onerror   = function () { cb([]); };
    });
  }

  /**
   * rcaSaveAll(library, cb)
   * Clears the "rca_library" store and writes all entries from the array.
   * This is a full overwrite — same pattern as chrome.storage.local usage.
   * Entries missing an `id` field are skipped (would cause a DataError and
   * abort the whole transaction silently).
   * @param {Array}    library  Array of RCA entry objects to persist.
   * @param {function} [cb]     Called after the transaction completes.
   */
  function rcaSaveAll(library, cb) {
    openRcaDb(function (db) {
      if (!db) { if (cb) cb(); return; }
      var tx    = db.transaction("rca_library", "readwrite");
      var store = tx.objectStore("rca_library");
      store.clear();
      library.forEach(function (entry) {
        if (entry && entry.id) { store.put(entry); }
      });
      tx.oncomplete = function () { if (cb) cb(); };
      tx.onerror    = function (e) {
        console.error("pw-ext: rcaSaveAll failed", e);
        if (cb) cb();
      };
    });
  }

  /**
   * migrateRcaToIndexedDb(cb)
   * One-time migration: copies existing pw_rca_library from chrome.storage.local
   * into IndexedDB, then removes it from chrome.storage to free space.
   * Uses localStorage flag "pw-rca-idb-v1" to skip if already migrated.
   * @param {function} [cb]  Called when migration is done (or skipped).
   */
  function migrateRcaToIndexedDb(cb) {
    var migrated = "";
    try { migrated = localStorage.getItem("pw-rca-idb-v1") || ""; } catch (e) {}
    if (migrated === "1") { if (cb) cb(); return; }
    chrome.storage.local.get(["pw_rca_library"], function (data) {
      var library = data.pw_rca_library || [];
      rcaSaveAll(library, function () {
        chrome.storage.local.remove(["pw_rca_library"], function () {
          try { localStorage.setItem("pw-rca-idb-v1", "1"); } catch (e) {}
          if (cb) cb();
        });
      });
    });
  }

  /*
   * REPORT_TTL_DAYS
   * ---------------
   * How many days before a stored report is automatically deleted.
   * Reports not accessed for 10 days are purged by purgeOldReports().
   */
  var REPORT_TTL_DAYS = 10;

  /**
   * getReport(cb)
   * -------------
   * Reads the current report object from chrome.storage.local.
   * If no report exists for this URL, returns a fresh empty report object.
   *
   * Storage structure read:
   *   pw_reports = {
   *     "http://localhost/index.html": {
   *       url:          string,          — same as the key
   *       scraped:      Array<{id, sc, name, result, testId}>,
   *       labels:       { "SC_001|Test name": {label, category, owner, jira, labelDate, timestamp} },
   *       lastAccessed: ISO string       — e.g. "2026-03-08T14:22:00.000Z"
   *     },
   *     ...more report URLs...
   *   }
   *
   * @param {function} cb  Callback receives one argument:
   *                       report {object} — the report for the current URL
   *                       (never null — falls back to a fresh empty object)
   */
  function getReport(cb) {
    var url = getReportUrl();
    chrome.storage.local.get(["pw_reports"], function (data) {
      var reports = data.pw_reports || {};
      var report  = reports[url] || { url: url, scraped: [], labels: {}, lastAccessed: new Date().toISOString() };
      cb(report);
    });
  }

  /**
   * saveReport(report, cb)
   * ----------------------
   * Writes a report object back to chrome.storage.local under its URL key.
   * Always stamps lastAccessed to now before saving (keeps TTL fresh).
   *
   * Reads the whole pw_reports map first (to avoid overwriting other reports),
   * updates just the entry for report.url, then writes the whole map back.
   *
   * @param {object}   report  The report object to save.
   *                           Must have: { url, scraped[], labels{}, ... }
   *                           report.url is used as the storage key.
   * @param {function} [cb]    Optional callback, called after write completes.
   *                           Called even if write fails (error is only logged).
   */
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

  /**
   * purgeOldReports(cb)
   * -------------------
   * Deletes any reports from chrome.storage.local whose lastAccessed timestamp
   * is older than REPORT_TTL_DAYS (10 days) from now.
   *
   * Called at init() start, inside a callback, so the purge completes BEFORE
   * getReport() reads storage. This ordering prevents stale data being served.
   *
   * How it works:
   *  - Reads pw_reports
   *  - Calculates cutoff = now - 10 days (in ms)
   *  - Loops all keys, deletes any with lastAccessed < cutoff
   *  - Writes back only if something was deleted (avoids unnecessary writes)
   *
   * @param {function} [cb]  Optional callback, always called when done
   *                         (whether or not anything was deleted)
   */
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

  /**
   * extractRowData(row)
   * -------------------
   * Extracts all useful data from a single Playwright test row DOM element.
   * This is the central parser — everything else (scraping, form populate)
   * calls this to get structured data out of the live DOM.
   *
   * @param {Element} row  A DOM element matching ".test-file-test"
   *                       — one row in the Playwright HTML report test list
   *
   * @returns {object} {
   *   sc:     string  — Scenario code e.g. "SC_015" or "N/A" if not found
   *   name:   string  — Normalised test name e.g. "Login - redirect user"
   *   result: string  — "PASS" | "FAIL" | "SKIPPED" | "UNKNOWN"
   *   testId: string  — Playwright's internal testId from href, or "" if none
   * }
   *
   * Result detection (two fallback layers):
   *  Layer 1: Find <svg class="octicon ..."> inside the row and map its
   *           CSS class to ICON_STATUS. Most reliable.
   *  Layer 2: Check the row's own class list for outcome classes like
   *           "test-file-test-outcome-expected" (PASS) etc.
   *
   * SC detection:
   *  Looks for <span class="label"> elements inside the row and matches
   *  text against /^SC[_\s-]?(\d+)$/i.
   *  Normalises to zero-padded 3-digit format: "SC 15" → "SC_015"
   *
   * Name:
   *  Reads .test-file-title text, strips retry suffixes "(retry 2)",
   *  then runs through normalizeName().
   *
   * testId:
   *  Reads the href of any <a href*="testId="> inside the row and decodes it.
   *  Used as a stable unique ID for the scraped entry.
   */
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
    // Strip › Example #N suffixes first, then take after the last ›
    // so only the scenario name remains — matches excelmaker.js which reads
    // scenario.name directly from JSON (no feature prefix).
    NORM.removePatterns.forEach(function (p) { rawName = rawName.replace(p, ""); });
    rawName = rawName.trim();
    var lastArrow = rawName.lastIndexOf("\u203a");
    if (lastArrow !== -1) rawName = rawName.slice(lastArrow + 1).trim();
    var name = normalizeName(rawName);

    var testId = "";
    var anchor = row.querySelector('a[href*="testId="]');
    if (anchor) {
      var hrefMatch = (anchor.getAttribute("href") || "").match(/testId=([^&]+)/);
      if (hrefMatch) testId = decodeURIComponent(hrefMatch[1]);
    }

    return { sc: sc, name: name, result: result, testId: testId };
  }

  /**
   * updateStatusBar(scraped, labeled, ok)
   * --------------------------------------
   * Updates the status bar at the top of the panel with current scrape/label counts.
   * Targets: #pw-status-text (text), #pw-status-bar (class for colour).
   *
   * @param {number}  scraped  Total number of scraped test rows
   * @param {number}  labeled  Number of those tests that have been labeled
   * @param {boolean} ok       Whether scraping was successful
   *                           — false + scraped=0 shows a warning
   *                           — true or scraped>0 shows green status
   *
   * Output examples:
   *   ok=false, scraped=0  → "⚠ No tests scraped — try manual Scrape"  (orange)
   *   ok=true,  scraped=98 → "✓ 98 tests scraped · 3 labeled"           (green)
   *   ok=true,  scraped=5, labeled=0 → "✓ 5 tests scraped"              (green)
   */
  function updateStatusBar(scraped, labeled, ok) {
    var el = document.getElementById("pw-status-text");
    if (!el) return;
    if (!ok && scraped === 0) {
      el.textContent = "\u26a0 No tests scraped \u2014 try manual Scrape";
      el.parentElement.className = "pw-status-warn";
    } else {
      el.textContent = "\u2713 " + scraped + " tests scraped" + (labeled ? " \u00b7 " + labeled + " labeled" : "");
      el.parentElement.className = "pw-status-ok";
    }
  }

  /*
   * state
   * -----
   * Shared mutable state object for the panel. All modules (ui.js, form.js)
   * read and write this object directly since they run in the same content
   * script scope.
   *
   * Fields:
   *   side              "right"|"left"   — which edge the panel is docked to
   *   width             number (px)      — current panel width, default 340
   *   minimized         boolean          — whether panel is hidden/slid off screen
   *   formHidden        boolean          — legacy field, currently unused
   *   editingKey        string|null      — "SC_001|Test name" of the entry being
   *                                        edited, or null if creating new
   *   lastUrl           string           — last seen location.href, used by URL watcher
   *                                        to detect SPA navigation
   *   scraping          boolean          — true while scrapeAllTests() is running,
   *                                        prevents concurrent scrapes
   *   listenersAttached boolean          — true after global listeners (document click,
   *                                        keydown, setInterval) are attached.
   *                                        Guards against duplicates when init() reruns.
   */
  var state = {
    side:              "right",
    width:             340,
    minimized:         false,
    formHidden:        false,
    editingKey:        null,
    currentTestId:     null,  /* testId of the test currently shown in form; used as storage key */
    lastUrl:           location.href,
    scraping:          false,
    listenersAttached: false
  };

  /**
   * scrapeAllTests(cb)
   * ------------------
   * Reads all ".test-file-test" DOM rows currently on the page and saves
   * them as the report's scraped[] array in chrome.storage.local.
   *
   * Guard: uses state.scraping flag to prevent concurrent runs.
   * If already scraping: calls cb(0) immediately and returns.
   *
   * Each scraped entry shape:
   * {
   *   id:     string  — testId from href if available, else "SC_001|Name|idx"
   *   sc:     string  — e.g. "SC_015" or "N/A"
   *   name:   string  — normalised test name
   *   result: string  — "PASS"|"FAIL"|"SKIPPED"|"UNKNOWN"
   *   testId: string  — raw testId from Playwright href, or ""
   * }
   *
   * @param {function} [cb]  Called with (count: number) after save completes.
   *                         count = number of tests scraped (0 if none found).
   *
   * NOTE: scrapeAllTests REPLACES the existing report.scraped array entirely.
   * Any previously scraped data for this report URL is overwritten.
   */
  function scrapeAllTests(cb) {
    if (state.scraping) { if (cb) cb(0); return; }
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

  /**
   * waitForTests(cb)
   * ----------------
   * Polls the DOM every 400ms until at least one ".test-file-test" row appears,
   * then calls the callback. Gives up after 10 seconds regardless.
   *
   * Needed because the Playwright HTML report is a React SPA that may not
   * have rendered the test list by the time the content script runs
   * (document_idle fires after DOM parsing, but not after JS renders).
   *
   * @param {function} cb  Called with no arguments once tests are visible
   *                       (or after 10s timeout — init() will then find 0 rows)
   *
   * NOTE: The 10s timeout means if the report is very slow to load, auto-scrape
   * will silently find 0 tests. User can always click "Re-scrape" manually.
   */
  function waitForTests(cb) {
    if (document.querySelector(".test-file-test")) { cb(); return; }
    var start = Date.now();
    var poll = setInterval(function () {
      if (document.querySelector(".test-file-test") || Date.now() - start > 10000) {
        clearInterval(poll); cb();
      }
    }, 400);
  }

  /**
   * init()
   * ------
   * Master bootstrap function. Called once by waitForTests() when the DOM is ready.
   * Also called by the MutationObserver in listenForTestClicks() if the panel is
   * removed from the DOM (e.g. by a React re-render wiping body children).
   *
   * Guard: if #pw-ext-panel already exists in DOM, returns immediately (no double init).
   *
   * Execution order matters here:
   *  1. Remove legacy storage keys (one-time migration, safe to repeat)
   *  2. Build DOM (injectPanel, applyPanelPosition, initTheme) — all synchronous
   *  3. Attach panel-level listeners (attachListeners, setupDragResize)
   *  4. Attach GLOBAL listeners only once (listenForTestClicks, setupUrlWatcher)
   *     guarded by state.listenersAttached to prevent duplicates
   *  5. Render count + chips (reads storage, async)
   *  6. Purge old reports THEN auto-scrape (both async, correctly chained)
   *
   * The global listener guard (state.listenersAttached) is important:
   * Without it, every time React re-renders and the MutationObserver triggers
   * init(), a new document click listener and setInterval would be added,
   * causing the form to populate multiple times per click and the URL watcher
   * to fire multiple times per navigation.
   */
  function init() {
    if (document.getElementById("pw-ext-panel")) return;

    /* Cleanup old storage keys from v4/v5.0 */
    chrome.storage.local.remove(["pw_entries", "pw_scraped", "pw_label_history", "pw_current_report"]);

    /* UI setup — all synchronous DOM/CSS, no storage reads, runs immediately */
    injectPanel();          /* ui.js */
    applyPanelPosition();   /* ui.js */
    initTheme();            /* form.js — apply saved/system theme before paint */
    attachListeners();      /* form.js — panel-specific, must re-run every rebuild */
    setupDragResize();      /* ui.js */
    if (!state.listenersAttached) {
      listenForTestClicks();  /* form.js — global document listener, only once */
      setupUrlWatcher();      /* form.js — interval + global keydown, only once */
      state.listenersAttached = true;
    }
    /* Migrate RCA library from chrome.storage to IndexedDB (one-time, idempotent).
       Must complete before renderLabelChips/refreshCount so chips don't render
       from an empty IndexedDB while migration is still writing old data. */
    migrateRcaToIndexedDb(function () {
      refreshCount();       /* form.js */
      renderLabelChips();   /* form.js */
    });

    /* Purge old reports first, then read storage — guarantees purge wins */
    purgeOldReports(function () {
      /* Only auto-scrape if this report has no saved scraped data */
      getReport(function (report) {
        if (report.scraped && report.scraped.length) {
          /* Existing report: touch lastAccessed, skip scrape */
          saveReport(report);
          updateStatusBar(report.scraped.length, Object.keys(report.labels).length, true);
        } else {
          /* New report: scrape */
          updateStatusBar(0, 0, false);
          scrapeAllTests(function (count) {
            getReport(function (r) {
              updateStatusBar(count, Object.keys(r.labels).length, count > 0);
            });
          });
        }
      });
    });
  }

  waitForTests(init);

} /* end isPlaywrightReport */
} /* end guard */
