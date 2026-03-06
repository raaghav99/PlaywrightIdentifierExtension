/** Playwright Test Identifier - Form Module v3.0
 * Listeners, autocomplete, populate form, merge/save/delete, saved list, URL watcher.
 * Depends on: state, ICON_STATUS, normalizeName, esc, showToast, toggleMinimize,
 *             toggleForm, applyPanelPosition from content.js / ui.js */

/* ══════════════════════════════════════════
   LISTENERS
   ══════════════════════════════════════════ */
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

/* ══════════════════════════════════════════
   URL WATCHER
   ══════════════════════════════════════════ */
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

/* ══════════════════════════════════════════
   AUTOCOMPLETE / SUGGESTIONS
   ══════════════════════════════════════════ */
function showSuggestions(field) {
  var input = document.getElementById("pw-" + field);
  var list  = document.getElementById("pw-suggest-" + field);
  var val   = input.value.trim().toLowerCase();

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
        input.value        = el.dataset.val;
        list.style.display = "none";
      });
    });
  });
}

/* ══════════════════════════════════════════
   POPULATE FORM
   ══════════════════════════════════════════ */
function populateForm(row) {
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

  /* Name from title — normalized */
  var titleEl = row.querySelector(".test-file-title");
  var rawName = titleEl ? titleEl.textContent.trim() : "";
  rawName = rawName.replace(/\s*\(retry\s*\d+\)\s*/gi, "").trim();
  var name = normalizeName(rawName);

  /* Fill form */
  document.getElementById("pw-sc").value     = sc;
  document.getElementById("pw-name").value   = name;
  document.getElementById("pw-result").value = result;
  updateResultBadge(result);

  ["pw-label", "pw-category", "pw-owner", "pw-jira"].forEach(function (id) {
    document.getElementById(id).value = "";
    document.getElementById(id).classList.remove("pw-error");
  });

  state.editingId = null;
  document.getElementById("pw-save-btn").textContent            = "Save Entry";
  document.getElementById("pw-delete-current-btn").style.display = "none";

  if (state.formHidden) toggleForm();
  checkExistingEntries(sc, name);
  document.getElementById("pw-label").focus();
  if (state.minimized) toggleMinimize();
}

function updateResultBadge(result) {
  var badge = document.getElementById("pw-result-badge");
  badge.className  = "pw-result-display pw-rbadge-" + result.toLowerCase();
  badge.textContent = result;
}

/* ══════════════════════════════════════════
   MERGE / UPDATE EXISTING
   ══════════════════════════════════════════ */
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
      var parts = [e.label, e.category, e.owner, e.jira].filter(Boolean);
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
          document.getElementById("pw-label").value    = found.label    || "";
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

/* ══════════════════════════════════════════
   DELETE CURRENT ENTRY (in-form)
   ══════════════════════════════════════════ */
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

/* ══════════════════════════════════════════
   SAVE / UPDATE
   ══════════════════════════════════════════ */
function saveEntry() {
  var labelEl = document.getElementById("pw-label");
  var label   = labelEl.value.trim();
  if (!label) {
    labelEl.classList.add("pw-error");
    labelEl.focus();
    showToast("Label is required", "error");
    return;
  }
  labelEl.classList.remove("pw-error");

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

  chrome.storage.local.get(["pw_entries"], function (data) {
    var entries = data.pw_entries || [];
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

    chrome.storage.local.set({ pw_entries: entries }, function () {
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

/* ══════════════════════════════════════════
   SAVED LIST
   ══════════════════════════════════════════ */
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
  if (!entries.length) {
    container.innerHTML = '<div class="pw-list-empty">No saved entries yet.<br>Click a test and fill in the form.</div>';
    return;
  }

  /* Group by test, sort by frequency */
  var groups = {};
  entries.forEach(function (e, idx) {
    var key = e.sc + "|" + e.name;
    if (!groups[key]) groups[key] = { sc: e.sc, name: e.name, items: [] };
    groups[key].items.push({ entry: e, idx: idx });
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
          esc(e.label || "No label") +
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
