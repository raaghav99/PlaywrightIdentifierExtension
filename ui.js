/** Playwright Test Identifier - UI Module v5.0
 * Panel HTML injection, layout, drag/resize, minimize, toast.
 * Depends on: state, esc() from content.js */

/* ======================================================
   PANEL HTML
   ====================================================== */
function injectPanel() {
  var panel = document.createElement("div");
  panel.id = "pw-ext-panel";
  var h = [];

  /* Toolbar */
  h.push('<div id="pw-toolbar">');
  h.push('<button id="pw-dock-btn" class="pw-tb-btn" title="Switch Side">&#9664;</button>');
  h.push('<button id="pw-toggle-rca-btn" class="pw-tb-btn" title="RCA Library">&#9776;</button>');
  h.push('<button id="pw-toggle-list-btn" class="pw-tb-btn pw-tb-text-btn" title="View Saved Entries">Saved (0)</button>');
  h.push('<span id="pw-scrape-spinner" class="pw-spinner" style="display:none"></span>');
  h.push('<button id="pw-scrape-btn" class="pw-tb-btn pw-tb-text-btn" title="Re-scrape tests">&#8635;</button>');
  h.push('<button id="pw-download-btn" class="pw-tb-btn pw-tb-text-btn pw-tb-green" title="Download Excel">&#8595; Excel</button>');
  h.push('<button id="pw-delete-all-btn" class="pw-tb-btn pw-tb-danger" title="Delete Report Labels">&#128465;</button>');
  h.push('</div>');

  /* Header */
  h.push('<div id="pw-panel-header">');
  h.push('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/></svg>');
  h.push('<span>Test Identifier</span>');
  h.push('</div>');

  /* Status bar */
  h.push('<div id="pw-status-bar"><span id="pw-status-text">Loading\u2026</span></div>');

  /* Form */
  h.push('<div id="pw-form-section">');
  h.push('<div class="pw-field"><label>SC</label><input id="pw-sc" readonly placeholder="(click a test)" /></div>');
  h.push('<div class="pw-field"><label>Name</label><input id="pw-name" readonly placeholder="..." /></div>');
  h.push('<div class="pw-field"><label>Result</label><span id="pw-result-badge" class="pw-result-display"></span><input id="pw-result" type="hidden" /></div>');

  /* Label + Copy from */
  h.push('<div class="pw-field pw-field-input">');
  h.push('<div class="pw-label-header"><label>Label</label><button id="pw-copy-from-btn" class="pw-copy-from-trigger" type="button">Copy from\u2026</button></div>');
  h.push('<input id="pw-label" placeholder="e.g. Login timeout issue" autocomplete="off" />');
  h.push('<div id="pw-suggest-label" class="pw-autocomplete-list"></div>');
  h.push('<div id="pw-copy-from-dropdown" class="pw-copy-from-dropdown" style="display:none"></div>');
  h.push('<div id="pw-label-chips"></div>');
  h.push('</div>');

  h.push('<div class="pw-field pw-field-input"><label>Category</label><input id="pw-category" placeholder="e.g. Functional Bug" autocomplete="off" /><div id="pw-suggest-category" class="pw-autocomplete-list"></div></div>');
  h.push('<div class="pw-field pw-field-input"><label>Owner</label><input id="pw-owner" placeholder="e.g. Frontend Team" autocomplete="off" /><div id="pw-suggest-owner" class="pw-autocomplete-list"></div></div>');
  h.push('<div class="pw-field pw-field-input"><label>Jira</label><input id="pw-jira" placeholder="e.g. PROJ-123" autocomplete="off" /><div id="pw-suggest-jira" class="pw-autocomplete-list"></div></div>');
  h.push('<div class="pw-form-buttons">');
  h.push('<input type="date" id="pw-label-date" class="pw-date-input" title="Entry date (DD/MM)" />');
  h.push('<button id="pw-save-btn">Save Entry</button>');
  h.push('<button id="pw-delete-current-btn" class="pw-btn-danger" style="display:none">Delete</button>');
  h.push('</div>');
  h.push('</div>');

  /* Saved list (current report labels) */
  h.push('<div id="pw-list-section" style="display:none">');
  h.push('<div class="pw-view-hint">&#8617; Click <strong>Saved</strong> again to return to form</div>');
  h.push('<div id="pw-date-filter-bar">');
  h.push('<label class="pw-date-filter-label"><input type="checkbox" id="pw-date-filter-check"> Filter by date</label>');
  h.push('<input type="date" id="pw-date-filter-input" style="display:none" />');
  h.push('</div>');
  h.push('<div id="pw-list-container"></div></div>');

  /* RCA Library (hidden by default, toggled by hamburger) */
  h.push('<div id="pw-rca-section" style="display:none">');
  h.push('<div class="pw-view-hint">&#8617; Click <strong>&#9776; RCA</strong> again to return to form</div>');
  h.push('<div class="pw-rca-header">');
  h.push('<span>RCA Library</span>');
  h.push('<span id="pw-rca-count" class="pw-rca-count"></span>');
  h.push('</div>');
  h.push('<div id="pw-rca-container"></div>');
  h.push('</div>');

  /* Resize handle */
  h.push('<div id="pw-resize-handle"></div>');

  panel.innerHTML = h.join("");
  document.body.appendChild(panel);

  var toggle = document.createElement("div");
  toggle.id = "pw-page-toggle";
  toggle.title = "Show / Hide Test Identifier";
  toggle.innerHTML = '&#9664;';
  document.body.appendChild(toggle);

  var toast = document.createElement("div");
  toast.id = "pw-toast";
  document.body.appendChild(toast);
}

