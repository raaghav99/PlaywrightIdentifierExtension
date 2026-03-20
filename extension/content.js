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
  var titleMatch = (document.title || "").toLowerCase().includes("playwright");
  var scripts    = document.querySelectorAll("script");
  var blobMatch  = false;
  for (var i = 0; i < scripts.length; i++) {
    if (scripts[i].textContent && scripts[i].textContent.includes("playwrightReportBase64")) {
      blobMatch = true; break;
    }
  }
  /* BUG-12: warn when title passes but blob string is absent — blob-dependent
     features (base64 extraction) will silently fail if Playwright renamed the var */
  if (titleMatch && !blobMatch) {
    console.warn("pw-ext: playwrightReportBase64 not found — blob extraction disabled. Playwright may have renamed this variable.");
  }
  return titleMatch || blobMatch;
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
     INDEXEDDB WRAPPER
     All persistent data lives here — page-origin scoped so it
     survives extension reinstalls, ID changes, and Web Store migration.

     DB: "pw_identifier_db"  version: 2
       "rca_library"  keyPath: "id"   — reusable label/category/owner/jira entries
       "reports"      keyPath: "url"  — per-report scraped data + labels
     ====================================================== */

  var _idbInstance = null;

  /**
   * openDb(cb)
   * Opens (or upgrades) the shared IndexedDB database.
   * Version 2 adds the "reports" store so pw_reports data survives reinstalls.
   * Caches the handle; invalidates on close/versionchange.
   * @param {function} cb  Called with IDBDatabase instance, or null on open failure.
   */
  function openDb(cb) {
    if (_idbInstance) { cb(_idbInstance); return; }
    var req = indexedDB.open("pw_identifier_db", 2);
    req.onupgradeneeded = function (e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains("rca_library")) {
        db.createObjectStore("rca_library", { keyPath: "id" });
      }
      /* v2: per-report storage — survives extension reinstall */
      if (!db.objectStoreNames.contains("reports")) {
        db.createObjectStore("reports", { keyPath: "url" });
      }
    };
    req.onsuccess = function (e) {
      _idbInstance = e.target.result;
      _idbInstance.onclose = function () { _idbInstance = null; };
      _idbInstance.onversionchange = function () {
        _idbInstance.close();
        _idbInstance = null;
      };
      cb(_idbInstance);
    };
    /* BUG-19: show visible warning — silent no-ops are worse than a clear message */
    req.onerror = function () {
      console.error("pw-ext: IndexedDB open failed — all data will be session-only");
      cb(null);
      if (typeof showToast === "function") {
        showToast("\u26a0 Storage unavailable \u2014 IndexedDB failed. Data won\u2019t persist this session.", "error");
      }
    };
  }

  /* Keep openRcaDb as an alias — all existing callers (rcaGetAll/rcaSaveAll) work unchanged */
  var openRcaDb = openDb;

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
  /* BUG-18: cb signature changed to cb(err) — null means success, truthy means failure.
     All callers must check the argument before treating the operation as successful. */
  function rcaSaveAll(library, cb) {
    openRcaDb(function (db) {
      if (!db) { if (cb) cb(new Error("IndexedDB unavailable")); return; }
      var tx    = db.transaction("rca_library", "readwrite");
      var store = tx.objectStore("rca_library");
      store.clear();
      library.forEach(function (entry) {
        if (entry && entry.id) { store.put(entry); }
      });
      tx.oncomplete = function () { if (cb) cb(null); };
      tx.onerror    = function (e) {
        console.error("pw-ext: rcaSaveAll failed", e);
        if (cb) cb(e); /* pass error — callers must not treat this as success */
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
  /* BUG-01: flag moved from localStorage (origin-scoped) to chrome.storage (extension-scoped)
     so the migration runs exactly once across ALL origins, not once per origin.
     BUG-17: chrome.storage data is only removed AFTER a confirmed successful IDB write.
     Safe transition: if chrome.storage library is empty, just set the flag without
     calling rcaSaveAll([]) which would wipe any existing IDB data. */
  function migrateRcaToIndexedDb(cb) {
    chrome.storage.local.get(["pw-rca-idb-v1", "pw_rca_library"], function (data) {
      if (data["pw-rca-idb-v1"] === "1") { if (cb) cb(); return; }

      var library = data.pw_rca_library || [];
      if (!library.length) {
        /* Nothing to migrate — set flag without touching IDB */
        chrome.storage.local.set({ "pw-rca-idb-v1": "1" }, function () {
          if (cb) cb();
        });
        return;
      }

      rcaSaveAll(library, function (err) {
        if (err) {
          /* IDB write failed — keep chrome.storage intact so data is not lost.
             Flag is NOT set — migration will retry next session. */
          console.error("pw-ext: migration aborted — IDB write failed, chrome.storage preserved", err);
          if (cb) cb();
          return;
        }
        /* IDB write confirmed — now safe to remove from chrome.storage */
        chrome.storage.local.remove(["pw_rca_library"], function () {
          chrome.storage.local.set({ "pw-rca-idb-v1": "1" }, function () {
            if (cb) cb();
          });
        });
      });
    });
  }

  /**
   * migrateReportsToIndexedDb(cb)
   * One-time migration: copies pw_reports from chrome.storage.local into the
   * IDB "reports" store, then removes it from chrome.storage.
   * Uses chrome.storage flag "pw-reports-idb-v1" to run exactly once.
   * Only removes from chrome.storage after a confirmed successful IDB write.
   * If chrome.storage is already empty (fresh install or already migrated),
   * just sets the flag without touching IDB — prevents wiping existing IDB data.
   */
  function migrateReportsToIndexedDb(cb) {
    chrome.storage.local.get(["pw-reports-idb-v1", "pw_reports"], function (data) {
      if (data["pw-reports-idb-v1"] === "1") { if (cb) cb(); return; }

      var reports = data.pw_reports || {};
      var urls    = Object.keys(reports);

      if (!urls.length) {
        chrome.storage.local.set({ "pw-reports-idb-v1": "1" }, function () {
          if (cb) cb();
        });
        return;
      }

      openDb(function (db) {
        if (!db) {
          /* IDB unavailable — keep chrome.storage, don't set flag so we retry next session */
          if (cb) cb();
          return;
        }
        var tx    = db.transaction("reports", "readwrite");
        var store = tx.objectStore("reports");
        urls.forEach(function (url) { store.put(reports[url]); });
        tx.oncomplete = function () {
          chrome.storage.local.remove(["pw_reports"], function () {
            chrome.storage.local.set({ "pw-reports-idb-v1": "1" }, function () {
              if (cb) cb();
            });
          });
        };
        tx.onerror = function (e) {
          console.error("pw-ext: report migration failed, chrome.storage preserved", e);
          if (cb) cb();
        };
      });
    });
  }

  /* ======================================================
     DASHBOARD DATA PIPELINE
     Four functions used by the Dashboard tab:
       loadErrorPatterns  — fetch error-patterns.json once per session
       blobExtract        — parse the ZIP blob embedded in the report page
       matchPattern       — match an error message against loaded patterns
       buildGroupIndex    — group FAIL tests by pattern or failed step
     ====================================================== */


  /* --- ZIP / blob helpers --- */

  /* Recursively collect test result objects (have .testId + .results) */
  function _gatherTests(val, acc) {
    if (!val || typeof val !== "object") return;
    if (Array.isArray(val)) { val.forEach(function (v) { _gatherTests(v, acc); }); return; }
    if (typeof val.testId === "string" && Array.isArray(val.results)) { acc.push(val); return; }
    Object.keys(val).forEach(function (k) { _gatherTests(val[k], acc); });
  }

  /* Walk a steps array recursively; return title of deepest failed step.
     Playwright's blob format marks failures with step.error (an object),
     NOT step.result.status. Both checks kept for forward-compat. */
  function _findFailedStep(steps) {
    var deepest = "";
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      var failed = s && (s.error ||
                         (s.result && s.result.status === "failed") ||
                         s.duration < 0); /* negative duration = timed-out step */
      if (failed) deepest = (s && s.title) || deepest;
      if (s && s.steps && s.steps.length) {
        var sub = _findFailedStep(s.steps);
        if (sub) deepest = sub;
      }
    }
    return deepest;
  }

  /* Decompress a deflate-raw Uint8Array and parse the result as JSON.
     Uses Blob.stream().pipeThrough() which handles backpressure correctly
     for large entries — the manual writer approach silently drops big chunks. */
  function _decompressJson(data) {
    try {
      var ds     = new DecompressionStream("deflate-raw");
      var stream = new Blob([data]).stream().pipeThrough(ds);
      return new Response(stream).json();
    } catch (e) {
      return Promise.reject(e);
    }
  }

  /**
   * blobExtract(cb)
   * Finds window.playwrightReportBase64 in a <script> tag, decodes the ZIP,
   * walks every .json entry, and populates state.blobData as a Map:
   *   Map<testId, { errorMsg, failedStepTitle }>
   * Sets state.blobData = null on any unrecoverable error.
   */
  function blobExtract(cb) {
    /* Already ran this page load (success or failure) — skip.
       Use false as "not yet tried" so null can mean "tried, failed". */
    if (state.blobData !== false) { cb(); return; }

    var b64 = null;

    /* ── Method 0 (fastest): blob-capture.js already grabbed it at document_start
       before Playwright's SPA called el.remove(). ── */
    if (window.__pwExtBlobB64) {
      b64 = window.__pwExtBlobB64;
    }

    /* ── Method 1 (standard): <script id="playwrightReportBase64" type="application/zip">
       Playwright 1.36+ stores the blob as textContent of a typed script element.
       Falls through if the SPA already removed it. ── */
    if (!b64) {
      var el = document.getElementById("playwrightReportBase64");
      if (el && el.textContent) {
        b64 = el.textContent.trim();
      }
    }

    /* ── Method 2 (legacy): window.playwrightReportBase64 = "data:..." assignment ── */
    if (!b64) {
      var scripts = document.querySelectorAll("script");
      for (var i = 0; i < scripts.length; i++) {
        var text = scripts[i].textContent || "";
        /* Only search scripts that contain the exact assignment form */
        var vi = text.indexOf("window.playwrightReportBase64");
        if (vi === -1) continue;
        var ei = text.indexOf("=", vi + 29); /* skip past the variable name */
        if (ei === -1) continue;
        var qi = ei + 1;
        while (qi < text.length && (text[qi] === " " || text[qi] === "\t")) qi++;
        var qc = text[qi];
        if (qc !== '"' && qc !== "'" && qc !== "`") continue;
        var qe = text.indexOf(qc, qi + 1);
        if (qe === -1) continue;
        b64 = text.slice(qi + 1, qe);
        break;
      }
    }

    if (!b64) {
      /* ── Method 3: fetch raw HTML source and regex-extract from original markup.
         React SPA may have already removed the script element from the live DOM by
         the time document_idle fires, but the bytes are still in the source. ── */
      fetch(location.href)
        .then(function (r) { return r.text(); })
        .then(function (html) {
          var m = html.match(/<script[^>]+id="playwrightReportBase64"[^>]*>([^<]+)<\/script>/);
          if (m && m[1]) {
            b64 = m[1].trim().replace(/^data:[^;]+;base64,/, "");
            _processBlobBytes(b64, cb);
          } else {
            console.warn("pw-ext: playwrightReportBase64 not found — Dashboard will show scraped-only data");
            state.blobData = null; cb();
          }
        })
        .catch(function () {
          console.warn("pw-ext: playwrightReportBase64 not found — Dashboard will show scraped-only data");
          state.blobData = null; cb();
        });
      return; /* async path — _processBlobBytes will call cb() */
    }

    _processBlobBytes(b64, cb);
  }

  /* Shared by sync (Methods 1/2) and async (Method 3) paths of blobExtract. */
  function _processBlobBytes(b64, cb) {
    /* Strip data-URI prefix if present */
    b64 = b64.replace(/^data:[^;]+;base64,/, "");

    var bytes;
    try {
      var bin = atob(b64);
      bytes = new Uint8Array(bin.length);
      for (var j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
    } catch (e) { state.blobData = null; cb(); return; }

    /* Standard ZIP handling: Walk the Central Directory at the end of the file.
       The Local File Header walker is unreliable if compSize=0 (Data Descriptors). */
    var eocdPos = -1;
    for (var i = bytes.length - 22; i >= 0; i--) {
      if (bytes[i] === 0x50 && bytes[i+1] === 0x4B && bytes[i+2] === 0x05 && bytes[i+3] === 0x06) {
        eocdPos = i;
        break;
      }
    }

    var promises = [];

    if (eocdPos !== -1) {
      /* 1. Walk Central Directory entries */
      var cdCount  = (bytes[eocdPos + 10] | (bytes[eocdPos + 11] << 8));
      var cdOffset = (bytes[eocdPos + 16] | (bytes[eocdPos + 17] << 8) |
                      (bytes[eocdPos + 18] << 16) | (bytes[eocdPos + 19] << 24)) >>> 0;
      var pos = cdOffset;
      for (var k = 0; k < cdCount; k++) {
        if (pos + 46 > bytes.length) break;
        if (bytes[pos] !== 0x50 || bytes[pos+1] !== 0x4B || bytes[pos+2] !== 0x01 || bytes[pos+3] !== 0x02) break;

        var method   = bytes[pos + 10] | (bytes[pos + 11] << 8);
        var compSize = (bytes[pos + 20] | (bytes[pos + 21] << 8) | (bytes[pos + 22] << 16) | (bytes[pos + 23] << 24)) >>> 0;
        var fnLen    = bytes[pos + 28] | (bytes[pos + 29] << 8);
        var exLen    = bytes[pos + 30] | (bytes[pos + 31] << 8);
        var fcLen    = bytes[pos + 32] | (bytes[pos + 33] << 8);
        var lfhOff   = (bytes[pos + 42] | (bytes[pos + 43] << 8) | (bytes[pos + 44] << 16) | (bytes[pos + 45] << 24)) >>> 0;

        var fname = "";
        for (var f = 0; f < fnLen; f++) fname += String.fromCharCode(bytes[pos + 46 + f]);

        if (fname.slice(-5) === ".json" && lfhOff + 30 < bytes.length) {
          var lfh_fnLen = bytes[lfhOff + 26] | (bytes[lfhOff + 27] << 8);
          var lfh_exLen = bytes[lfhOff + 28] | (bytes[lfhOff + 29] << 8);
          var dataStart = lfhOff + 30 + lfh_fnLen + lfh_exLen;
          if (dataStart + compSize <= bytes.length) {
            var slice = bytes.slice(dataStart, dataStart + compSize);
            if (method === 8) {
              promises.push(_decompressJson(slice).catch(function () { return null; }));
            } else {
              (function (s) {
                promises.push(Promise.resolve().then(function () {
                  try { return JSON.parse(new TextDecoder().decode(s)); } catch (e) { return null; }
                }));
              })(slice);
            }
          }
        }
        pos += 46 + fnLen + exLen + fcLen;
      }
    } else {
      /* Fallback to simple Local Header walker (legacy or malformed ZIP) */
      var pos = 0;
      while (pos + 30 <= bytes.length) {
        if (bytes[pos] !== 0x50 || bytes[pos + 1] !== 0x4B) break;
        if (bytes[pos + 2] !== 0x03 || bytes[pos + 3] !== 0x04) break;

        var method   = bytes[pos + 8]  | (bytes[pos + 9]  << 8);
        var compSize = (bytes[pos + 18] | (bytes[pos + 19] << 8) |
                       (bytes[pos + 20] << 16) | (bytes[pos + 21] << 24)) >>> 0;
        var fnLen    = bytes[pos + 26] | (bytes[pos + 27] << 8);
        var exLen    = bytes[pos + 28] | (bytes[pos + 29] << 8);
        var dataStart = pos + 30 + fnLen + exLen;

        var fname = "";
        for (var k = 0; k < fnLen; k++) fname += String.fromCharCode(bytes[pos + 30 + k]);

        if (fname.slice(-5) === ".json") {
          var slice = bytes.slice(dataStart, dataStart + compSize);
          if (method === 8) {
            promises.push(_decompressJson(slice).catch(function () { return null; }));
          } else {
            (function (s) {
              promises.push(Promise.resolve().then(function () {
                try { return JSON.parse(new TextDecoder().decode(s)); } catch (e) { return null; }
              }));
            })(slice);
          }
        }

        pos = dataStart + compSize;
        if (compSize === 0) break;
      }
    }

    if (!promises.length) { state.blobData = new Map(); cb(); return; }

    Promise.all(promises).then(function (jsons) {
      state.blobData = new Map();
      jsons.forEach(function (json) {
        if (!json) return;
        var tests = [];
        _gatherTests(json, tests);
        tests.forEach(function (test) {
          var results = test.results || [];
          var last    = results[results.length - 1] || {};
          var errs    = last.errors || [];
          var rawMsg  = (errs[0] && errs[0].message) ? errs[0].message : "";

          /* Strip ANSI escape codes — Playwright injects colour codes into
             expect() failure messages: [31m, [2m, [22m, [39m etc. */
          var errorMsg = rawMsg.replace(/\x1b\[[\d;]*m/g, "").replace(/\[[0-9;]+m/g, "");

          /* Don't overwrite a rich entry with the sparse data from report.json
             (report.json has 98 tests but results contain only attachments,
             no errors or steps — it is processed last in the ZIP and would
             clobber the per-file entries that have full data). */
          if (!errorMsg && state.blobData.has(test.testId)) return;

          var failedStepTitle = _findFailedStep(last.steps || []);

          /* Fallback: infer failing action from the error message first line.
             Playwright errors follow "<Class>.<method>: ..." conventions. */
          if (!failedStepTitle && errorMsg) {
            var line = errorMsg.split("\n")[0]
              .replace(/^(TimeoutError|ReferenceError|TypeError|RangeError|Error):\s*/i, "");
            /* Direct: "locator.click:" or "browserContext.waitForEvent:" */
            var m1 = line.match(/^([\w]+\.[\w]+):/);
            if (m1) { failedStepTitle = m1[1]; }
            /* Nested: "Element click failed: locator.waitFor:" */
            else {
              var m2 = line.match(/:\s*([\w]+\.[\w]+):/);
              if (m2) { failedStepTitle = m2[1]; }
              /* expect(locator).toBeVisible() */
              else {
                var m3 = line.match(/expect\([^)]*\)\.([\w]+)\s*\(/);
                if (m3) { failedStepTitle = "expect." + m3[1]; }
                else if (/test timeout/i.test(line)) { failedStepTitle = "Test Timeout"; }
              }
            }
          }

          state.blobData.set(test.testId, { errorMsg: errorMsg, failedStepTitle: failedStepTitle });
        });
      });
      console.log("pw-ext: blobExtract done — " + state.blobData.size + " tests indexed");
      cb();
    }).catch(function (e) {
      console.error("pw-ext: blobExtract failed", e);
      state.blobData = null;
      cb();
    });
  }

  /**
   * _extractLocatorSig(errorMsg)
   * Extracts the most specific identifier from a Playwright error message.
   * Priority: "Locator:" line > "waiting for locator(...)" > any locator(...) chain
   * Falls back to the first meaningful line of the error.
   */
  function _extractLocatorSig(errorMsg) {
    if (!errorMsg) return "";
    /* "Locator: locator('...')" line from expect-style errors */
    var m1 = errorMsg.match(/Locator:\s*(.+)/);
    if (m1) return m1[1].trim();
    /* "waiting for locator('...')" in call log */
    var m2 = errorMsg.match(/waiting for (locator\(.+)/);
    if (m2) return m2[1].trim();
    /* Any locator(...) chain anywhere in the message */
    var m3 = errorMsg.match(/locator\([^)]+\)(?:\.(?:locator\([^)]+\)|contentFrame\(\)|first\(\)|last\(\)|nth\([^)]*\)|filter\([^)]*\)))*(?:\.\w+\([^)]*\))*/);
    if (m3) return m3[0];
    return "";
  }

  /**
   * buildGroupIndex(report, cb)
   * Groups all FAIL tests from report.scraped into two Maps:
   *   byError — keyed by the error/locator signature (what actually broke)
   *   byStep  — keyed by the failing step title
   * Marks tests that already have a saved label so the UI can dim them.
   * Stores result in state.groupIndex and calls cb().
   */
  function buildGroupIndex(report, cb) {
    var byError = new Map();
    var byStep  = new Map();
    var labels  = report.labels || {};

    (report.scraped || []).forEach(function (entry) {
      if (entry.result !== "FAIL") return;
      var testId     = entry.testId || entry.id;
      var blobEntry  = state.blobData ? state.blobData.get(testId) : null;
      var errorMsg        = blobEntry ? blobEntry.errorMsg        : "";
      var failedStepTitle = blobEntry ? blobEntry.failedStepTitle : "";
      var labeled    = !!(labels[entry.sc + "|" + entry.name]);

      /* byError — locator sig → failing step/method → raw first error line.
         Never use a generic fallback: if nothing is extractable, skip. */
      var errKey = _extractLocatorSig(errorMsg)
        || failedStepTitle
        || (errorMsg ? errorMsg.split("\n")[0].trim() : "");
      if (!errKey) {
        /* Truly no error info (blob not available for this test) — skip */
        return;
      }
      if (!byError.has(errKey)) {
        byError.set(errKey, { label: errKey, tests: [] });
      }
      byError.get(errKey).tests.push(
        { testId: testId, sc: entry.sc, name: entry.name,
          errorMsg: errorMsg, failedStepTitle: failedStepTitle, labeled: labeled });

      /* byStep — group by the failing step title; skip if none */
      var stepKey = failedStepTitle || errKey; /* fall back to errKey, never a generic label */
      if (!byStep.has(stepKey)) {
        byStep.set(stepKey, { label: stepKey, tests: [] });
      }
      byStep.get(stepKey).tests.push(
        { testId: testId, sc: entry.sc, name: entry.name,
          errorMsg: errorMsg, failedStepTitle: failedStepTitle, labeled: labeled });
    });

    state.groupIndex = { byError: byError, byStep: byStep };
    cb();
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
  /* getReport / saveReport / getAllReports / purgeOldReports
     All backed by IndexedDB "reports" store (page-origin scoped).
     Data survives extension reinstalls, ID changes, and Web Store migration. */

  function getReport(cb) {
    var url = getReportUrl();
    openDb(function (db) {
      if (!db) { cb({ url: url, scraped: [], labels: {}, lastAccessed: new Date().toISOString() }); return; }
      var req = db.transaction("reports", "readonly").objectStore("reports").get(url);
      req.onsuccess = function () {
        cb(req.result || { url: url, scraped: [], labels: {}, lastAccessed: new Date().toISOString() });
      };
      req.onerror = function () {
        cb({ url: url, scraped: [], labels: {}, lastAccessed: new Date().toISOString() });
      };
    });
  }

  /**
   * getAllReports(cb)
   * Returns all stored reports as a plain map { url: reportObject }.
   * Used by multi-banner export and carryover features that need cross-report data.
   */
  function getAllReports(cb) {
    openDb(function (db) {
      if (!db) { cb({}); return; }
      var req = db.transaction("reports", "readonly").objectStore("reports").getAll();
      req.onsuccess = function () {
        var map = {};
        (req.result || []).forEach(function (r) { map[r.url] = r; });
        cb(map);
      };
      req.onerror = function () { cb({}); };
    });
  }

  /**
   * saveReport(report, cb)
   * ----------------------
   * Writes a report object to the IndexedDB "reports" store, keyed by report.url.
   * Always stamps lastAccessed to now before saving (keeps TTL fresh).
   *
   * @param {object}   report  The report object to save.
   *                           Must have: { url, scraped[], labels{}, ... }
   *                           report.url is used as the IDB key.
   * @param {function} [cb]    Optional callback: cb(null) on success, cb(err) on failure.
   */
  /* cb(null) on success, cb(err) on failure — callers that ignore the arg are unaffected */
  function saveReport(report, cb) {
    openDb(function (db) {
      if (!db) { if (cb) cb(new Error("IDB unavailable")); return; }
      report.lastAccessed = new Date().toISOString();
      var tx = db.transaction("reports", "readwrite");
      tx.objectStore("reports").put(report);
      tx.oncomplete = function () { if (cb) cb(null); };
      tx.onerror    = function (e) {
        console.error("pw-ext: saveReport failed", e);
        if (cb) cb(e);
      };
    });
  }

  /**
   * purgeOldReports(cb)
   * -------------------
   * Deletes any reports from chrome.storage.local whose lastAccessed timestamp
   * is older than REPORT_TTL_DAYS (10 days) from now.
   *
   * Called at init() start, before getReport(), so stale entries are removed
   * before any read occurs. This ordering prevents stale data being served.
   *
   * How it works:
   *  - Reads all reports from IDB "reports" store
   *  - Calculates cutoff = now - 10 days (in ms)
   *  - Deletes any reports with lastAccessed < cutoff
   *  - Warns the user if labeled entries were purged
   *
   * @param {function} [cb]  Optional callback, always called when done
   *                         (whether or not anything was deleted)
   */
  function purgeOldReports(cb) {
    openDb(function (db) {
      if (!db) { if (cb) cb(); return; }
      var req = db.transaction("reports", "readonly").objectStore("reports").getAll();
      req.onsuccess = function () {
        var all    = req.result || [];
        var cutoff = Date.now() - (REPORT_TTL_DAYS * 24 * 60 * 60 * 1000);
        var stale  = all.filter(function (r) {
          return new Date(r.lastAccessed || 0).getTime() < cutoff;
        });
        if (!stale.length) { if (cb) cb(); return; }

        /* BUG-20: count labels about to be deleted so we can warn the user */
        var purgedLabels = stale.reduce(function (n, r) {
          return n + Object.keys(r.labels || {}).length;
        }, 0);

        var tx    = db.transaction("reports", "readwrite");
        var store = tx.objectStore("reports");
        stale.forEach(function (r) { store.delete(r.url); });
        tx.oncomplete = function () {
          if (purgedLabels > 0 && typeof showToast === "function") {
            showToast(
              "\u26a0 " + purgedLabels + " labeled entr" + (purgedLabels === 1 ? "y" : "ies") +
              " from old builds purged (>10 days). Export before they expire.",
              "warning"
            );
          }
          if (cb) cb();
        };
        tx.onerror = function () { if (cb) cb(); };
      };
      req.onerror = function () { if (cb) cb(); };
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
    // Strip feature-name prefix: playwright-report-extractor.js uses slice(1) after
    // splitting on › — i.e. drops only the first segment (feature name), keeps the rest.
    // e.g. "Feature › Scenario › Example #1" → "Scenario › Example #1"
    // normalizeName() then strips Example #N and converts remaining › to " - ".
    var firstArrow = rawName.indexOf("\u203a");
    if (firstArrow !== -1) rawName = rawName.slice(firstArrow + 1).trim();
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
   * buildTestCache()
   * ----------------
   * Scans all .test-file-test rows currently in the DOM and populates
   * state.testCache — a plain map of testId → {sc, name, result}.
   *
   * Called once on init (via waitForTests) so the cache is ready before
   * the user navigates into any test detail page via arrow keys.
   * When the user is on the detail page the sidebar rows are gone from DOM,
   * so populateFormFromTestId() reads from this in-memory cache instead of
   * trying to scrape the detail page.
   *
   * The locator used by extractRowData():
   *   testId  — a[href*="testId="]  inside the row  (href="#?testId=<id>")
   *   name    — .test-file-title    span text
   *   sc      — .label              span text matching /^SC[_\s-]?\d+$/i
   *   result  — svg.octicon         class mapped via ICON_STATUS
   */
  function buildTestCache() {
    state.testCache = {};   /* reset first — prevents stale result entries */
    var rows = document.querySelectorAll(".test-file-test");
    rows.forEach(function (row) {
      var data = extractRowData(row);
      if (data.testId) {
        state.testCache[data.testId] = { sc: data.sc, name: data.name, result: data.result };
      }
    });
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
   *   userClosed        boolean          — true when user explicitly closed the panel
   *                                        via the toggle tab; prevents test clicks from
   *                                        auto-reopening until user manually re-opens
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
    userClosed:        false,
    formHidden:        false,
    editingKey:        null,
    currentTestId:     null,  /* testId of the test currently shown in form; used as storage key */
    lastUrl:           location.href,
    scraping:          false,
    saving:            false,  /* BUG-03: guard against double-save race on rapid Enter/click */
    listenersAttached: false,
    testCache:         {},    /* testId → {sc, name, result} — built from list-view rows on init */
    blobData:          false, /* false=not tried; null=tried+failed; Map=success */
    groupIndex:        null   /* { byError: Map, byStep: Map } — built on Dashboard open */
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

    buildTestCache();   /* keep in-memory cache in sync with freshly scraped rows */
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
    buildTestCache();         /* build testId→{sc,name,result} map from current list rows */
    /* Migrate RCA library from chrome.storage to IndexedDB (one-time, idempotent).
       Must complete before renderLabelChips/refreshCount so chips don't render
       from an empty IndexedDB while migration is still writing old data. */
    migrateRcaToIndexedDb(function () {
      migrateReportsToIndexedDb(function () {
        refreshCount();       /* form.js */
        renderLabelChips();   /* form.js */
      });
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
