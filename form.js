/** Playwright Test Identifier - Form Module v5.1
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

function initTheme() {
  var saved = "";
  try { saved = localStorage.getItem("pw-theme") || ""; } catch(e) {}
  /* Fallback: mirror Playwright's own dark class or system preference */
  var playwrightDark = document.documentElement.classList.contains("dark");
  var prefersDark    = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  var dark = saved ? saved === "dark" : (playwrightDark || prefersDark);
  applyTheme(dark);
}

function todayIso() {
  var t = new Date();
  return t.getFullYear() + "-" +
    String(t.getMonth() + 1).padStart(2, "0") + "-" +
    String(t.getDate()).padStart(2, "0");
}

function isoToDdMm(isoDate) {
  /* "YYYY-MM-DD" → "DD/MM" */
  var parts = (isoDate || "").split("-");
  if (parts.length < 3) return "";
  return parts[2] + "/" + parts[1];
}

/* ======================================================
   LISTENERS
   ====================================================== */
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

  document.getElementById("pw-page-toggle").addEventListener("click", toggleMinimize);
  document.getElementById("pw-theme-btn").addEventListener("click", function () {
    applyTheme(!document.documentElement.classList.contains("pw-dark"));
  });

  /* Keyboard — Enter in label field saves */
  document.getElementById("pw-label").addEventListener("keydown", function (e) {
    if (e.key === "Enter") saveEntry();
  });

  /* Initialise date picker to today */
  document.getElementById("pw-label-date").value = todayIso();

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
function setupUrlWatcher() {
  if (state.urlWatchInterval) clearInterval(state.urlWatchInterval);
  state.urlWatchInterval = setInterval(function () {
    if (location.href !== state.lastUrl) {
      state.lastUrl = location.href;
      onUrlChange();
    }
  }, 300);

  document.addEventListener("keydown", function (e) {
    if (e.target.closest("#pw-ext-panel")) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      setTimeout(function () {
        if (location.href !== state.lastUrl) {
          state.lastUrl = location.href;
          onUrlChange();
        }
      }, 400);
    }
  });
}

function onUrlChange() {
  setTimeout(function () {
    var hash        = location.hash || "";
    var testIdMatch = hash.match(/testId=([^&]+)/);
    if (!testIdMatch) return;
    var testId = decodeURIComponent(testIdMatch[1]);
    var link   = document.querySelector('a[href*="testId=' + CSS.escape(testId) + '"]');
    if (!link)  link = document.querySelector('a[href*="testId=' + testId + '"]');
    if (link) {
      var row = link.closest(".test-file-test");
      if (row) populateForm(row);
    }
  }, 200);
}

/* ======================================================
   AUTOCOMPLETE / SUGGESTIONS (pulls from pw_rca_library)
   ====================================================== */
