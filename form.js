/** Playwright Test Identifier - Form Module v4.0
 * Listeners, autocomplete, populate form, merge/save/delete, saved list, URL watcher,
 * copy-from, label history, date picker, delete all.
 * Depends on: state, ICON_STATUS, normalizeName, esc, showToast, toggleMinimize,
 *             toggleForm, applyPanelPosition, extractRowData, stripDatePrefix,
 *             getDatePrefix, todayDDMM from content.js / ui.js */

/* ======================================================
   LISTENERS
   ====================================================== */
function attachListeners() {
  document.getElementById("pw-save-btn").addEventListener("click", saveEntry);
  document.getElementById("pw-toggle-list-btn").addEventListener("click", toggleList);
  document.getElementById("pw-download-btn").addEventListener("click", downloadExcel);  /* excel.js */
  document.getElementById("pw-dock-left").addEventListener("click", function () {
    state.side = "left"; applyPanelPosition();
  });
  document.getElementById("pw-dock-right").addEventListener("click", function () {
    state.side = "right"; applyPanelPosition();
  });
  document.getElementById("pw-minimize-btn").addEventListener("click", toggleMinimize);
  document.getElementById("pw-toggle-form-btn").addEventListener("click", toggleForm);
  document.getElementById("pw-label").addEventListener("keydown", function (e) {
    if (e.key === "Enter") saveEntry();
  });

  /* Delete current entry button */
  document.getElementById("pw-delete-current-btn").addEventListener("click", deleteCurrentEntry);

  /* Delete All button */
  document.getElementById("pw-delete-all-btn").addEventListener("click", deleteAllEntries);

  /* Date picker */
  var datePicker = document.getElementById("pw-date-picker");
  datePicker.addEventListener("change", function () {
    state.selectedDate = datePicker.value.trim();
    /* Refresh list if open */
    if (document.getElementById("pw-list-section").style.display !== "none") {
      chrome.storage.local.get(["pw_entries"], function (data) {
        renderList(data.pw_entries || []);
      });
    }
  });
  datePicker.addEventListener("blur", function () {
    state.selectedDate = datePicker.value.trim();
  });

  /* All dates checkbox */
  document.getElementById("pw-all-dates").addEventListener("change", function () {
    state.allDates = this.checked;
    if (document.getElementById("pw-list-section").style.display !== "none") {
      chrome.storage.local.get(["pw_entries"], function (data) {
        renderList(data.pw_entries || []);
      });
    }
  });

  /* Merge banner */
  document.getElementById("pw-merge-new").addEventListener("click", function () {
    state.editingId = null;
    document.getElementById("pw-save-btn").textContent = "Save Entry";
    document.getElementById("pw-delete-current-btn").style.display = "none";
    hideMergeBanner();
    ["pw-label", "pw-category", "pw-owner", "pw-jira"].forEach(function (id) {
      document.getElementById(id).value = "";
    });
  });
  document.getElementById("pw-merge-existing").addEventListener("click", function () {
    var dd = document.getElementById("pw-merge-dropdown");
    dd.style.display = dd.style.display === "none" ? "block" : "none";
  });

  /* Space key on merge buttons */
  ["pw-merge-new", "pw-merge-existing"].forEach(function (id) {
    document.getElementById(id).addEventListener("keydown", function (e) {
      if (e.key === " ") { e.preventDefault(); e.target.click(); }
    });
  });

  /* Copy-from button */
  document.getElementById("pw-copy-from-btn").addEventListener("click", toggleCopyFromDropdown);

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
   AUTOCOMPLETE / SUGGESTIONS (uses pw_label_history for label field)
   ====================================================== */
function showSuggestions(field) {
  var input = document.getElementById("pw-" + field);
  var list  = document.getElementById("pw-suggest-" + field);
  var val   = input.value.trim().toLowerCase();

  if (field === "label") {
    /* Use dedicated label history store */
    chrome.storage.local.get(["pw_label_history"], function (data) {
      var history = data.pw_label_history || [];
      var items = history
        .filter(function (h) { return !val || h.text.toLowerCase().indexOf(val) !== -1; })
        .sort(function (a, b) {
          /* Primary: most recently used; Secondary: highest count */
          var da = new Date(a.lastUsed || 0).getTime();
          var db = new Date(b.lastUsed || 0).getTime();
          if (db !== da) return db - da;
          return (b.useCount || 0) - (a.useCount || 0);
        });

      if (!items.length) { list.style.display = "none"; return; }
      list.innerHTML = items.slice(0, 10).map(function (h) {
        return '<div class="pw-suggest-item" data-val="' + esc(h.text) + '">' +
          esc(h.text) +
          ' <span class="pw-suggest-count">(' + (h.useCount || 1) + 'x)</span>' +
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
    return;
  }

  /* For category/owner/jira: use pw_entries frequency */
  chrome.storage.local.get(["pw_entries"], function (data) {
    var entries = data.pw_entries || [];
    var seen = {}, freq = {};
    entries.forEach(function (e) {
      var v = (e[field] || "").trim();
      if (v) { freq[v] = (freq[v] || 0) + 1; seen[v] = true; }
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
   COPY FROM... (reuse metadata across different tests)
   ====================================================== */
function toggleCopyFromDropdown() {
  var dd = document.getElementById("pw-copy-from-dropdown");
  if (dd.style.display !== "none") { dd.style.display = "none"; return; }

  chrome.storage.local.get(["pw_entries"], function (data) {
    var entries = data.pw_entries || [];
    if (!entries.length) {
      showToast("No saved entries to copy from", "warning");
      return;
    }

    /* Deduplicate by label+category combo, keep last 20 unique */
    var seen = {};
    var unique = [];
    for (var i = entries.length - 1; i >= 0 && unique.length < 20; i--) {
      var e = entries[i];
      var key = (e.label || "") + "|" + (e.category || "") + "|" + (e.owner || "") + "|" + (e.jira || "");
      if (!seen[key]) {
        seen[key] = true;
        unique.push(e);
      }
    }

    dd.innerHTML = unique.map(function (e) {
      var parts = [stripDatePrefix(e.label), e.category, e.owner, e.jira].filter(Boolean);
      var summary = parts.length ? esc(parts.join(" \u00b7 ")) : "<em>Empty</em>";
      return '<div class="pw-copy-option" data-label="' + esc(e.label || "") + '" data-category="' + esc(e.category || "") + '" data-owner="' + esc(e.owner || "") + '" data-jira="' + esc(e.jira || "") + '">' +
        summary + '</div>';
    }).join("");
    dd.style.display = "block";

    dd.querySelectorAll(".pw-copy-option").forEach(function (opt) {
      opt.addEventListener("click", function () {
        /* Fill only metadata fields, stripped of date prefix */
        document.getElementById("pw-label").value    = stripDatePrefix(opt.dataset.label || "");
        document.getElementById("pw-category").value = opt.dataset.category || "";
        document.getElementById("pw-owner").value    = opt.dataset.owner    || "";
        document.getElementById("pw-jira").value     = opt.dataset.jira     || "";
        /* This is always a NEW save, not an update */
        state.editingId = null;
        document.getElementById("pw-save-btn").textContent = "Save Entry";
        document.getElementById("pw-delete-current-btn").style.display = "none";
        dd.style.display = "none";
        showToast("Metadata copied", "success");
      });
    });
  });
}

/* ======================================================
   POPULATE FORM (uses shared extractRowData)
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

  state.editingId = null;
  document.getElementById("pw-save-btn").textContent            = "Save Entry";
  document.getElementById("pw-delete-current-btn").style.display = "none";
  document.getElementById("pw-copy-from-dropdown").style.display = "none";

  if (state.formHidden) toggleForm();
  checkExistingEntries(data.sc, data.name);
  document.getElementById("pw-label").focus();
  if (state.minimized) toggleMinimize();
}

function updateResultBadge(result) {
  var badge = document.getElementById("pw-result-badge");
  badge.className  = "pw-result-display pw-rbadge-" + result.toLowerCase();
  badge.textContent = result;
}

/* ======================================================
   MERGE / UPDATE EXISTING
   ====================================================== */
function checkExistingEntries(sc, name) {
  chrome.storage.local.get(["pw_entries"], function (data) {
    var entries      = data.pw_entries || [];
    var exactMatches = [];
    entries.forEach(function (e, idx) {
      if (e.sc === sc && e.name === name) exactMatches.push({ entry: e, idx: idx });
    });
    if (!exactMatches.length) { hideMergeBanner(); return; }

    var labelFreq = {};
    entries.forEach(function (e) {
      var l = (e.label || "").trim();
      if (l) labelFreq[l] = (labelFreq[l] || 0) + 1;
    });
    exactMatches.sort(function (a, b) {
      return (labelFreq[b.entry.label] || 0) - (labelFreq[a.entry.label] || 0);
    });

    document.getElementById("pw-merge-msg").textContent =
      exactMatches.length + " existing entr" + (exactMatches.length === 1 ? "y" : "ies") + " found";
    document.getElementById("pw-merge-banner").style.display = "block";

    var dd = document.getElementById("pw-merge-dropdown");
    dd.innerHTML = exactMatches.map(function (m) {
      var e     = m.entry;
      var parts = [stripDatePrefix(e.label), e.category, e.owner, e.jira].filter(Boolean);
      var summary = parts.length ? esc(parts.join(" \u00b7 ")) : "<em>No details</em>";
      var freq  = labelFreq[e.label] || 0;
      return '<div class="pw-merge-option" data-id="' + e.id + '">' +
        '<span class="pw-merge-option-text">' + summary + '</span>' +
        (freq > 1 ? '<span class="pw-merge-option-freq">' + freq + 'x</span>' : '') +
        '</div>';
    }).join("");
    dd.style.display = "none";

    dd.querySelectorAll(".pw-merge-option").forEach(function (opt) {
      opt.addEventListener("click", function () {
        var id    = opt.dataset.id;
        var found = entries.find(function (e) { return e.id === id; });
        if (found) {
          document.getElementById("pw-label").value    = stripDatePrefix(found.label) || "";
          document.getElementById("pw-category").value = found.category || "";
          document.getElementById("pw-owner").value    = found.owner    || "";
          document.getElementById("pw-jira").value     = found.jira     || "";
          state.editingId = id;
          document.getElementById("pw-save-btn").textContent              = "Update Entry";
          document.getElementById("pw-delete-current-btn").style.display = "";
        }
        dd.style.display = "none";
      });
    });
  });
}

function hideMergeBanner() {
  document.getElementById("pw-merge-banner").style.display  = "none";
  document.getElementById("pw-merge-dropdown").style.display = "none";
}

/* ======================================================
   DELETE CURRENT ENTRY (in-form)
   ====================================================== */
function deleteCurrentEntry() {
  if (!state.editingId) return;
  chrome.storage.local.get(["pw_entries"], function (data) {
    var entries = (data.pw_entries || []).filter(function (e) { return e.id !== state.editingId; });
    chrome.storage.local.set({ pw_entries: entries }, function () {
      refreshCount(entries.length);
      if (document.getElementById("pw-list-section").style.display !== "none") renderList(entries);
      showToast("Entry deleted", "warning");
      state.editingId = null;
      document.getElementById("pw-save-btn").textContent              = "Save Entry";
      document.getElementById("pw-delete-current-btn").style.display = "none";
      ["pw-label", "pw-category", "pw-owner", "pw-jira"].forEach(function (id) {
        document.getElementById(id).value = "";
      });
      hideMergeBanner();
      var sc   = document.getElementById("pw-sc").value;
      var name = document.getElementById("pw-name").value;
      if (sc && name) checkExistingEntries(sc, name);
    });
  });
}

/* ======================================================
   DELETE ALL
   ====================================================== */
function deleteAllEntries() {
  if (!confirm("Delete ALL saved entries and scraped data? This cannot be undone.")) return;
  chrome.storage.local.remove(["pw_entries", "pw_scraped", "pw_label_history"], function () {
    refreshCount(0);
    var container = document.getElementById("pw-list-container");
    if (container) container.innerHTML = '<div class="pw-list-empty">No saved entries yet.</div>';
    var section = document.getElementById("pw-list-section");
    if (section) section.style.display = "none";
    document.getElementById("pw-toggle-list-btn").classList.remove("active");
    showToast("All data cleared", "warning");
  });
}

/* ======================================================
   SAVE / UPDATE (with date prefix + label history)
   ====================================================== */
function saveEntry() {
  var labelEl = document.getElementById("pw-label");
  var rawLabel = labelEl.value.trim();
  if (!rawLabel) {
    labelEl.classList.add("pw-error");
    labelEl.focus();
    showToast("Label is required", "error");
    return;
  }
  labelEl.classList.remove("pw-error");

  /* Add date prefix: "DD/MM: description" */
  var dateStr = state.selectedDate || todayDDMM();
  var labelForHistory = rawLabel;  /* without prefix, for history storage */
  var label = dateStr + ": " + rawLabel;

  var entryData = {
    sc:        document.getElementById("pw-sc").value,
    name:      document.getElementById("pw-name").value,
    result:    document.getElementById("pw-result").value,
    label:     label,
    category:  document.getElementById("pw-category").value.trim(),
    owner:     document.getElementById("pw-owner").value.trim(),
    jira:      document.getElementById("pw-jira").value.trim(),
    timestamp: new Date().toISOString()
  };

  chrome.storage.local.get(["pw_entries", "pw_label_history"], function (data) {
    var entries = data.pw_entries || [];
    var history = data.pw_label_history || [];

    if (state.editingId) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].id === state.editingId) {
          entryData.id = state.editingId;
          entries[i]   = entryData;
          break;
        }
      }
      showToast("Entry updated!", "success");
    } else {
      entryData.id = "entry_" + Date.now();
      entries.push(entryData);
      showToast("Entry saved!", "success");
    }

    /* Update label history (using raw label without date prefix) */
    var foundH = false;
    for (var h = 0; h < history.length; h++) {
      if (history[h].text === labelForHistory) {
        history[h].useCount = (history[h].useCount || 1) + 1;
        history[h].lastUsed = new Date().toISOString();
        foundH = true;
        break;
      }
    }
    if (!foundH) {
      history.push({ text: labelForHistory, useCount: 1, lastUsed: new Date().toISOString() });
    }

    chrome.storage.local.set({ pw_entries: entries, pw_label_history: history }, function () {
      refreshCount(entries.length);
      if (document.getElementById("pw-list-section").style.display !== "none") renderList(entries);
      ["pw-label", "pw-category", "pw-owner", "pw-jira"].forEach(function (id) {
        document.getElementById(id).value = "";
      });
      state.editingId = null;
      document.getElementById("pw-save-btn").textContent              = "Save Entry";
      document.getElementById("pw-delete-current-btn").style.display = "none";
      hideMergeBanner();
    });
  });
}

/* ======================================================
   SAVED LIST (date-filtered, recommendation sorted)
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
    chrome.storage.local.get(["pw_entries"], function (data) {
      renderList(data.pw_entries || []);
    });
  }
}

function renderList(entries) {
  var container = document.getElementById("pw-list-container");

  /* Date filter */
  var filtered = entries;
  if (!state.allDates && state.selectedDate) {
    var prefix = state.selectedDate + ":";
    filtered = entries.filter(function (e) {
      return (e.label || "").indexOf(prefix) === 0;
    });
  }

  if (!filtered.length) {
    var msg = entries.length ? "No entries for " + (state.selectedDate || "this date") + "." : "No saved entries yet.";
    container.innerHTML = '<div class="pw-list-empty">' + msg + '<br>Click a test and fill in the form.</div>';
    return;
  }

  /* Group by test, sort by frequency (most entries first = recommendation) */
  var groups = {};
  filtered.forEach(function (e, idx) {
    /* Find the original index in the full entries array for deletion */
    var origIdx = entries.indexOf(e);
    var key = e.sc + "|" + e.name;
    if (!groups[key]) groups[key] = { sc: e.sc, name: e.name, items: [] };
    groups[key].items.push({ entry: e, idx: origIdx });
  });
  var sorted = Object.values(groups).sort(function (a, b) { return b.items.length - a.items.length; });

  var html = [];
  sorted.forEach(function (group) {
    html.push('<div class="pw-group-header">' +
      '<span class="pw-group-name">[' + esc(group.sc) + '] ' + esc(group.name) + '</span>' +
      '<span class="pw-group-count">' + group.items.length + 'x</span>' +
      '</div>');
    group.items.forEach(function (item) {
      var e   = item.entry;
      var rc  = "pw-badge-" + (e.result || "unknown").toLowerCase();
      var meta = [e.category, e.owner, e.jira].filter(Boolean).join(" \u00b7 ");
      html.push('<div class="pw-entry-card">' +
        '<div class="pw-entry-title">' +
          '<span class="pw-badge ' + rc + '">' + esc(e.result) + '</span> ' +
          esc(stripDatePrefix(e.label) || "No label") +
        '</div>' +
        (meta ? '<div class="pw-entry-meta">' + esc(meta) + '</div>' : '') +
        '<button class="pw-delete-btn" data-idx="' + item.idx + '" title="Delete">\u2715</button>' +
        '</div>');
    });
  });

  container.innerHTML = html.join("");
  container.querySelectorAll(".pw-delete-btn").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      deleteEntry(parseInt(e.currentTarget.dataset.idx, 10));
    });
  });
}

function deleteEntry(idx) {
  chrome.storage.local.get(["pw_entries"], function (data) {
    var entries = data.pw_entries || [];
    entries.splice(idx, 1);
    chrome.storage.local.set({ pw_entries: entries }, function () {
      refreshCount(entries.length);
      renderList(entries);
      showToast("Entry deleted", "warning");
    });
  });
}

function refreshCount(n) {
  if (typeof n === "number") {
    document.getElementById("pw-toggle-list-btn").textContent = "View Saved (" + n + ")";
    return;
  }
  chrome.storage.local.get(["pw_entries"], function (data) {
    document.getElementById("pw-toggle-list-btn").textContent =
      "View Saved (" + (data.pw_entries || []).length + ")";
  });
}
