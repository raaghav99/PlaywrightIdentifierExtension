/** Playwright Test Identifier - UI Module v3.0
 * Panel HTML injection, layout, drag/resize, minimize, toast.
 * Depends on: state, esc() from content.js */

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
    document.body.style.paddingRight = "";
    document.body.style.paddingLeft  = "";
  } else {
    panel.classList.remove("pw-minimized");
    applyPanelPosition();
  }
}

function toggleForm() {
  state.formHidden = !state.formHidden;
  var form   = document.getElementById("pw-form-section");
  var banner = document.getElementById("pw-merge-banner");
  if (state.formHidden) {
    form.style.display   = "none";
    banner.style.display = "none";
  } else {
    form.style.display = "";
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
      document.removeEventListener("mouseup",   onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
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
  toast.className   = "pw-toast-show pw-toast-" + (type || "info");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { toast.className = ""; }, 3000);
}