function showSuggestions(field) {
  var input = document.getElementById("pw-" + field);
  var list  = document.getElementById("pw-suggest-" + field);
  var val   = input.value.trim().toLowerCase();

  chrome.storage.local.get(["pw_rca_library"], function (data) {
    var library = data.pw_rca_library || [];
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
function toggleCopyFromDropdown() {
  var dd = document.getElementById("pw-copy-from-dropdown");
  if (dd.style.display !== "none") { dd.style.display = "none"; return; }

  chrome.storage.local.get(["pw_rca_library"], function (data) {
    var library = data.pw_rca_library || [];
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
        document.getElementById("pw-save-btn").textContent = "Save Entry";
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

  state.editingKey = null;
  document.getElementById("pw-save-btn").textContent             = "Save";
  document.getElementById("pw-delete-current-btn").style.display = "none";
  document.getElementById("pw-copy-from-dropdown").style.display = "none";

  /* Check if this test already has a label */
  var key = data.sc + "|" + data.name;
  getReport(function (report) {
    var existing = report.labels[key];
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
      state.editingKey = key;
      document.getElementById("pw-save-btn").textContent             = "Update";
      document.getElementById("pw-delete-current-btn").style.display = "";
    } else {
      /* Fresh test — reset date picker to today */
      document.getElementById("pw-label-date").value = todayIso();
    }
  });

  document.getElementById("pw-label").focus();
  if (state.minimized) toggleMinimize();
  showView("form");
}

function updateResultBadge(result) {
  var badge = document.getElementById("pw-result-badge");
  badge.className  = "pw-result-display pw-rbadge-" + result.toLowerCase();
  badge.textContent = result;
}

/* ======================================================
   DELETE CURRENT ENTRY (in-form)
   ====================================================== */
function deleteCurrentEntry() {
  if (!state.editingKey) return;
  getReport(function (report) {
    delete report.labels[state.editingKey];
    saveReport(report, function () {
      refreshCount(Object.keys(report.labels).length);
      if (document.getElementById("pw-list-section").style.display !== "none") renderList(report);
      showToast("Entry deleted", "warning");
      state.editingKey = null;
      document.getElementById("pw-save-btn").textContent              = "Save Entry";
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
  var key       = sc + "|" + name;

  var labelData = {
    label:     rawLabel,
    category:  category,
    owner:     owner,
    jira:      jira,
    labelDate: labelDate,
    timestamp: now
  };

  /* Need both pw_reports and pw_rca_library in one transaction */
  chrome.storage.local.get(["pw_reports", "pw_rca_library"], function (data) {
    var reports = data.pw_reports || {};
    var url     = getReportUrl();
    var report  = reports[url] || { url: url, scraped: [], labels: {}, lastAccessed: now };
    var library = data.pw_rca_library || [];

    var isUpdate = !!report.labels[key];

    /* Write to current report labels (one per test) */
    report.labels[key] = labelData;
    report.lastAccessed = now;
    reports[url] = report;

    /* Upsert pw_rca_library: match by all 4 fields */
    var rcaKey = rawLabel + "\x00" + category + "\x00" + owner + "\x00" + jira;
    var found  = false;
    for (var i = 0; i < library.length; i++) {
      var ex = library[i];
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
        id:       "rca_" + Date.now(),
        label:    rawLabel,
        category: category,
        owner:    owner,
        jira:     jira,
        useCount: 1,
        lastUsed: now
      });
    }

    /* Cap library at 200 entries */
    if (library.length > 200) {
      library.sort(function (a, b) {
        return new Date(b.lastUsed || 0) - new Date(a.lastUsed || 0);
      });
      library = library.slice(0, 200);
    }

    chrome.storage.local.set({ pw_reports: reports, pw_rca_library: library }, function () {
      refreshCount(Object.keys(report.labels).length);
      renderLabelChips();
      if (document.getElementById("pw-list-section").style.display !== "none") renderList(report);
      if (document.getElementById("pw-rca-section").style.display !== "none") renderRcaLibrary();

      ["pw-label", "pw-category", "pw-owner", "pw-jira"].forEach(function (id) {
        document.getElementById(id).value = "";
      });
      state.editingKey = null;
      document.getElementById("pw-save-btn").textContent              = "Save Entry";
      document.getElementById("pw-delete-current-btn").style.display = "none";
      if (report.scraped.length > 0) updateStatusBar(report.scraped.length, Object.keys(report.labels).length, true);
      showToast(isUpdate ? "Entry updated!" : "Entry saved!", "success");
    });
  });
}

/* ======================================================
   SAVED LIST (current report labels)
   ====================================================== */
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

  keys.sort(function (a, b) {
    var aNum = parseInt((a.split("|")[0] || "").replace(/\D/g, ""), 10) || 99999;
    var bNum = parseInt((b.split("|")[0] || "").replace(/\D/g, ""), 10) || 99999;
    return aNum - bNum;
  });

  var html = [];
  keys.forEach(function (key) {
    var parts  = key.split("|");
    var sc     = parts[0];
    var tname  = parts.slice(1).join("|");
    var e      = labels[key];

    var result = "UNKNOWN";
    (report.scraped || []).forEach(function (s) {
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
function renderLabelChips() {
  var container = document.getElementById("pw-label-chips");
  if (!container) return;
  chrome.storage.local.get(["pw_rca_library"], function (data) {
    var library = (data.pw_rca_library || []).sort(function (a, b) {
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
        chrome.storage.local.get(["pw_rca_library"], function (d) {
          var updated = (d.pw_rca_library || []).filter(function (h) { return h.id !== id; });
          chrome.storage.local.set({ pw_rca_library: updated }, renderLabelChips);
        });
      });
    });
  });
}

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
function renderRcaLibrary() {
  var container = document.getElementById("pw-rca-container");
  var countEl   = document.getElementById("pw-rca-count");

  chrome.storage.local.get(["pw_rca_library"], function (data) {
    var library = (data.pw_rca_library || []).sort(function (a, b) {
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
        chrome.storage.local.get(["pw_rca_library"], function (d) {
          var updated = (d.pw_rca_library || []).filter(function (e) { return e.id !== id; });
          chrome.storage.local.set({ pw_rca_library: updated }, function () {
            renderRcaLibrary();
            renderLabelChips();
            showToast("RCA entry removed", "warning");
          });
        });
      });
    });
  });
}
