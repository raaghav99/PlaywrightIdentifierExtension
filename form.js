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
   LISTENERS
   ====================================================== */
function attachListeners() {
  document.getElementById("pw-save-btn").addEventListener("click", saveEntry);
  document.getElementById("pw-toggle-list-btn").addEventListener("click", toggleList);
  document.getElementById("pw-download-btn").addEventListener("click", downloadExcel);  /* excel.js */
  document.getElementById("pw-scrape-btn").addEventListener("click", function () {
    var btn      = document.getElementById("pw-scrape-btn");
    var spinner  = document.getElementById("pw-scrape-spinner");
    var dlBtn    = document.getElementById("pw-download-btn");
    btn.disabled = true;
    dlBtn.disabled = true;
    spinner.style.display = "inline-block";
    scrapeAllTests(function (count) {
      spinner.style.display = "none";
      btn.disabled  = false;
      dlBtn.disabled = false;
      refreshCount();
      showToast("Scraped " + count + " row" + (count === 1 ? "" : "s"), "success");
    });
  });
  document.getElementById("pw-dock-left").addEventListener("click", function () {
    state.side = "left"; applyPanelPosition();
  });
  document.getElementById("pw-dock-right").addEventListener("click", function () {
    state.side = "right"; applyPanelPosition();
  });
  document.getElementById("pw-minimize-btn").addEventListener("click", toggleMinimize);
  document.getElementById("pw-toggle-rca-btn").addEventListener("click", toggleRcaLibrary);
  document.getElementById("pw-label").addEventListener("keydown", function (e) {
    if (e.key === "Enter") saveEntry();
  });

  /* Delete current entry button */
  document.getElementById("pw-delete-current-btn").addEventListener("click", deleteCurrentEntry);

  /* Delete All button */
  document.getElementById("pw-delete-all-btn").addEventListener("click", deleteAllEntries);

  /* Copy-from button */
  document.getElementById("pw-copy-from-btn").addEventListener("click", toggleCopyFromDropdown);

  /* Prevent keystrokes inside panel from reaching Playwright's scroll handlers */
  var panel = document.getElementById("pw-ext-panel");
  panel.addEventListener("keydown", function (e) { e.stopPropagation(); }, true);
  panel.addEventListener("keypress", function (e) { e.stopPropagation(); }, true);

  /* Autocomplete for fields */
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
  new MutationObserver(function () {
    if (!document.getElementById("pw-ext-panel")) init();
  }).observe(document.body, { childList: true, subtree: false });
}

/* ======================================================
   URL WATCHER
   ====================================================== */
function setupUrlWatcher() {
  setInterval(function () {
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

  document.getElementById("pw-sc").value     = data.sc;
  document.getElementById("pw-name").value   = data.name;
  document.getElementById("pw-result").value = data.result;
  updateResultBadge(data.result);

  ["pw-label", "pw-category", "pw-owner", "pw-jira"].forEach(function (id) {
    document.getElementById(id).value = "";
    document.getElementById(id).classList.remove("pw-error");
  });

  state.editingKey = null;
  document.getElementById("pw-save-btn").textContent            = "Save Entry";
  document.getElementById("pw-delete-current-btn").style.display = "none";
  document.getElementById("pw-copy-from-dropdown").style.display = "none";

  /* Check if this test already has a label in current report */
  var key = data.sc + "|" + data.name;
  getReport(function (report) {
    var existing = report.labels[key];
    if (existing) {
      document.getElementById("pw-label").value    = existing.label || "";
      document.getElementById("pw-category").value = existing.category || "";
      document.getElementById("pw-owner").value    = existing.owner || "";
      document.getElementById("pw-jira").value     = existing.jira || "";
      state.editingKey = key;
      document.getElementById("pw-save-btn").textContent              = "Update Entry";
      document.getElementById("pw-delete-current-btn").style.display = "";
    }
  });

  document.getElementById("pw-label").focus();
  if (state.minimized) toggleMinimize();
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
      var container = document.getElementById("pw-list-container");
      if (container) container.innerHTML = '<div class="pw-list-empty">No labeled entries yet.</div>';
      var section = document.getElementById("pw-list-section");
      if (section) section.style.display = "none";
      document.getElementById("pw-toggle-list-btn").classList.remove("active");
      showToast("Report labels cleared", "warning");
    });
  });
}

/* ======================================================
   SAVE / UPDATE
   ====================================================== */
