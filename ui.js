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
  h.push('<button id="pw-dock-left" class="pw-tb-btn" title="Dock Left">&#9664;</button>');
  h.push('<button id="pw-dock-right" class="pw-tb-btn" title="Dock Right">&#9654;</button>');
  h.push('<button id="pw-toggle-rca-btn" class="pw-tb-btn" title="RCA Library">&#9776;</button>');
  h.push('<button id="pw-minimize-btn" class="pw-tb-btn" title="Minimize">&#8722;</button>');
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
  h.push('<button id="pw-save-btn">Save Entry</button>');
  h.push('<button id="pw-delete-current-btn" class="pw-btn-danger" style="display:none">Delete</button>');
  h.push('</div>');
  h.push('</div>');

  /* Saved list (current report labels) */
  h.push('<div id="pw-list-section" style="display:none"><div id="pw-list-container"></div></div>');

  /* RCA Library (hidden by default, toggled by hamburger) */
  h.push('<div id="pw-rca-section" style="display:none">');
  h.push('<div class="pw-rca-header">');
  h.push('<span>RCA Library</span>');
  h.push('<span id="pw-rca-count" class="pw-rca-count"></span>');
  h.push('</div>');
  h.push('<div id="pw-rca-container"></div>');
  h.push('</div>');

  /* Footer */
  h.push('<div id="pw-footer">');
  h.push('<button id="pw-scrape-btn" title="Re-scrape tests">&#8635; Scrape</button>');
  h.push('<span id="pw-scrape-spinner" class="pw-spinner" style="display:none"></span>');
  h.push('<button id="pw-toggle-list-btn">View Saved (0)</button>');
  h.push('<button id="pw-download-btn">Download Excel</button>');
  h.push('<button id="pw-delete-all-btn" class="pw-footer-btn-danger" title="Delete Report Labels">&#128465;</button>');
  h.push('</div>');

  /* Resize handle */
  h.push('<div id="pw-resize-handle"></div>');

  panel.innerHTML = h.join("");
  document.body.appendChild(panel);

  var toast = document.createElement("div");
  toast.id = "pw-toast";
  document.body.appendChild(toast);
}

/* ======================================================
   POSITION & LAYOUT
   ====================================================== */
function applyPanelPosition() {
  var panel  = document.getElementById("pw-ext-panel");
  var handle = document.getElementById("pw-resize-handle");
  panel.style.width = state.width + "px";
  if (state.side === "right") {
    panel.style.right = "0"; panel.style.left = "auto";
    document.body.style.paddingRight = state.width + "px";
    document.body.style.paddingLeft  = "";
    handle.style.left = "0"; handle.style.right = "auto";
  } else {
    panel.style.left = "0"; panel.style.right = "auto";
    document.body.style.paddingLeft  = state.width + "px";
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
    if (state.side === "left") panel.classList.add("pw-docked-left");
    else panel.classList.remove("pw-docked-left");
    document.body.style.paddingRight = "";
    document.body.style.paddingLeft  = "";
  } else {
    panel.classList.remove("pw-minimized");
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
