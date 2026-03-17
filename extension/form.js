/** Playwright RCA Helper - Form Module v5.1
 * Listeners, autocomplete, populate form, save/delete, saved list, URL watcher,
 * copy-from, label chips, RCA library table.
 *
 * Data model:
 *   pw_reports      {url: {url, scraped[], labels{}, lastAccessed}} — multi-report
 *   pw_rca_library  [{id, label, category, owner, jira, useCount, lastUsed}]
 *
 * Depends on: state, ICON_STATUS, normalizeName, esc, showToast, toggleMinimize,
 *             applyPanelPosition, extractRowData, getReportUrl, getReport, saveReport
 *             from content.js / ui.js */

/* ======================================================
   THEME (dark / light toggle)
   ====================================================== */

/**
 * applyTheme(dark)
 * ----------------
 * Applies dark or light mode to the panel by toggling the "pw-dark" class
 * on <html>. Updates the theme button's icon, label, and active highlight.
 * Persists the choice to localStorage so it survives page reloads.
 *
 * IMPORTANT: We use "pw-dark" (our own class), NEVER "dark".
 * The "dark" class on <html> is owned by Playwright's own report JS.
 * If we add/remove "dark" we fight with Playwright and the toggle breaks.
 *
 * CSS responds to: :is(html.dark, html.pw-dark) — both Playwright auto-dark
 * and our manual toggle activate the same dark token overrides.
 *
 * @param {boolean} dark  true = activate dark mode, false = activate light mode
 *
 * DOM side effects:
 *   html.classList: adds/removes "pw-dark"
 *   #pw-theme-btn:  adds/removes class "pw-theme-active" (solid highlight when dark)
 *   #pw-theme-icon: innerHTML set to ☀ (sun) when dark, ☾ (moon) when light
 *   #pw-theme-label: textContent set to "Light" when dark, "Dark" when light
 *     (shows what clicking WILL do, not current state)
 *
 * localStorage key: "pw-theme"  value: "dark" | "light"
 * localStorage wrapped in try/catch — fails silently in restricted contexts.
 */
function applyTheme(dark) {
  /* Use pw-dark — never touch html.dark which Playwright owns */
  if (dark) {
    document.documentElement.classList.add("pw-dark");
  } else {
    document.documentElement.classList.remove("pw-dark");
  }
  var btn       = document.getElementById("pw-theme-btn");
  var iconEl    = document.getElementById("pw-theme-icon");
  var labelEl   = document.getElementById("pw-theme-label");
  if (btn)     btn.classList.toggle("pw-theme-active", dark);
  if (iconEl)  iconEl.innerHTML  = dark ? "&#9728;" : "&#9790;"; /* sun / moon */
  if (labelEl) labelEl.textContent = dark ? "Light" : "Dark";
  try { localStorage.setItem("pw-theme", dark ? "dark" : "light"); } catch(e) {}
}

/**
 * initTheme()
 * -----------
 * Determines the correct initial theme and calls applyTheme() once.
 * Called at the start of init() BEFORE attachListeners() so the panel
 * renders in the right colour on first paint (no flash of wrong theme).
 *
 * Priority order for determining initial theme:
 *  1. localStorage "pw-theme" — user's explicit previous choice wins
 *  2. html.dark class — Playwright's auto-dark (user has OS dark mode and
 *     Playwright detected it before our extension loaded)
 *  3. prefers-color-scheme: dark — OS-level preference
 *  4. Default: light
 *
 * NOTE: We do NOT use a CSS @media (prefers-color-scheme: dark) fallback
 * in panel.css. A CSS-only media query would re-apply dark tokens the moment
 * we remove "pw-dark" (user clicks toggle to go light), making the toggle
 * appear broken on dark-OS machines. initTheme() + applyTheme() handle this
 * purely in JS, which is the correct approach.
 */
function initTheme() {
  var saved = "";
  try { saved = localStorage.getItem("pw-theme") || ""; } catch(e) {}
  /* Fallback: mirror Playwright's own dark class or system preference */
  var playwrightDark = document.documentElement.classList.contains("dark");
  var prefersDark    = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  var dark = saved ? saved === "dark" : (playwrightDark || prefersDark);
  applyTheme(dark);
}

/**
 * todayIso()
 * ----------
 * Returns today's date as a string in "YYYY-MM-DD" format — the format
 * required by <input type="date"> value property.
 *
 * @returns {string}  e.g. "2026-03-08"
 *
 * Used to:
 *   - Initialise the date picker on page load (attachListeners)
 *   - Reset the date picker when a fresh (unlabeled) test is clicked
 */
function todayIso() {
  var t = new Date();
  return t.getFullYear() + "-" +
    String(t.getMonth() + 1).padStart(2, "0") + "-" +
    String(t.getDate()).padStart(2, "0");
}

/**
 * getStickyDate()
 * ---------------
 * Returns the last-used date the user picked in the date picker, or today
 * if no sticky date has been set yet.
 * Stored in localStorage under "pw-sticky-date" as "YYYY-MM-DD".
 * This makes the date field consistent across all tests in a session —
 * changing it once applies to all subsequent fresh (unsaved) test entries.
 */