/* ======================================================
   POSITION & LAYOUT
   ====================================================== */
function applyPanelPosition() {
  var panel   = document.getElementById("pw-ext-panel");
  var handle  = document.getElementById("pw-resize-handle");
  var tab     = document.getElementById("pw-page-toggle");
  var dockBtn = document.getElementById("pw-dock-btn");
  panel.style.width = state.width + "px";
  if (state.side === "right") {
    panel.style.right = "0"; panel.style.left = "auto";
    panel.classList.remove("pw-docked-left");
    handle.style.left = "0"; handle.style.right = "auto";
    if (!state.minimized) {
      document.body.style.paddingRight = state.width + "px";
      document.body.style.paddingLeft  = "";
    }
    if (tab) {
      tab.style.right = state.minimized ? "0" : state.width + "px";
      tab.style.left  = "auto";
      tab.style.borderRadius = "8px 0 0 8px";
      tab.innerHTML = state.minimized ? "&#9664;" : "&#9654;";
    }
    if (dockBtn) dockBtn.innerHTML = "&#9664;";
  } else {
    panel.style.left = "0"; panel.style.right = "auto";
    panel.classList.add("pw-docked-left");
    handle.style.right = "0"; handle.style.left = "auto";
    if (!state.minimized) {
      document.body.style.paddingLeft  = state.width + "px";
      document.body.style.paddingRight = "";
    }
    if (tab) {
      tab.style.left  = state.minimized ? "0" : state.width + "px";
      tab.style.right = "auto";
      tab.style.borderRadius = "0 8px 8px 0";
      tab.innerHTML = state.minimized ? "&#9654;" : "&#9665;";
    }
    if (dockBtn) dockBtn.innerHTML = "&#9654;";
  }
  document.body.style.boxSizing = "border-box";
}

function toggleMinimize() {
  var panel = document.getElementById("pw-ext-panel");
  var tab   = document.getElementById("pw-page-toggle");
  state.minimized = !state.minimized;
  if (state.minimized) {
    panel.classList.add("pw-minimized");
    if (state.side === "left") panel.classList.add("pw-docked-left");
    document.body.style.paddingRight = "";
    document.body.style.paddingLeft  = "";
    if (tab) {
      if (state.side === "right") {
        tab.style.right = "0"; tab.style.left = "auto";
        tab.style.borderRadius = "8px 0 0 8px";
        tab.innerHTML = "&#9664;";
      } else {
        tab.style.left = "0"; tab.style.right = "auto";
        tab.style.borderRadius = "0 8px 8px 0";
        tab.innerHTML = "&#9654;";
      }
    }
  } else {
    panel.classList.remove("pw-minimized");
    panel.classList.remove("pw-docked-left");
    applyPanelPosition();
  }
}

/* ======================================================
   DRAG & RESIZE
   ====================================================== */
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
      document.removeEventListener("mouseup",   onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
  });
}

/* ======================================================
   TOAST
   ====================================================== */
var toastTimer = null;
function showToast(msg, type) {
  var toast = document.getElementById("pw-toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.className   = "pw-toast-show pw-toast-" + (type || "info");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { toast.className = ""; }, 3000);
}