function saveEntry() {
  var sc   = document.getElementById("pw-sc").value;
  var name = document.getElementById("pw-name").value;
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

  var category = document.getElementById("pw-category").value.trim();
  var owner    = document.getElementById("pw-owner").value.trim();
  var jira     = document.getElementById("pw-jira").value.trim();
  var now      = new Date().toISOString();
  var key      = sc + "|" + name;

  var labelData = {
    label:     rawLabel,
    category:  category,
    owner:     owner,
    jira:      jira,
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
    var rcaKey = rawLabel + "|" + category + "|" + owner + "|" + jira;
    var found  = false;
    for (var i = 0; i < library.length; i++) {
      var ex = library[i];
      var exKey = ex.label + "|" + (ex.category || "") + "|" + (ex.owner || "") + "|" + (ex.jira || "");
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
      showToast(isUpdate ? "Entry updated!" : "Entry saved!", "success");
    });
  });
}

/* ======================================================
   SAVED LIST (current report labels)
   ====================================================== */
function toggleList() {
  var section = document.getElementById("pw-list-section");
  var btn     = document.getElementById("pw-toggle-list-btn");
  if (section.style.display !== "none") {
    section.style.display = "none";
    btn.classList.remove("active");
  } else {
    section.style.display = "block";
    btn.classList.add("active");
    getReport(function (report) {
      renderList(report);
    });
  }
}

function renderList(report) {
  var container = document.getElementById("pw-list-container");
  var labels    = report.labels || {};
  var keys      = Object.keys(labels);

  if (!keys.length) {
    container.innerHTML = '<div class="pw-list-empty">No labeled entries yet.<br>Click a test and fill in the form.</div>';
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

    var rc   = "pw-badge-" + result.toLowerCase();
    var meta = [e.category, e.owner, e.jira].filter(Boolean).join(" \u00b7 ");
    html.push('<div class="pw-entry-card">' +
      '<div class="pw-entry-title">' +
        '<span class="pw-badge ' + rc + '">' + esc(result) + '</span> ' +
        '[' + esc(sc) + '] ' + esc(tname) +
      '</div>' +
      '<div class="pw-entry-label">' + esc(e.label || "No label") + '</div>' +
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
    document.getElementById("pw-toggle-list-btn").textContent = "View Saved (" + n + ")";
    return;
  }
  getReport(function (report) {
    var count = Object.keys(report.labels).length;
    document.getElementById("pw-toggle-list-btn").textContent = "View Saved (" + count + ")";
  });
}

/* ======================================================
   RCA LIBRARY TABLE (toggled by hamburger)
   ====================================================== */
function toggleRcaLibrary() {
  var section = document.getElementById("pw-rca-section");
  if (section.style.display !== "none") {
    section.style.display = "none";
  } else {
    section.style.display = "block";
    renderRcaLibrary();
  }
}

function renderRcaLibrary() {
  var container = document.getElementById("pw-rca-container");
  var countEl   = document.getElementById("pw-rca-count");

  chrome.storage.local.get(["pw_rca_library"], function (data) {
    var library = (data.pw_rca_library || []).sort(function (a, b) {
      return (b.useCount || 0) - (a.useCount || 0);
    });

    if (countEl) countEl.textContent = "(" + library.length + ")";

    if (!library.length) {
      container.innerHTML = '<div class="pw-list-empty">RCA library is empty.<br>Save entries to build it.</div>';
      return;
    }

    var html = ['<table class="pw-rca-table"><thead><tr>',
      '<th>Label</th><th>Category</th><th>Owner</th><th>Jira</th><th>Used</th><th></th>',
      '</tr></thead><tbody>'];

    library.forEach(function (e) {
      html.push('<tr class="pw-rca-row" data-id="' + esc(e.id) + '">');
      html.push('<td>' + esc(e.label) + '</td>');
      html.push('<td>' + esc(e.category || "") + '</td>');
      html.push('<td>' + esc(e.owner || "") + '</td>');
      html.push('<td>' + esc(e.jira || "") + '</td>');
      html.push('<td>' + (e.useCount || 1) + 'x</td>');
      html.push('<td><button class="pw-rca-delete-btn" data-id="' + esc(e.id) + '" title="Delete">\u00d7</button></td>');
      html.push('</tr>');
    });

    html.push('</tbody></table>');
    container.innerHTML = html.join("");

    container.querySelectorAll(".pw-rca-row").forEach(function (row) {
      row.addEventListener("click", function (ev) {
        if (ev.target.classList.contains("pw-rca-delete-btn")) return;
        var id    = row.dataset.id;
        var entry = library.find(function (e) { return e.id === id; });
        if (entry) {
          document.getElementById("pw-label").value    = entry.label || "";
          document.getElementById("pw-category").value = entry.category || "";
          document.getElementById("pw-owner").value    = entry.owner || "";
          document.getElementById("pw-jira").value     = entry.jira || "";
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