function getStickyDate() {
  try {
    var d = localStorage.getItem("pw-sticky-date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  } catch (e) {}
  return todayIso();
}

/**
 * isoToDdMm(isoDate)
 * ------------------
 * Converts a date string from "YYYY-MM-DD" (ISO / input[type=date] format)
 * to "DD/MM" (short display format used in the label prefix and Excel export).
 *
 * @param {string} isoDate  e.g. "2026-03-08"
 * @returns {string}        e.g. "08/03"
 *                          Returns "" if input is missing or malformed.
 *
 * How: splits on "-" → ["2026","03","08"] → parts[2] + "/" + parts[1]
 * Requires at least 3 parts; returns "" for anything shorter.
 */
function isoToDdMm(isoDate) {
  /* "YYYY-MM-DD" → "DD/MM" */
  var parts = (isoDate || "").split("-");
  if (parts.length < 3) return "";
  return parts[2] + "/" + parts[1];
}

/* ======================================================
   LISTENERS
   ====================================================== */

/**
 * attachListeners()
 * -----------------
 * Wires up all click/change/keydown event listeners for panel-internal
 * elements (tabs, buttons, inputs, checkboxes).
 *
 * Called every time init() runs (i.e. every time the panel is rebuilt).
 * Safe to call multiple times because each call targets freshly-created DOM
 * elements from injectPanel() — old elements are discarded, so old listeners
 * are naturally garbage-collected with them.
 *
 * Listeners attached here (all scoped to panel elements):
 *
 *  Tab clicks:
 *    #pw-tab-form   → showView("form")
 *    #pw-tab-list   → toggle list view; if already visible, go back to form.
 *                     When showing list: calls renderList() with current report.
 *    #pw-tab-rca    → toggle RCA library view; if already visible, go back to form.
 *                     When showing: calls renderRcaLibrary().
 *
 *  Form action buttons:
 *    #pw-save-btn            → saveEntry()
 *    #pw-delete-current-btn  → deleteCurrentEntry()
 *    #pw-delete-all-btn      → deleteAllEntries()
 *    #pw-copy-from-btn       → toggleCopyFromDropdown()
 *
 *  Header action buttons:
 *    #pw-download-btn  → downloadExcel()  (excel.js)
 *    #pw-dock-btn      → toggles state.side right↔left, calls applyPanelPosition()
 *    #pw-scrape-btn    → disables btn+download, shows spinner, calls scrapeAllTests(),
 *                        re-enables and updates status bar in callback
 *    #pw-page-toggle   → toggleMinimize()  (ui.js)
 *    #pw-theme-btn     → applyTheme(!currentDarkState)  (toggles dark/light)
 *
 *  Input keyboard:
 *    #pw-label keydown:Enter → saveEntry()  (power user shortcut)
 *    All panel keydown/keypress → stopPropagation() to prevent Playwright's own
 *      keyboard navigation (arrow keys, etc.) from firing inside the panel
 *
 *  Date picker:
 *    #pw-label-date: sets initial value to todayIso() on attach
 *    #pw-date-filter-check: shows/hides #pw-date-filter-input, re-renders list
 *    #pw-date-filter-input: change → re-renders list with new filter
 *
 *  Autocomplete (for 4 fields: label, category, owner, jira):
 *    input event  → showSuggestions(field)
 *    focus event  → showSuggestions(field)  (show on focus even before typing)
 *    blur event   → hide suggestions after 180ms delay
 *                   (delay needed so mousedown on suggestion fires first)
 *    keydown Space (empty input) → showSuggestions(field)
 *                   (lets user press Space on empty field to see all suggestions)
 *
 * NOTE: #pw-page-toggle is outside #pw-ext-panel but created by injectPanel(),
 * so it is a fresh element every rebuild and safe to re-attach here.
 */
function attachListeners() {
  /* Tab navigation */
  document.getElementById("pw-tab-form").addEventListener("click", function () { showView("form"); });
  document.getElementById("pw-tab-list").addEventListener("click", function () {
    if (document.getElementById("pw-list-section").style.display === "flex") {
      showView("form");
    } else {
      showView("list");
      getReport(function (r) { renderList(r); });
    }
  });
  document.getElementById("pw-tab-rca").addEventListener("click", function () {
    if (document.getElementById("pw-rca-section").style.display === "flex") {
      showView("form");
    } else {
      showView("rca");
      renderRcaLibrary();
    }
  });

  /* Form actions */
  document.getElementById("pw-save-btn").addEventListener("click", saveEntry);
  document.getElementById("pw-delete-current-btn").addEventListener("click", deleteCurrentEntry);
  document.getElementById("pw-delete-all-btn").addEventListener("click", deleteAllEntries);
  document.getElementById("pw-copy-from-btn").addEventListener("click", toggleCopyFromDropdown);

  /* Header actions */
  document.getElementById("pw-download-btn").addEventListener("click", downloadExcel);
  document.getElementById("pw-dock-btn").addEventListener("click", function () {
    state.side = state.side === "right" ? "left" : "right";
    applyPanelPosition();
  });
  document.getElementById("pw-scrape-btn").addEventListener("click", function () {
    var btn     = document.getElementById("pw-scrape-btn");
    var spinner = document.getElementById("pw-scrape-spinner");
    var dlBtn   = document.getElementById("pw-download-btn");
    btn.disabled = true;
    dlBtn.disabled = true;
    spinner.style.display = "inline-block";
    scrapeAllTests(function (count) {
      spinner.style.display = "none";
      btn.disabled  = false;
      dlBtn.disabled = false;
      refreshCount();
      getReport(function (r) {
        updateStatusBar(count, Object.keys(r.labels).length, count > 0);
      });
      showToast("Scraped " + count + " row" + (count === 1 ? "" : "s"), "success");
    });
  });

  document.getElementById("pw-page-toggle").addEventListener("click", function () {
    toggleMinimize();
    /* Track whether the user intentionally closed the panel so test clicks
       don't auto-reopen it.  Cleared when user manually re-opens. */
    state.userClosed = state.minimized;
  });
  document.getElementById("pw-theme-btn").addEventListener("click", function () {
    applyTheme(!document.documentElement.classList.contains("pw-dark"));
  });

  /* Keyboard — Enter in label field saves */
  document.getElementById("pw-label").addEventListener("keydown", function (e) {
    if (e.key === "Enter") saveEntry();
  });

  /* Initialise date picker to sticky date (last used) or today */
  document.getElementById("pw-label-date").value = getStickyDate();

  /* Persist date changes as sticky so next fresh test uses the same date */
  document.getElementById("pw-label-date").addEventListener("change", function () {
    try { localStorage.setItem("pw-sticky-date", this.value); } catch (e) {}
  });

  /* Date filter */
  document.getElementById("pw-date-filter-check").addEventListener("change", function () {
    var input = document.getElementById("pw-date-filter-input");
    if (this.checked) {
      if (!input.value) {
        var t = new Date();
        input.value = t.getFullYear() + "-" +
          String(t.getMonth() + 1).padStart(2, "0") + "-" +
          String(t.getDate()).padStart(2, "0");
      }
      input.style.display = "inline-block";
    } else {
      input.style.display = "none";
    }
    getReport(function (r) { renderList(r); });
  });
  document.getElementById("pw-date-filter-input").addEventListener("change", function () {
    getReport(function (r) { renderList(r); });
  });

  /* Stop Playwright keyboard handlers from firing inside panel */
  var panel = document.getElementById("pw-ext-panel");
  panel.addEventListener("keydown",  function (e) { e.stopPropagation(); }, true);
  panel.addEventListener("keypress", function (e) { e.stopPropagation(); }, true);

  /* Autocomplete */
  ["label", "category", "owner", "jira"].forEach(function (field) {
    var input = document.getElementById("pw-" + field);
    var list  = document.getElementById("pw-suggest-" + field);
    input.addEventListener("input",  function () { showSuggestions(field); });
    input.addEventListener("focus",  function () { showSuggestions(field); });
    input.addEventListener("blur",   function () {
      setTimeout(function () { list.style.display = "none"; }, 180);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === " " && input.value.trim() === "") {
        e.preventDefault();
        showSuggestions(field);
      }
    });
  });
}

/**
 * listenForTestClicks()
 * ---------------------
 * Attaches a single global document click listener (capture phase) that
 * detects clicks on any ".test-file-test" row anywhere on the page and
 * calls populateForm() with that row.
 *
 * Also sets up a MutationObserver on document.body to watch for the panel
 * being removed from the DOM (React re-renders can wipe body children).
 * If #pw-ext-panel disappears, calls init() to rebuild it.
 *
 * Uses capture phase (third arg = true) so the listener fires before
 * Playwright's own click handlers. This ensures we can read the row data
 * before any Playwright navigation or state change.
 *
 * Observer stored on state.panelObserver so it can theoretically be
 * disconnected in future (currently never disconnected).
 *
 * Called only ONCE per page load, guarded by state.listenersAttached.
 * Without this guard, every MutationObserver-triggered init() call would
 * add another document click listener → the form would fire multiple times
 * per test click.
 *
 * NOTE: MutationObserver watches only direct children of body (subtree:false).
 * This is intentional — we only care if the panel div itself is removed, not
 * any deeper DOM changes.
 */
function listenForTestClicks() {
  document.addEventListener("click", function (e) {
    var row = e.target.closest(".test-file-test");
    if (row) populateForm(row);
  }, true);
  state.panelObserver = new MutationObserver(function () {
    if (!document.getElementById("pw-ext-panel")) init();
  });
  state.panelObserver.observe(document.body, { childList: true, subtree: false });
}

/* ======================================================
   URL WATCHER
   ====================================================== */

/**
 * setupUrlWatcher()
 * -----------------
 * Sets up two mechanisms to detect SPA (single-page-app) navigation in the
 * Playwright report and trigger auto-populate when the user clicks a test link.
 *
 * Playwright's report is a React SPA. Navigating to a test detail view
 * changes location.hash (e.g. #?testId=abc123) without a page reload.
 * Normal DOMContentLoaded / load events don't fire. We must poll.
 *
 * Mechanism 1: hashchange event
 *   Fires immediately when Playwright's SPA changes location.hash.
 *   Covers arrow button clicks, test link clicks, etc.
 *
 * Mechanism 2: setInterval every 300ms
 *   Fallback for history.pushState/replaceState navigations that don't
 *   fire hashchange. Compares location.href to state.lastUrl.
 *   Stored in state.urlWatchInterval so the old interval is cleared if
 *   setupUrlWatcher() is ever called again (prevents stacked intervals).
 *
 * Called only ONCE per page load, guarded by state.listenersAttached.
 * No keyboard listeners — URL watching is sufficient.
 */
function setupUrlWatcher() {
  if (state.urlWatchInterval) clearInterval(state.urlWatchInterval);

  /* Mechanism 1: hashchange — fires immediately when Playwright's SPA
     updates location.hash (arrow button clicks, link clicks, etc.) */
  window.addEventListener("hashchange", function () {
    state.lastUrl = location.href;
    onUrlChange();
  });

  /* Mechanism 2: 300ms poll — fallback for history.pushState/replaceState
     navigations that don't fire hashchange */
  state.urlWatchInterval = setInterval(function () {
    if (location.href !== state.lastUrl) {
      state.lastUrl = location.href;
      onUrlChange();
    }
  }, 300);
}

/**
 * onUrlChange()
 * -------------
 * Called when the URL changes (detected by setupUrlWatcher).
 * Extracts the testId from the new URL hash and finds the matching test row,
 * then calls populateForm() to show its data in the panel.
 *
 * Runs with a 200ms delay to give React time to finish rendering the new
 * test detail view before we query the DOM for the row link.
 *
 * URL hash format expected: #?testId=<encoded-id>[&...]
 * e.g. #?testId=6cae3b2439b7e25a7d27-5efa51a1eab4338aadd0
 *
 * Row lookup strategy (two fallbacks):
 *  1. document.querySelector('a[href*="testId=<CSS.escaped-id>"]')
 *     CSS.escape handles special characters in testId safely.
 *  2. document.querySelector('a[href*="testId=<raw-id>"]')
 *     Fallback for environments where CSS.escape may not escape as expected.
 *
 * If no matching row is found (e.g. testId not visible in current filter),
 * silently does nothing.
 */
function onUrlChange() {
  setTimeout(function () {
    var hash        = location.hash || "";
    var testIdMatch = hash.match(/testId=([^&]+)/);
    if (!testIdMatch) return;
    var testId = decodeURIComponent(testIdMatch[1]);

    /* Try sidebar row first (list view — row is in DOM) */
    var link = document.querySelector('a[href*="testId=' + CSS.escape(testId) + '"]');
    if (!link) link = document.querySelector('a[href*="testId=' + testId + '"]');
    if (link) {
      var row = link.closest(".test-file-test");
      if (row) { populateForm(row); return; }
    }

    /* Detail page — no sidebar row in DOM.
       Scrape test info directly from the detail view + look up storage by testId. */
    populateFormFromTestId(testId);
  }, 200);
}

/**
 * populateFormFromTestId(testId)
 * --------------------------------
 * Used when navigating via arrow keys inside a test detail page where the
 * sidebar test list is not rendered in the DOM.
 *
 * Scrapes test name / SC / result from the detail page DOM, then looks up
 * stored RCA data in chrome.storage.local using testId as the primary key.
 */
function populateFormFromTestId(testId) {
  /* --- Scrape test name from detail page --- */
  /* .test-case-path holds "Suite › ... › Test Name", similar to list rows */
  var pathEl  = document.querySelector(".test-case-path");
  var titleEl = document.querySelector(".test-file-title");
  var rawName = (pathEl || titleEl) ? (pathEl || titleEl).textContent.trim() : "";
  rawName = rawName.replace(/\s*\(retry\s*\d+\)\s*/gi, "").trim();
  var firstArrow = rawName.indexOf("\u203a");
  if (firstArrow !== -1) rawName = rawName.slice(firstArrow + 1).trim();
  var name = normalizeName(rawName) || testId;

  /* --- Scrape SC tag from .label elements (same class as list view) --- */
  var sc     = "N/A";
  var labels = document.querySelectorAll(".label");
  for (var j = 0; j < labels.length; j++) {
    var txt = labels[j].textContent.trim();
    var m   = txt.match(/^SC[_\s-]?(\d+)$/i);
    if (m) { sc = "SC_" + String(parseInt(m[1], 10)).padStart(3, "0"); break; }
  }

  /* --- Detect result from octicon svg on detail page --- */
  var result = "UNKNOWN";
  var icons  = document.querySelectorAll("svg.octicon");
  for (var k = 0; k < icons.length; k++) {
    var cls = icons[k].getAttribute("class") || "";
    for (var key in ICON_STATUS) {
      if (cls.indexOf(key) !== -1) { result = ICON_STATUS[key]; break; }
    }
    if (result !== "UNKNOWN") break;
  }

  /* --- Populate test info card --- */
  document.getElementById("pw-result").value                   = result;
  document.getElementById("pw-test-sc").textContent            = sc;
  document.getElementById("pw-test-name").textContent          = name;
  updateResultBadge(result);
  document.getElementById("pw-test-info-empty").style.display  = "none";
  document.getElementById("pw-test-info-filled").style.display = "block";

  /* --- Reset editable fields --- */
  ["pw-label", "pw-category", "pw-owner", "pw-jira"].forEach(function (id) {
    document.getElementById(id).value = "";
    document.getElementById(id).classList.remove("pw-error");
  });
  state.editingKey    = null;
  state.currentTestId = testId;
  document.getElementById("pw-save-btn").textContent             = "Save";
  document.getElementById("pw-delete-current-btn").style.display = "none";
  document.getElementById("pw-copy-from-dropdown").style.display = "none";

  /* --- Look up stored RCA data by testId --- */
  var fallbackKey = sc + "|" + name;
  getReport(function (report) {
    var existing    = report.labels[testId];
    var resolvedKey = testId;
    if (!existing && testId !== fallbackKey) {
      existing    = report.labels[fallbackKey];
      resolvedKey = existing ? fallbackKey : testId;
    }
    if (existing) {
      document.getElementById("pw-label").value    = existing.label    || "";
      document.getElementById("pw-category").value = existing.category || "";
      document.getElementById("pw-owner").value    = existing.owner    || "";
      document.getElementById("pw-jira").value     = existing.jira     || "";
      var savedDdMm = existing.labelDate || "";
      if (savedDdMm && /^\d{2}\/\d{2}$/.test(savedDdMm)) {
        var year = new Date().getFullYear();
        document.getElementById("pw-label-date").value =
          year + "-" + savedDdMm.split("/")[1] + "-" + savedDdMm.split("/")[0];
      } else {
        document.getElementById("pw-label-date").value = getStickyDate();
      }
      state.editingKey = resolvedKey;
      document.getElementById("pw-save-btn").textContent             = "Update";
      document.getElementById("pw-delete-current-btn").style.display = "";
    } else {
      document.getElementById("pw-label-date").value = getStickyDate();
    }
  });

  if (state.minimized && !state.userClosed) toggleMinimize();
  showView("form");
}

/* ======================================================
   AUTOCOMPLETE / SUGGESTIONS (pulls from pw_rca_library)
   ====================================================== */

/**
 * showSuggestions(field)
 * ----------------------
 * Reads pw_rca_library from storage and populates the autocomplete dropdown
 * for the given field with matching previous values, sorted by frequency.
 *
 * @param {string} field  One of: "label" | "category" | "owner" | "jira"
 *                        Used to build element IDs: "pw-{field}" (input)
 *                        and "pw-suggest-{field}" (dropdown list).
 *
 * Data source: pw_rca_library[] array from chrome.storage.local.
 * Each entry shape: { id, label, category, owner, jira, useCount, lastUsed }
 * We read entry[field] to get values for the requested field.
 *
 * Frequency: accumulated from entry.useCount across all entries that share
 * the same field value. Higher frequency = sorts higher in the list.
 *
 * For "category" field only: injects 5 default suggestions
 * ("Functional Bug", "UI Issue", "Code Error", "Network Issue", "Test Optimization")
 * so new users see useful options before any data exists.
 *
 * Filtering: if the input has typed text, only shows items containing
 * that text (case-insensitive substring match).
 *
 * Renders up to 10 items. Each item shows value + "(N)" frequency badge.
 * Click (mousedown, not click, to fire before blur) fills the input and
 * hides the dropdown.
 *
 * NOTE: Suggestions come from the RCA library (all-time, all reports),
 * NOT just the current report's labels. This is intentional — it helps
 * the user reuse consistent labels across different reports.
 */
function showSuggestions(field) {
  var input = document.getElementById("pw-" + field);
  var list  = document.getElementById("pw-suggest-" + field);
  var val   = input.value.trim().toLowerCase();

  rcaGetAll(function (library) {
    var seen = {}, freq = {};

    library.forEach(function (entry) {
      var v = (entry[field] || "").trim();
      if (v) {
        freq[v] = (freq[v] || 0) + (entry.useCount || 1);
        seen[v] = true;
      }
    });

    if (field === "category") {
      ["Functional Bug", "UI Issue", "Code Error", "Network Issue", "Test Optimization"].forEach(function (d) {
        if (!seen[d]) { seen[d] = true; freq[d] = 0; }
      });
    }

    var items = Object.keys(seen)
      .filter(function (v) { return !val || v.toLowerCase().indexOf(val) !== -1; })
      .sort(function (a, b) { return (freq[b] || 0) - (freq[a] || 0); });

    if (!items.length) { list.style.display = "none"; return; }
    list.innerHTML = items.slice(0, 10).map(function (v) {
      var count = freq[v] || 0;
      return '<div class="pw-suggest-item" data-val="' + esc(v) + '">' +
        esc(v) + (count ? ' <span class="pw-suggest-count">(' + count + ')</span>' : '') +
        '</div>';
    }).join("");
    list.style.display = "block";
    list.querySelectorAll(".pw-suggest-item").forEach(function (el) {
      el.addEventListener("mousedown", function (e) {
        e.preventDefault();
        input.value = el.dataset.val;
        list.style.display = "none";
      });
    });
  });
}

/* ======================================================
   COPY FROM... (reuse RCA from library)
   ====================================================== */

/**
 * toggleCopyFromDropdown()
 * ------------------------
 * Shows or hides the "Copy from..." dropdown that lets the user copy all
 * 4 RCA fields (label, category, owner, jira) from a previously saved
 * library entry into the current form.
 *
 * Toggle behaviour: if dropdown is already visible, hides it and returns.
 * Otherwise loads library and renders options.
 *
 * Data source: pw_rca_library[] sorted by lastUsed descending.
 * Shows the 20 most recently used entries.
 *
 * Each option is a div with data-* attributes holding the field values:
 *   data-label, data-category, data-owner, data-jira
 * Display text: all non-empty fields joined by "·"
 *
 * On option click:
 *   - Fills pw-label, pw-category, pw-owner, pw-jira inputs
 *   - Resets state.editingKey to null (this is a NEW entry, not an update
 *     of an existing one — SC/name are still from the previously clicked test)
 *   - Sets save btn text to "Save Entry"
 *   - Hides delete button (no existing entry to delete)
 *   - Hides dropdown
 *   - Shows "RCA copied to form" toast
 *
 * REVIEW: After copying, save-btn says "Save Entry" but the form may still
 * have an existing test selected. If the user had clicked a test that already
 * had a label (state.editingKey was set), resetting to null here means saving
 * will create a duplicate entry rather than update. Minor UX edge case.
 */
function toggleCopyFromDropdown() {
  var dd = document.getElementById("pw-copy-from-dropdown");
  if (dd.style.display !== "none") { dd.style.display = "none"; return; }

  rcaGetAll(function (library) {
    if (!library.length) {
      showToast("No RCA entries to copy from", "warning");
      return;
    }

    var sorted = library.slice().sort(function (a, b) {
      return new Date(b.lastUsed || 0) - new Date(a.lastUsed || 0);
    }).slice(0, 20);

    dd.innerHTML = sorted.map(function (e) {
      var parts = [e.label, e.category, e.owner, e.jira].filter(Boolean);
      var summary = parts.length ? esc(parts.join(" \u00b7 ")) : "<em>Empty</em>";
      return '<div class="pw-copy-option" data-label="' + esc(e.label || "") +
        '" data-category="' + esc(e.category || "") +
        '" data-owner="' + esc(e.owner || "") +
        '" data-jira="' + esc(e.jira || "") + '">' +
        summary + '</div>';
    }).join("");
    dd.style.display = "block";

    dd.querySelectorAll(".pw-copy-option").forEach(function (opt) {
      opt.addEventListener("click", function () {
        document.getElementById("pw-label").value    = opt.dataset.label || "";
        document.getElementById("pw-category").value = opt.dataset.category || "";
        document.getElementById("pw-owner").value    = opt.dataset.owner || "";
        document.getElementById("pw-jira").value     = opt.dataset.jira || "";
        state.editingKey = null;
        document.getElementById("pw-save-btn").textContent = "Save";
        document.getElementById("pw-delete-current-btn").style.display = "none";
        dd.style.display = "none";
        showToast("RCA copied to form", "success");
      });
    });
  });
}

/* ======================================================
   POPULATE FORM
   ====================================================== */

/**
 * populateForm(row)
 * -----------------
 * The main handler for when a user clicks a test row in the Playwright report.
 * Extracts data from the clicked row, updates the test info card, and fills
 * the editable form fields with any previously saved label data.
 *
 * @param {Element} row  A ".test-file-test" DOM element (the clicked test row)
 *
 * Steps:
 *  1. extractRowData(row) → { sc, name, result, testId }
 *  2. Fill read-only test info card:
 *     - #pw-result (hidden input): set to result string
 *     - #pw-test-sc (span): set to sc e.g. "SC_015"
 *     - #pw-test-name (span): set to normalised test name
 *     - #pw-result-badge: updated via updateResultBadge()
 *     - Show #pw-test-info-filled, hide #pw-test-info-empty
 *  3. Clear all editable fields (label, category, owner, jira)
 *     and remove any .pw-error classes from them
 *  4. Reset state: editingKey=null, save btn="Save", delete btn hidden
 *  5. Look up existing label in report.labels using key = "SC|name"
 *     If found (existing entry):
 *       - Fill fields with saved values
 *       - Reconstruct YYYY-MM-DD date from stored "DD/MM" labelDate for the picker
 *         (uses current year — REVIEW: if entry was from last year this is wrong)
 *       - state.editingKey = key (signals saveEntry to UPDATE not create)
 *       - Change save btn to "Update", show delete btn
 *     If not found (fresh test):
 *       - Reset date picker to todayIso()
 *  6. Focus the label input
 *  7. If panel is minimized, expand it
 *  8. Switch to form view
 *
 * REVIEW: Date reconstruction (step 5) uses new Date().getFullYear() as the
 * year. If a test was labeled on e.g. 28/12 of the previous year and is opened
 * in January, the reconstructed date will be one year off. Low priority but worth
 * noting if cross-year usage becomes common.
 */
function populateForm(row) {
  var data = extractRowData(row);

  /* Populate hidden result input */
  document.getElementById("pw-result").value = data.result;

  /* Update test info card */
  document.getElementById("pw-test-sc").textContent   = data.sc;
  document.getElementById("pw-test-name").textContent = data.name;
  updateResultBadge(data.result);
  document.getElementById("pw-test-info-empty").style.display  = "none";
  document.getElementById("pw-test-info-filled").style.display = "block";

  /* Clear editable fields */
  ["pw-label", "pw-category", "pw-owner", "pw-jira"].forEach(function (id) {
    document.getElementById(id).value = "";
    document.getElementById(id).classList.remove("pw-error");
  });

  state.editingKey    = null;
  state.currentTestId = data.testId || null;  /* store for saveEntry() to use as key */
  document.getElementById("pw-save-btn").textContent             = "Save";
  document.getElementById("pw-delete-current-btn").style.display = "none";
  document.getElementById("pw-copy-from-dropdown").style.display = "none";

  /*
   * Key strategy (Issue 1 fix):
   *   Primary key   = testId  (unique per parameterized instance, e.g. "abc123-def456")
   *   Fallback key  = SC|name (old format, for backward compat with pre-v2.4 saved entries)
   *   If testId is unavailable (row has no link), use SC|name for both.
   *
   * When looking up: try primary key first, then old SC|name key so existing
   * saved labels continue to show as "Update" after the upgrade.
   */
  var primaryKey  = data.testId || (data.sc + "|" + data.name);
  var fallbackKey = data.sc + "|" + data.name;
  getReport(function (report) {
    var existing    = report.labels[primaryKey];
    var resolvedKey = primaryKey;
    if (!existing && primaryKey !== fallbackKey) {
      existing    = report.labels[fallbackKey];
      resolvedKey = existing ? fallbackKey : primaryKey;
    }
    if (existing) {
      document.getElementById("pw-label").value    = existing.label || "";
      document.getElementById("pw-category").value = existing.category || "";
      document.getElementById("pw-owner").value    = existing.owner || "";
      document.getElementById("pw-jira").value     = existing.jira || "";
      var savedDdMm = existing.labelDate || "";
      if (savedDdMm && /^\d{2}\/\d{2}$/.test(savedDdMm)) {
        var year = new Date().getFullYear();
        document.getElementById("pw-label-date").value =
          year + "-" + savedDdMm.split("/")[1] + "-" + savedDdMm.split("/")[0];
      } else {
        document.getElementById("pw-label-date").value = todayIso();
      }
      state.editingKey = resolvedKey;
      document.getElementById("pw-save-btn").textContent             = "Update";
      document.getElementById("pw-delete-current-btn").style.display = "";
    } else {
      /* Fresh test — use sticky date (last used by user) so it stays consistent */
      document.getElementById("pw-label-date").value = getStickyDate();
    }
  });

  /* Do NOT steal focus here — auto-focusing the panel input swallows arrow
     key events (panel stopPropagation) and breaks Playwright's own left/right
     arrow test navigation.  User can click any input when ready to type. */
  if (state.minimized && !state.userClosed) toggleMinimize();
  showView("form");
}

/**
 * updateResultBadge(result)
 * -------------------------
 * Updates the result badge in the test info card to show the current
 * test's pass/fail/skipped status with the correct colour class.
 *
 * @param {string} result  "PASS" | "FAIL" | "SKIPPED" | "UNKNOWN"
 *
 * Sets #pw-result-badge:
 *   className = "pw-result-display pw-rbadge-{result.toLowerCase()}"
 *   textContent = result string
 *
 * CSS classes defined in panel.css:
 *   .pw-rbadge-pass    → green
 *   .pw-rbadge-fail    → red
 *   .pw-rbadge-skipped → grey
 *   .pw-rbadge-unknown → muted
 */
function updateResultBadge(result) {
  var badge = document.getElementById("pw-result-badge");
  badge.className  = "pw-result-display pw-rbadge-" + result.toLowerCase();
  badge.textContent = result;
}

/* ======================================================
   DELETE CURRENT ENTRY (in-form)
   ====================================================== */

/**
 * deleteCurrentEntry()
 * --------------------
 * Deletes the label entry for the test currently shown in the form.
 * Only works if state.editingKey is set (i.e. a previously saved test
 * was loaded into the form). Silently returns if no entry is being edited.
 *
 * Uses state.editingKey as the storage key ("SC_001|Test name" format).
 *
 * After deletion:
 *   - Updates the saved count badge via refreshCount()
 *   - Re-renders the saved list if it's currently visible
 *   - Shows "Entry deleted" toast
 *   - Resets state.editingKey to null
 *   - Resets save btn text to "Save Entry"
 *   - Hides the delete button
 *   - Clears all form input fields
 *
 * NOTE: Does NOT clear the test info card (SC/name/result remain visible).
 * User can still save a new label for the same test after deleting.
 *
 * MINOR: Save button text after delete is "Save Entry" but it's initialized
 * as "Save" elsewhere. Slight inconsistency but no functional impact.
 */
function deleteCurrentEntry() {
  if (!state.editingKey) return;
  getReport(function (report) {
    delete report.labels[state.editingKey];
    saveReport(report, function () {
      refreshCount(Object.keys(report.labels).length);
      if (document.getElementById("pw-list-section").style.display !== "none") renderList(report);
      showToast("Entry deleted", "warning");
      state.editingKey = null;
      document.getElementById("pw-save-btn").textContent              = "Save";
      document.getElementById("pw-delete-current-btn").style.display = "none";
      ["pw-label", "pw-category", "pw-owner", "pw-jira"].forEach(function (id) {
        document.getElementById(id).value = "";
      });
    });
  });
}

/* ======================================================
   DELETE ALL (report labels only, NOT rca library)
   ====================================================== */

/**
 * deleteAllEntries()
 * ------------------
 * Deletes ALL label entries for the current report URL.
 * Does NOT affect the RCA library (pw_rca_library persists).
 * Does NOT affect scraped test data (report.scraped persists).
 *
 * Requires user confirmation via native browser confirm() dialog.
 * Returns immediately if user cancels.
 *
 * After deletion:
 *   - Sets report.labels = {}
 *   - Saves the modified report
 *   - Resets saved count badge to 0
 *   - Updates status bar to reflect 0 labeled (scraped count preserved)
 *   - Switches to form view (hides list)
 *   - Shows "Report labels cleared" toast
 *
 * NOTE: #pw-list-container is queried but the result is unused (assigned to
 * `var container` but then showView("form") switches away anyway). Dead code.
 *
 * NOTE: Uses report.scraped.length in updateStatusBar. If scrape data is
 * missing this could show 0. Safe in practice since labels imply a prior scrape.
 */
function deleteAllEntries() {
  if (!confirm("Delete all labeled entries for this report?\nRCA library will be preserved.")) return;
  getReport(function (report) {
    report.labels = {};
    saveReport(report, function () {
      refreshCount(0);
      updateStatusBar(report.scraped.length, 0, report.scraped.length > 0);
      var container = document.getElementById("pw-list-container");
      showView("form");
      showToast("Report labels cleared", "warning");
    });
  });
}

/* ======================================================
   SAVE / UPDATE
   ====================================================== */

/**
 * saveEntry()
 * -----------
 * Validates form inputs and saves (or updates) a label entry for the
 * currently selected test. Also upserts the entry into the persistent
 * RCA library for future autocomplete suggestions.
 *
 * Validation (fails fast with toast + error class on fail):
 *   1. #pw-test-sc and #pw-test-name must have non-empty textContent
 *      → if empty: "Click a test first" (user hasn't clicked a row yet)
 *   2. #pw-label must have non-empty value
 *      → if empty: adds .pw-error class, focuses input, shows toast
 *
 * Reads from DOM:
 *   #pw-test-sc    (span) .textContent  → sc   e.g. "SC_015"
 *   #pw-test-name  (span) .textContent  → name e.g. "Login - redirect"
 *   #pw-label      (input) .value       → label text
 *   #pw-category   (input) .value       → category (optional)
 *   #pw-owner      (input) .value       → owner (optional)
 *   #pw-jira       (input) .value       → jira ticket (optional)
 *   #pw-label-date (input) .value       → "YYYY-MM-DD" → converted to "DD/MM"
 *
 * Storage key format: "SC_015|Login - redirect"  (sc + "|" + name)
 * This key is used in both pw_reports.labels{} and state.editingKey.
 *
 * Label data saved:
 * {
 *   label:     string    — the typed label text (no date prefix stored here)
 *   category:  string    — optional
 *   owner:     string    — optional
 *   jira:      string    — optional
 *   labelDate: "DD/MM"   — from date picker, used as prefix in Excel export
 *   timestamp: ISO string — when saved (used for date filter in renderList)
 * }
 *
 * RCA Library upsert:
 *   Composite key: label + "\x00" + category + "\x00" + owner + "\x00" + jira
 *   Uses NULL byte (\x00) as delimiter — safe since users cannot type null.
 *   If matching entry found: increment useCount, update lastUsed.
 *   If not found: push new entry with useCount=1.
 *   Library capped at 200 entries (oldest/least-used trimmed).
 *
 * Both pw_reports and pw_rca_library are read and written in a SINGLE
 * chrome.storage.local.get/set pair to minimise race conditions.
 *
 * After successful save:
 *   - Updates count badge
 *   - Re-renders label chips and any visible list/RCA views
 *   - Clears form inputs
 *   - Resets editingKey and buttons
 *   - Shows "Entry saved!" or "Entry updated!" toast
 *
 * REVIEW: If user saves before auto-scrape completes (report.scraped is []),
 * the report fallback object has scraped:[] so report.scraped.length = 0.
 * updateStatusBar will show "0 tests scraped" even though tests are visible.
 * Low probability race but worth knowing.
 */
function saveEntry() {
  var sc   = (document.getElementById("pw-test-sc")   || {}).textContent || "";
  var name = (document.getElementById("pw-test-name") || {}).textContent || "";
  sc   = sc.trim();
  name = name.trim();
  if (!sc || !name) {
    showToast("Click a test first", "error");
    return;
  }

  var labelEl  = document.getElementById("pw-label");
  var rawLabel = labelEl.value.trim();
  if (!rawLabel) {
    labelEl.classList.add("pw-error");
    labelEl.focus();
    showToast("Label is required", "error");
    return;
  }
  labelEl.classList.remove("pw-error");

  var category  = document.getElementById("pw-category").value.trim();
  var owner     = document.getElementById("pw-owner").value.trim();
  var jira      = document.getElementById("pw-jira").value.trim();
  var labelDate = isoToDdMm(document.getElementById("pw-label-date").value);
  var now       = new Date().toISOString();

  /*
   * Key strategy (Issue 1 fix):
   *   If updating an existing entry: use state.editingKey (preserves old SC|name keys for compat)
   *   If creating new: prefer state.currentTestId (unique per parameterized test instance)
   *   Fallback: SC|name (when row has no testId link)
   *
   * sc and name are also stored INSIDE labelData so renderList() and excel.js
   * can display them without needing to parse the key.
   */
  var key = state.editingKey || state.currentTestId || (sc + "|" + name);

  var labelData = {
    label:     rawLabel,
    category:  category,
    owner:     owner,
    jira:      jira,
    labelDate: labelDate,
    timestamp: now,
    sc:        sc,    /* stored for display — renderList/excel no longer parse key */
    name:      name   /* stored for display */
  };

  /* Save report labels to chrome.storage, RCA library to IndexedDB */
  chrome.storage.local.get(["pw_reports"], function (data) {
    var reports = data.pw_reports || {};
    var url     = getReportUrl();
    var report  = reports[url] || { url: url, scraped: [], labels: {}, lastAccessed: now };

    var isUpdate = !!report.labels[key];
    report.labels[key] = labelData;
    report.lastAccessed = now;
    reports[url] = report;

    chrome.storage.local.set({ pw_reports: reports }, function () {
      /* Now upsert the RCA library in IndexedDB */
      rcaGetAll(function (library) {
        var rcaKey = rawLabel + "\x00" + category + "\x00" + owner + "\x00" + jira;
        var found  = false;
        for (var i = 0; i < library.length; i++) {
          var ex    = library[i];
          var exKey = ex.label + "\x00" + (ex.category || "") + "\x00" + (ex.owner || "") + "\x00" + (ex.jira || "");
          if (exKey === rcaKey) {
            library[i].useCount = (library[i].useCount || 1) + 1;
            library[i].lastUsed = now;
            found = true;
            break;
          }
        }
        if (!found) {
          library.push({
            id:       "rca_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
            label:    rawLabel,
            category: category,
            owner:    owner,
            jira:     jira,
            useCount: 1,
            lastUsed: now
          });
        }
        if (library.length > 200) {
          library.sort(function (a, b) { return new Date(b.lastUsed || 0) - new Date(a.lastUsed || 0); });
          library = library.slice(0, 200);
        }
        rcaSaveAll(library, function () {
          refreshCount(Object.keys(report.labels).length);
          renderLabelChips();
          if (document.getElementById("pw-list-section").style.display !== "none") renderList(report);
          if (document.getElementById("pw-rca-section").style.display !== "none") renderRcaLibrary();
          ["pw-label", "pw-category", "pw-owner", "pw-jira"].forEach(function (id) {
            document.getElementById(id).value = "";
          });
          /* Keep editingKey pointing at the just-saved entry so a second
             save (without re-clicking the row) updates the same key instead
             of creating a duplicate. currentTestId cleared — key is now set. */
          state.editingKey    = key;
          state.currentTestId = null;
          document.getElementById("pw-save-btn").textContent              = "Update";
          document.getElementById("pw-delete-current-btn").style.display = "";
          if (report.scraped.length > 0) updateStatusBar(report.scraped.length, Object.keys(report.labels).length, true);
          showToast(isUpdate ? "Entry updated!" : "Entry saved!", "success");
        });
      });
    });
  });
}

/* ======================================================
   SAVED LIST (current report labels)
   ====================================================== */

/**
 * renderList(report)
 * ------------------
 * Renders the saved entries list in the "Saved" tab section (#pw-list-container).
 * Shows all labeled tests for the current report, optionally filtered by date.
 *
 * @param {object} report  The full report object (from getReport() callback).
 *                         Uses: report.labels{}, report.scraped[]
 *
 * Date filter:
 *   If #pw-date-filter-check is checked and #pw-date-filter-input has a value,
 *   filters to only entries whose timestamp matches that date.
 *
 * REVIEW: The date filter compares entry.timestamp (the ISO string of when the
 * label was SAVED) against the selected date — NOT entry.labelDate (the
 * user-chosen date shown in the label). So if a user back-dates a label to
 * 05/03 but saves it on 08/03, the filter will find it under 08/03, not 05/03.
 * This may be confusing. Consider filtering by labelDate instead.
 *
 * Sort: by SC number ascending (numeric, extracted from key "SC_015|...").
 * Tests without a SC number sort to the end (defaults to 99999).
 *
 * For each entry, looks up the result from report.scraped[] by matching
 * sc + name. Falls back to "UNKNOWN" if test is not in scraped list.
 *
 * Card HTML per entry:
 *   .pw-entry-card
 *     .pw-entry-title: [result badge] [SC] [test name]
 *     .pw-entry-label: [DD/MM: ] label text
 *     .pw-entry-meta: category · owner · jira (if any)
 *     [× delete button]
 *
 * Delete buttons get click listeners that call deleteEntry(key).
 *
 * Empty state:
 *   With filter: "No entries for this date."
 *   Without filter: "No labeled entries yet. Click a test..."
 */
function renderList(report) {
  var container = document.getElementById("pw-list-container");
  var labels    = report.labels || {};
  var keys      = Object.keys(labels);

  /* Apply date filter if active */
  var filterChk   = document.getElementById("pw-date-filter-check");
  var filterInput = document.getElementById("pw-date-filter-input");
  var filterDate  = (filterChk && filterChk.checked && filterInput && filterInput.value)
    ? filterInput.value : null; /* "YYYY-MM-DD" */

  if (filterDate) {
    keys = keys.filter(function (key) {
      var ts = labels[key].timestamp;
      if (!ts) return false;
      var d = new Date(ts);
      var ds = d.getFullYear() + "-" +
        String(d.getMonth() + 1).padStart(2, "0") + "-" +
        String(d.getDate()).padStart(2, "0");
      return ds === filterDate;
    });
  }

  if (!keys.length) {
    container.innerHTML = '<div class="pw-list-empty">' +
      (filterDate ? "No entries for this date." : "No labeled entries yet.<br>Click a test and fill in the form.") +
      '</div>';
    return;
  }

  /*
   * Sort by SC number ascending.
   * New entries store sc inside labelData; old entries encode it in the key ("SC_015|name").
   * Read from labelData.sc first, fall back to parsing the key.
   */
  keys.sort(function (a, b) {
    var asc  = (labels[a].sc || a.split("|")[0] || "");
    var bsc  = (labels[b].sc || b.split("|")[0] || "");
    var aNum = parseInt(asc.replace(/\D/g, ""), 10) || 99999;
    var bNum = parseInt(bsc.replace(/\D/g, ""), 10) || 99999;
    return aNum - bNum;
  });

  var html = [];
  keys.forEach(function (key) {
    var e      = labels[key];
    /* New format: sc and name stored in labelData. Old format: parse from key. */
    var parts  = key.split("|");
    var sc     = e.sc    || parts[0];
    var tname  = e.name  || parts.slice(1).join("|");

    /* Result lookup: match by testId (key for new entries) or by SC+name fallback */
    var result = "UNKNOWN";
    (report.scraped || []).forEach(function (s) {
      if (s.testId && s.testId === key) { result = s.result; return; }
      if (s.sc === sc && s.name === tname) result = s.result;
    });

    /* Date prefix: DD/MM from user-set labelDate */
    var datePrefix = e.labelDate ? e.labelDate + ": " : "";

    var rc   = "pw-badge-" + result.toLowerCase();
    var meta = [e.category, e.owner, e.jira].filter(Boolean).join(" \u00b7 ");
    html.push('<div class="pw-entry-card">' +
      '<div class="pw-entry-title">' +
        '<span class="pw-badge ' + rc + '">' + esc(result) + '</span>' +
        '<span class="pw-entry-sc">' + esc(sc) + '</span>' +
        '<span class="pw-entry-name">' + esc(tname) + '</span>' +
      '</div>' +
      '<div class="pw-entry-label"><span class="pw-entry-date">' + esc(datePrefix) + '</span>' + esc(e.label || "No label") + '</div>' +
      (meta ? '<div class="pw-entry-meta">' + esc(meta) + '</div>' : '') +
      '<button class="pw-delete-btn" data-key="' + esc(key) + '" title="Delete">\u2715</button>' +
      '</div>');
  });

  container.innerHTML = html.join("");
  container.querySelectorAll(".pw-delete-btn").forEach(function (btn) {
    btn.addEventListener("click", function (ev) {
      deleteEntry(ev.currentTarget.dataset.key);
    });
  });
}

/**
 * deleteEntry(key)
 * ----------------
 * Deletes a single label entry from the current report by its storage key.
 * Called by the × delete button on each card in the saved list.
 *
 * @param {string} key  Storage key in format "SC_015|Test name"
 *                      Stored as data-key on the delete button.
 *
 * After deletion:
 *   - Updates count badge
 *   - Re-renders the list (removes the deleted card from view)
 *   - Shows "Entry deleted" toast
 *
 * NOTE: Does NOT remove the entry from pw_rca_library. The library is
 * a global reusable store and a single test deletion should not affect it.
 */
function deleteEntry(key) {
  getReport(function (report) {
    delete report.labels[key];
    saveReport(report, function () {
      refreshCount(Object.keys(report.labels).length);
      renderList(report);
      showToast("Entry deleted", "warning");
    });
  });
}

/* ======================================================
   LABEL CHIPS (top 3 from RCA library, fills all 4 fields)
   ====================================================== */

/**
 * renderLabelChips()
 * ------------------
 * Renders up to 3 "quick-fill" chips inside the label field area (#pw-label-chips).
 * Each chip represents a recently used RCA entry and fills all 4 fields on click.
 *
 * Data source: pw_rca_library sorted by lastUsed descending.
 * Takes the top 3 entries.
 *
 * Each chip:
 *   - Shows the label text
 *   - Has an × remove button
 *   - Click (excluding × button): fills pw-label, pw-category, pw-owner, pw-jira
 *     and focuses the label input
 *   - × click: removes the entry from pw_rca_library entirely and re-renders chips
 *
 * Called after:
 *   - init() startup
 *   - saveEntry() (library may have changed)
 *   - RCA delete (library definitely changed)
 *
 * Empty state: if no library entries, sets container innerHTML to "".
 *
 * NOTE: Clicking a chip fills the form fields but does NOT set state.editingKey.
 * So if a test is already loaded and the user clicks a chip, then saves, it
 * creates a new entry using the test from the info card + chip's field values.
 * This is the intended behavior.
 */
function renderLabelChips() {
  var container = document.getElementById("pw-label-chips");
  if (!container) return;
  rcaGetAll(function (library) {
    library = library.sort(function (a, b) {
      return new Date(b.lastUsed || 0) - new Date(a.lastUsed || 0);
    });
    var top = library.slice(0, 3);
    if (!top.length) { container.innerHTML = ""; return; }
    container.innerHTML = top.map(function (h) {
      return '<span class="pw-label-chip" data-val="' + esc(h.label) +
        '" data-category="' + esc(h.category || "") +
        '" data-owner="' + esc(h.owner || "") +
        '" data-jira="' + esc(h.jira || "") + '">' +
        esc(h.label) +
        '<button class="pw-label-chip-remove" data-id="' + esc(h.id) + '" title="Remove">\u00d7</button>' +
        '</span>';
    }).join("");

    container.querySelectorAll(".pw-label-chip").forEach(function (chip) {
      chip.addEventListener("click", function (e) {
        if (e.target.classList.contains("pw-label-chip-remove")) return;
        document.getElementById("pw-label").value    = chip.dataset.val;
        document.getElementById("pw-category").value = chip.dataset.category || "";
        document.getElementById("pw-owner").value    = chip.dataset.owner || "";
        document.getElementById("pw-jira").value     = chip.dataset.jira || "";
        document.getElementById("pw-label").focus();
      });
    });
    container.querySelectorAll(".pw-label-chip-remove").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var id = btn.dataset.id;
        rcaGetAll(function (lib) {
          rcaSaveAll(lib.filter(function (h) { return h.id !== id; }), renderLabelChips);
        });
      });
    });
  });
}

