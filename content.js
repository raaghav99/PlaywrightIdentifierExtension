/** Playwright Test Identifier - Content Script v3.0
 * Injected into Playwright HTML report pages. */

(function () {
  if (document.getElementById("pw-ext-panel")) return;

  function isPlaywrightReport() {
    if ((document.title || "").toLowerCase().includes("playwright")) return true;
    var scripts = document.querySelectorAll("script");
    for (var i = 0; i < scripts.length; i++) {
      if (scripts[i].textContent && scripts[i].textContent.includes("playwrightReportBase64")) return true;
    }
    return false;
  }

  if (!isPlaywrightReport()) return;

  /* ── Icon → Status mapping ── */
  var ICON_STATUS = {
    "color-icon-success": "PASSED",
    "color-icon-danger": "FAILED",
    "color-icon-warning": "FLAKY",
    "color-icon-subtle": "SKIPPED"
  };

  /* ── Name normalization (mirrors excelmaker.js) ── */
  var NORM = {
    delimiters: [":", "/", "|", "\u2013", "\u2014", "_"],
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
    var dblRe = new RegExp("\\s*\\" + NORM.stdDelimiter + "\\s*\\" + NORM.stdDelimiter + "\\s*", "g");
    clean = clean.replace(dblRe, " " + NORM.stdDelimiter + " ");
    return clean.replace(/\s+/g, " ").trim();
  }

  /* ── Panel state ── */
  var state = {
    side: "right",
    width: 340,
    minimized: false,
    formHidden: false,
    editingId: null,
    lastUrl: location.href
  };

  function waitForTests(cb) {
    if (document.querySelector(".test-file-test")) { cb(); return; }
    var start = Date.now();
    var poll = setInterval(function () {
      if (document.querySelector(".test-file-test") || Date.now() - start > 10000) {
        clearInterval(poll); cb();
      }
    }, 400);
  }

  waitForTests(init);

  function init() {
    if (document.getElementById("pw-ext-panel")) return;
    injectPanel();
    applyPanelPosition();
    attachListeners();
    listenForTestClicks();
    setupDragResize();
    setupUrlWatcher();
    refreshCount();
  }

  /* ══════════════════════════════════════════
     PANEL HTML
     ══════════════════════════════════════════ */
  function injectPanel() {
    var panel = document.createElement("div");
    panel.id = "pw-ext-panel";
    var h = [];

    /* Toolbar */
    h.push('<div id="pw-toolbar">');
    h.push('<button id="pw-dock-left" class="pw-tb-btn" title="Dock Left">&#9664;</button>');
    h.push('<button id="pw-dock-right" class="pw-tb-btn" title="Dock Right">&#9654;</button>');
    h.push('<button id="pw-toggle-form-btn" class="pw-tb-btn" title="Toggle Form">&#9776;</button>');
    h.push('<button id="pw-minimize-btn" class="pw-tb-btn" title="Minimize">&#8722;</button>');
    h.push('</div>');

    /* Header */
    h.push('<div id="pw-panel-header">');
    h.push('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 14l2 2 4-4"/></svg>');
    h.push('<span>Test Identifier</span>');
    h.push('</div>');

    /* Merge banner (hidden by default) */
    h.push('<div id="pw-merge-banner" style="display:none">');
    h.push('<span id="pw-merge-msg"></span>');
    h.push('<div class="pw-merge-actions">');
    h.push('<button id="pw-merge-new" class="pw-merge-btn">New Entry</button>');
    h.push('<div class="pw-merge-dropdown-wrap">');
    h.push('<button id="pw-merge-existing" class="pw-merge-btn pw-merge-btn-alt">Merge &#9662;</button>');
    h.push('<div id="pw-merge-dropdown" class="pw-merge-dropdown" style="display:none"></div>');
    h.push('</div></div></div>');

    /* Form */
    h.push('<div id="pw-form-section">');
    h.push('<div class="pw-field"><label>SC</label><input id="pw-sc" readonly placeholder="(click a test)" /></div>');
    h.push('<div class="pw-field"><label>Name</label><input id="pw-name" readonly placeholder="..." /></div>');
    h.push('<div class="pw-field"><label>Result</label><span id="pw-result-badge" class="pw-result-display"></span><input id="pw-result" type="hidden" /></div>');
    h.push('<div class="pw-field pw-field-input"><label>Label</label><input id="pw-label" placeholder="e.g. Login timeout issue" autocomplete="off" /><div id="pw-suggest-label" class="pw-autocomplete-list"></div></div>');
    h.push('<div class="pw-field pw-field-input"><label>Category</label><input id="pw-category" placeholder="e.g. Functional Bug" autocomplete="off" /><div id="pw-suggest-category" class="pw-autocomplete-list"></div></div>');
    h.push('<div class="pw-field pw-field-input"><label>Owner</label><input id="pw-owner" placeholder="e.g. Frontend Team" autocomplete="off" /><div id="pw-suggest-owner" class="pw-autocomplete-list"></div></div>');
    h.push('<div class="pw-field pw-field-input"><label>Jira</label><input id="pw-jira" placeholder="e.g. PROJ-123" autocomplete="off" /><div id="pw-suggest-jira" class="pw-autocomplete-list"></div></div>');
    h.push('<div class="pw-form-buttons">');
    h.push('<button id="pw-save-btn">Save Entry</button>');
    h.push('<button id="pw-delete-current-btn" class="pw-btn-danger" style="display:none">Delete</button>');
    h.push('</div>');
    h.push('</div>');

    /* Saved list */
    h.push('<div id="pw-list-section" style="display:none"><div id="pw-list-container"></div></div>');

    /* Footer */
    h.push('<div id="pw-footer">');
    h.push('<button id="pw-toggle-list-btn">View Saved (0)</button>');
    h.push('<button id="pw-download-btn">Download Excel</button>');
    h.push('</div>');

    /* Resize handle */
    h.push('<div id="pw-resize-handle"></div>');

    panel.innerHTML = h.join("");
    document.body.appendChild(panel);

    var toast = document.createElement("div");
    toast.id = "pw-toast";
    document.body.appendChild(toast);
  }

  /* ══════════════════════════════════════════
     POSITION & LAYOUT
     ══════════════════════════════════════════ */
  function applyPanelPosition() {
    var panel = document.getElementById("pw-ext-panel");
    panel.style.width = state.width + "px";
    var handle = document.getElementById("pw-resize-handle");
    if (state.side === "right") {
      panel.style.right = "0"; panel.style.left = "auto";
      document.body.style.paddingRight = state.width + "px";
      document.body.style.paddingLeft = "";
      handle.style.left = "0"; handle.style.right = "auto";
    } else {
      panel.style.left = "0"; panel.style.right = "auto";
      document.body.style.paddingLeft = state.width + "px";
      document.body.style.paddingRight = "";
      handle.style.right = "0"; handle.style.left = "auto";
    }
    document.body.style.boxSizing = "border-box";
  }

  function toggleMinimize() {
    var panel = document.getElementById("pw-ext-panel");
    state.minimized = !state.minimized;
    if (state.minimized) {
      panel.classList.add("pw-minimized");
      document.body.style.paddingRight = "";
      document.body.style.paddingLeft = "";
    } else {
      panel.classList.remove("pw-minimized");
      applyPanelPosition();
    }
  }

  function toggleForm() {
    state.formHidden = !state.formHidden;
    var form = document.getElementById("pw-form-section");
    var banner = document.getElementById("pw-merge-banner");
    if (state.formHidden) {
      form.style.display = "none";
      banner.style.display = "none";
    } else {
      form.style.display = "";
      /* re-show banner only if editing */
      if (state.editingId || document.getElementById("pw-merge-msg").textContent) {
        banner.style.display = "";
      }
    }
  }

  /* ══════════════════════════════════════════
     DRAG & RESIZE
     ══════════════════════════════════════════ */
  function setupDragResize() {
    var handle = document.getElementById("pw-resize-handle");
    handle.addEventListener("mousedown", function (e) {
      e.preventDefault();
      var startX = e.clientX;
      var startW = state.width;
      function onMove(ev) {
        var diff = state.side === "right" ? startX - ev.clientX : ev.clientX - startX;
        state.width = Math.max(280, Math.min(600, startW + diff));
        applyPanelPosition();
      }
      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  /* ══════════════════════════════════════════
     URL WATCHER (navigate with arrow keys)
     ══════════════════════════════════════════ */
  function setupUrlWatcher() {
    /* Watch hash changes — when user navigates tests via keyboard or clicks */
    var urlCheck = setInterval(function () {
      if (location.href !== state.lastUrl) {
        state.lastUrl = location.href;
        onUrlChange();
      }
    }, 300);

    /* Arrow key navigation: right key → find next test row after small delay for URL to settle */
    document.addEventListener("keydown", function (e) {
      /* Only act if not focused on an input */
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
    /* URL changed — try to find the currently active/selected test and populate */
    setTimeout(function () {
      /* Playwright report highlights the active test via testId in the URL hash */
      var hash = location.hash || "";
      var testIdMatch = hash.match(/testId=([^&]+)/);
      if (!testIdMatch) return;
      var testId = decodeURIComponent(testIdMatch[1]);
      /* Find the link with this testId */
      var link = document.querySelector('a[href*="testId=' + CSS.escape(testId) + '"]');
      if (!link) {
        link = document.querySelector('a[href*="testId=' + testId + '"]');
      }
      if (link) {
        var row = link.closest(".test-file-test");
        if (row) populateForm(row);
      }
    }, 200);
  }

  /* ══════════════════════════════════════════
     LISTENERS
     ══════════════════════════════════════════ */
  function attachListeners() {
    document.getElementById("pw-save-btn").addEventListener("click", saveEntry);
    document.getElementById("pw-toggle-list-btn").addEventListener("click", toggleList);
    document.getElementById("pw-download-btn").addEventListener("click", downloadExcel);
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
      var list = document.getElementById("pw-suggest-" + field);
      input.addEventListener("input", function () { showSuggestions(field); });
      input.addEventListener("focus", function () { showSuggestions(field); });
      input.addEventListener("blur", function () {
        setTimeout(function () { list.style.display = "none"; }, 180);
      });
      /* Space key opens suggestions when field is empty */
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
     AUTOCOMPLETE / SUGGESTIONS
     ══════════════════════════════════════════ */
  function showSuggestions(field) {
    var input = document.getElementById("pw-" + field);
    var list = document.getElementById("pw-suggest-" + field);
    var val = input.value.trim().toLowerCase();

    chrome.storage.local.get(["pw_entries"], function (data) {
      var entries = data.pw_entries || [];
      var seen = {};
      var freq = {};
      entries.forEach(function (e) {
        var v = (e[field] || "").trim();
        if (v) {
          freq[v] = (freq[v] || 0) + 1;
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

  /* ══════════════════════════════════════════
     POPULATE FORM
     ══════════════════════════════════════════ */
  function populateForm(row) {
    /* Result from icon */
    var icon = row.querySelector("svg.octicon");
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
        if (classes[i] === "test-file-test-outcome-expected") { result = "PASSED"; break; }
        if (classes[i] === "test-file-test-outcome-unexpected") { result = "FAILED"; break; }
        if (classes[i] === "test-file-test-outcome-flaky") { result = "FLAKY"; break; }
        if (classes[i] === "test-file-test-outcome-skipped") { result = "SKIPPED"; break; }
      }
    }

    /* SC from labels */
    var labels = row.querySelectorAll(".label");
    var sc = "N/A";
    for (var j = 0; j < labels.length; j++) {
      var txt = labels[j].textContent.trim();
      var m = txt.match(/^SC[_\s-]?(\d+)$/i);
      if (m) {
        sc = "SC_" + String(parseInt(m[1], 10)).padStart(3, "0");
        break;
      }
    }

    /* Name from title — normalized */
    var titleEl = row.querySelector(".test-file-title");
    var rawName = titleEl ? titleEl.textContent.trim() : "";
    rawName = rawName.replace(/\s*\(retry\s*\d+\)\s*/gi, "").trim();
    var name = normalizeName(rawName);

    /* Fill form */
    document.getElementById("pw-sc").value = sc;
    document.getElementById("pw-name").value = name;
    document.getElementById("pw-result").value = result;
    updateResultBadge(result);

    ["pw-label", "pw-category", "pw-owner", "pw-jira"].forEach(function (id) {
      document.getElementById(id).value = "";
      document.getElementById(id).classList.remove("pw-error");
    });

    state.editingId = null;
    document.getElementById("pw-save-btn").textContent = "Save Entry";
    document.getElementById("pw-delete-current-btn").style.display = "none";

    /* Show form if hidden */
    if (state.formHidden) toggleForm();

    /* Check for existing entries (merge logic) */
    checkExistingEntries(sc, name);

    document.getElementById("pw-label").focus();

    /* If minimized, restore */
    if (state.minimized) toggleMinimize();
  }

  function updateResultBadge(result) {
    var badge = document.getElementById("pw-result-badge");
    badge.className = "pw-result-display pw-rbadge-" + result.toLowerCase();
    badge.textContent = result;
  }

  /* ══════════════════════════════════════════
     MERGE / UPDATE EXISTING
     ══════════════════════════════════════════ */
  function checkExistingEntries(sc, name) {
    chrome.storage.local.get(["pw_entries"], function (data) {
      var entries = data.pw_entries || [];

      /* Match by SC+name OR just name (fuzzy) */
      var exactMatches = [];
      entries.forEach(function (e, idx) {
        if (e.sc === sc && e.name === name) exactMatches.push({ entry: e, idx: idx });
      });
      if (!exactMatches.length) { hideMergeBanner(); return; }

      /* Sort matches by frequency of label (recommendation: most used labels first) */
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
        var e = m.entry;
        var parts = [e.label, e.category, e.owner, e.jira].filter(Boolean);
        var summary = parts.length ? esc(parts.join(" \u00b7 ")) : "<em>No details</em>";
        var freq = labelFreq[e.label] || 0;
        return '<div class="pw-merge-option" data-id="' + e.id + '">' +
          '<span class="pw-merge-option-text">' + summary + '</span>' +
          (freq > 1 ? '<span class="pw-merge-option-freq">' + freq + 'x</span>' : '') +
          '</div>';
      }).join("");
      dd.style.display = "none";

      dd.querySelectorAll(".pw-merge-option").forEach(function (opt) {
        opt.addEventListener("click", function () {
          var id = opt.dataset.id;
          var found = entries.find(function (e) { return e.id === id; });
          if (found) {
            document.getElementById("pw-label").value = found.label || "";
            document.getElementById("pw-category").value = found.category || "";
            document.getElementById("pw-owner").value = found.owner || "";
            document.getElementById("pw-jira").value = found.jira || "";
            state.editingId = id;
            document.getElementById("pw-save-btn").textContent = "Update Entry";
            document.getElementById("pw-delete-current-btn").style.display = "";
          }
          dd.style.display = "none";
        });
      });
    });
  }

  function hideMergeBanner() {
    document.getElementById("pw-merge-banner").style.display = "none";
    document.getElementById("pw-merge-dropdown").style.display = "none";
  }

  /* ══════════════════════════════════════════
     DELETE CURRENT ENTRY (in-form delete)
     ══════════════════════════════════════════ */
  function deleteCurrentEntry() {
    if (!state.editingId) return;
    chrome.storage.local.get(["pw_entries"], function (data) {
      var entries = data.pw_entries || [];
      entries = entries.filter(function (e) { return e.id !== state.editingId; });
      chrome.storage.local.set({ pw_entries: entries }, function () {
        refreshCount(entries.length);
        if (document.getElementById("pw-list-section").style.display !== "none") renderList(entries);
        showToast("Entry deleted", "warning");
        state.editingId = null;
        document.getElementById("pw-save-btn").textContent = "Save Entry";
        document.getElementById("pw-delete-current-btn").style.display = "none";
        ["pw-label", "pw-category", "pw-owner", "pw-jira"].forEach(function (id) {
          document.getElementById(id).value = "";
        });
        hideMergeBanner();
        /* Re-check for remaining matches */
        var sc = document.getElementById("pw-sc").value;
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
    var label = labelEl.value.trim();
    if (!label) {
      labelEl.classList.add("pw-error");
      labelEl.focus();
      showToast("Label is required", "error");
      return;
    }
    labelEl.classList.remove("pw-error");

    var entryData = {
      sc: document.getElementById("pw-sc").value,
      name: document.getElementById("pw-name").value,
      result: document.getElementById("pw-result").value,
      label: label,
      category: document.getElementById("pw-category").value.trim(),
      owner: document.getElementById("pw-owner").value.trim(),
      jira: document.getElementById("pw-jira").value.trim(),
      timestamp: new Date().toISOString()
    };

    chrome.storage.local.get(["pw_entries"], function (data) {
      var entries = data.pw_entries || [];

      if (state.editingId) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].id === state.editingId) {
            entryData.id = state.editingId;
            entries[i] = entryData;
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
        document.getElementById("pw-save-btn").textContent = "Save Entry";
        document.getElementById("pw-delete-current-btn").style.display = "none";
        hideMergeBanner();
      });
    });
  }

  /* ══════════════════════════════════════════
     LIST (with recommendation sorting)
     ══════════════════════════════════════════ */
  function toggleList() {
    var section = document.getElementById("pw-list-section");
    var btn = document.getElementById("pw-toggle-list-btn");
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

    /* Group by test, sort by frequency (most entries first = recommendation) */
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
        var e = item.entry;
        var rc = "pw-badge-" + (e.result || "unknown").toLowerCase();
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

  /* ══════════════════════════════════════════
     EXCEL DOWNLOAD (SC ascending + normalized names)
     ══════════════════════════════════════════ */
  function downloadExcel() {
    if (typeof XLSX === "undefined") {
      showToast("XLSX not loaded", "error");
      return;
    }
    chrome.storage.local.get(["pw_entries"], function (data) {
      var entries = data.pw_entries || [];
      if (!entries.length) { showToast("No saved entries to export", "warning"); return; }

      /* Sort by SC ascending */
      var sorted = entries.slice().sort(function (a, b) {
        var aNum = parseInt((a.sc || "").replace(/\D/g, ""), 10) || 99999;
        var bNum = parseInt((b.sc || "").replace(/\D/g, ""), 10) || 99999;
        return aNum - bNum;
      });

      var wb = XLSX.utils.book_new();

      /* Summary Sheet */
      var catCount = {}, ownCount = {}, resCount = {};
      sorted.forEach(function (e) {
        var cat = e.category || "Uncategorised";
        var own = e.owner || "Unassigned";
        var res = e.result || "UNKNOWN";
        catCount[cat] = (catCount[cat] || 0) + 1;
        ownCount[own] = (ownCount[own] || 0) + 1;
        resCount[res] = (resCount[res] || 0) + 1;
      });
      var summaryRows = [
        ["Playwright Identifier Report"],
        ["Generated:", new Date().toLocaleString()],
        [],
        ["Total Labeled", sorted.length],
        [],
        ["By Result", "Count"]
      ].concat(Object.entries(resCount).sort(function (a, b) { return b[1] - a[1]; }))
       .concat([[], ["By Category", "Count"]])
       .concat(Object.entries(catCount).sort(function (a, b) { return b[1] - a[1]; }))
       .concat([[], ["By Owner", "Count"]])
       .concat(Object.entries(ownCount).sort(function (a, b) { return b[1] - a[1]; }));
      var wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
      wsSummary["!cols"] = [{ width: 28 }, { width: 14 }];
      if (wsSummary["A1"]) {
        wsSummary["A1"].s = {
          font: { bold: true, size: 14, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "2563EB" } }
        };
      }
      XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

      /* Details Sheet — sorted by SC ascending */
      var header = ["SC No", "Scenario Name", "Result", "Label", "Category", "Owner", "Jira", "Labeled Date"];
      var rows = sorted.map(function (e) {
        return [e.sc, e.name, e.result, e.label,
                e.category || "", e.owner || "", e.jira || "",
                new Date(e.timestamp).toLocaleString()];
      });
      var wsDetails = XLSX.utils.aoa_to_sheet([header].concat(rows));
      wsDetails["!cols"] = [
        { width: 12 }, { width: 48 }, { width: 10 }, { width: 28 },
        { width: 18 }, { width: 18 }, { width: 14 }, { width: 20 }
      ];
      ["A", "B", "C", "D", "E", "F", "G", "H"].forEach(function (col) {
        var ref = col + "1";
        if (wsDetails[ref]) wsDetails[ref].s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "374151" } },
          alignment: { horizontal: "center" }
        };
      });
      var range = XLSX.utils.decode_range(wsDetails["!ref"]);
      for (var R = 1; R <= range.e.r; R++) {
        var cellRef = XLSX.utils.encode_cell({ r: R, c: 2 });
        var cell = wsDetails[cellRef];
        if (!cell) continue;
        var val = (cell.v || "").toUpperCase();
        if (val === "PASSED") {
          cell.s = { fill: { fgColor: { rgb: "C6EFCE" } }, font: { color: { rgb: "166534" }, bold: true }, alignment: { horizontal: "center" } };
        } else if (val === "FAILED") {
          cell.s = { fill: { fgColor: { rgb: "FEE2E2" } }, font: { color: { rgb: "991B1B" }, bold: true }, alignment: { horizontal: "center" } };
        } else if (val === "FLAKY") {
          cell.s = { fill: { fgColor: { rgb: "FEF9C3" } }, font: { color: { rgb: "713F12" }, bold: true }, alignment: { horizontal: "center" } };
        }
      }
      XLSX.utils.book_append_sheet(wb, wsDetails, "Details");

      var dateStr = new Date().toISOString().split("T")[0];
      XLSX.writeFile(wb, "identifier-report-" + dateStr + ".xlsx");
      showToast("Excel downloaded!", "success");
    });
  }

  /* ══════════════════════════════════════════
     TOAST
     ══════════════════════════════════════════ */
  var toastTimer = null;
  function showToast(msg, type) {
    var toast = document.getElementById("pw-toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.className = "pw-toast-show pw-toast-" + (type || "info");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.className = ""; }, 3000);
  }

  function esc(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

})();