/**
 * refreshCount(n)
 * ---------------
 * Updates the numeric badge on the "Saved" tab showing how many entries
 * have been labeled for the current report.
 *
 * @param {number} [n]  If provided (typeof === "number"), sets the badge
 *                      directly to this value. Avoids a storage read.
 *                      If omitted, reads the count from storage via getReport().
 *
 * Targets: #pw-saved-badge (span inside the Saved tab button)
 *
 * Direct form (n provided): used after save/delete operations where
 * the caller already knows the new count.
 * Storage form (no n): used on init and after operations where the caller
 * doesn't have the count readily available.
 */
function refreshCount(n) {
  if (typeof n === "number") {
    document.getElementById("pw-saved-badge").textContent = n;
    return;
  }
  getReport(function (report) {
    var count = Object.keys(report.labels).length;
    document.getElementById("pw-saved-badge").textContent = count;
  });
}

/* ======================================================
   VIEW SWITCHER
   ====================================================== */

/**
 * showView(view)
 * --------------
 * Controls which of the three main content sections is visible.
 * Exactly one section is shown at a time; the others are hidden (display:none).
 * Also syncs the active state on the corresponding tab button.
 *
 * @param {string} view  "form" | "list" | "rca"
 *
 * Sections toggled (display: "flex" or "none"):
 *   #pw-form-section  — form + test info card
 *   #pw-list-section  — saved entries list
 *   #pw-rca-section   — RCA library
 *
 * Tab buttons toggled (.active class):
 *   #pw-tab-form, #pw-tab-list, #pw-tab-rca
 *
 * NOTE: This function only controls visibility. Callers are responsible
 * for loading data before calling showView (e.g. getReport → renderList
 * should be called BEFORE showView("list") or the list renders with stale data).
 * In practice, attachListeners() does this correctly.
 */
function showView(view) {
  document.getElementById("pw-form-section").style.display = view === "form" ? "flex" : "none";
  document.getElementById("pw-list-section").style.display = view === "list" ? "flex" : "none";
  document.getElementById("pw-rca-section").style.display  = view === "rca"  ? "flex" : "none";
  document.getElementById("pw-tab-form").classList.toggle("active", view === "form");
  document.getElementById("pw-tab-list").classList.toggle("active", view === "list");
  document.getElementById("pw-tab-rca").classList.toggle("active",  view === "rca");
}

/* ======================================================
   RCA LIBRARY TABLE
   ====================================================== */

/**
 * renderRcaLibrary()
 * ------------------
 * Renders the full RCA library as a card list inside #pw-rca-container.
 * Shown in the "Library" tab.
 *
 * Data source: pw_rca_library[] from chrome.storage.local.
 * Each entry shape: { id, label, category, owner, jira, useCount, lastUsed }
 *
 * Sort: by useCount descending (most used entries at the top).
 *
 * Updates #pw-rca-count with "N entries" total.
 *
 * Each card (.pw-rca-card):
 *   .pw-rca-card-label  — the label text
 *   .pw-rca-card-meta   — "category · owner · jira" (only if any fields set)
 *   .pw-rca-card-actions — use count badge + × delete button
 *
 * Card click (excluding × button):
 *   Fills pw-label, pw-category, pw-owner, pw-jira from the entry
 *   and switches to form view. Shows "RCA copied to form" toast.
 *   Useful for re-using an RCA on a new test.
 *
 * × delete button click:
 *   Removes entry from pw_rca_library (filtered by id).
 *   Re-renders both library and chips after deletion.
 *   Shows "RCA entry removed" toast.
 *
 * Empty state: "RCA library is empty. Save entries to build it."
 *
 * NOTE: library variable is captured in the closure for card click handlers.
 * This means the card click handlers use the library as it was when the
 * render happened. If library changes between render and click (unlikely but
 * possible), the entry looked up by id may be stale. Safe in practice.
 */
function renderRcaLibrary() {
  var container = document.getElementById("pw-rca-container");
  var countEl   = document.getElementById("pw-rca-count");

  rcaGetAll(function (library) {
    library = library.sort(function (a, b) {
      return (b.useCount || 0) - (a.useCount || 0);
    });

    if (countEl) countEl.textContent = library.length + " entries";

    if (!library.length) {
      container.innerHTML = '<div class="pw-list-empty">RCA library is empty.<br>Save entries to build it.</div>';
      return;
    }

    var html = [];
    library.forEach(function (e) {
      var meta = [e.category, e.owner, e.jira].filter(Boolean).join(" \u00b7 ");
      html.push(
        '<div class="pw-rca-card" data-id="' + esc(e.id) + '">' +
        '<div class="pw-rca-card-label">' + esc(e.label) + '</div>' +
        (meta ? '<div class="pw-rca-card-meta">' + esc(meta) + '</div>' : '') +
        '<div class="pw-rca-card-actions">' +
        '<span class="pw-rca-use-count">' + (e.useCount || 1) + 'x</span>' +
        '<button class="pw-rca-delete-btn" data-id="' + esc(e.id) + '" title="Delete">\u00d7</button>' +
        '</div>' +
        '</div>'
      );
    });

    container.innerHTML = html.join("");

    container.querySelectorAll(".pw-rca-card").forEach(function (card) {
      card.addEventListener("click", function (ev) {
        if (ev.target.classList.contains("pw-rca-delete-btn")) return;
        var id    = card.dataset.id;
        var entry = library.find(function (e) { return e.id === id; });
        if (entry) {
          document.getElementById("pw-label").value    = entry.label || "";
          document.getElementById("pw-category").value = entry.category || "";
          document.getElementById("pw-owner").value    = entry.owner || "";
          document.getElementById("pw-jira").value     = entry.jira || "";
          showView("form");
          showToast("RCA copied to form", "success");
        }
      });
    });

    container.querySelectorAll(".pw-rca-delete-btn").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        var id = btn.dataset.id;
        rcaGetAll(function (lib) {
          rcaSaveAll(lib.filter(function (e) { return e.id !== id; }), function () {
            renderRcaLibrary();
            renderLabelChips();
            showToast("RCA entry removed", "warning");
          });
        });
      });
    });
  });
}
