/** Playwright RCA Helper - UI Module v5.0
 * Panel HTML injection, layout, drag/resize, minimize, toast.
 * Depends on: state, esc() from content.js */

/* ======================================================
   PANEL HTML
   ====================================================== */

/**
 * injectPanel()
 * -------------
 * Builds the entire extension panel HTML from scratch and appends it to
 * document.body. Also creates the slide tab (#pw-page-toggle) and the
 * toast container (#pw-toast) as separate elements.
 *
 * Called once during init(). If the panel is removed from the DOM by a
 * React re-render, the MutationObserver in listenForTestClicks() will call
 * init() again, which calls injectPanel() again.
 *
 * Panel structure (DOM tree):
 *   #pw-ext-panel
 *     #pw-header
 *       #pw-header-brand  (logo + title)
 *       #pw-header-actions  (theme btn, dock btn, scrape btn, download btn)
 *     #pw-tabs  (Form | Saved N | Library)
 *     #pw-status-bar > #pw-status-text
 *     #pw-form-section
 *       #pw-test-info-card  (read-only test context after clicking a row)
 *         #pw-test-info-empty  (shown until a test is clicked)
 *         #pw-test-info-filled  (SC + name + result badge)
 *       #pw-fields-area  (Label, Category, Owner, Jira inputs + autocomplete)
 *       #pw-form-actions  (date picker + Save + Delete buttons)
 *     #pw-list-section  (Saved entries list — hidden until tab clicked)
 *       #pw-list-toolbar  (date filter + delete-all button)
 *       #pw-list-container  (dynamically filled by renderList())
 *     #pw-rca-section  (RCA Library — hidden until tab clicked)
 *       #pw-rca-toolbar
 *       #pw-rca-container  (dynamically filled by renderRcaLibrary())
 *     #pw-resize-handle
 *   #pw-page-toggle  (the slide-in tab on the panel edge)
 *   #pw-toast  (floating notification)
 *
 * NOTE: All three section divs (form/list/rca) are present in DOM at all
 * times. showView() in form.js toggles their display between flex/none.
 *
 * REVIEW: If new input fields are added here, make sure attachListeners()
 * in form.js is updated to wire them up.
 */
function injectPanel() {
  var panel = document.createElement("div");
  panel.id = "pw-ext-panel";
  var h = [];

  /* ── Header ── */
  h.push('<div id="pw-header">');
  h.push('<div id="pw-header-brand">');
  h.push('<div id="pw-header-logo">');
  h.push('<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/></svg>');
  h.push('</div>');
  h.push('<span id="pw-header-title">RCA Helper</span>');
  h.push('</div>');
  h.push('<div id="pw-header-actions">');
  h.push('<span id="pw-scrape-spinner" class="pw-spinner" style="display:none"></span>');
  h.push('<button id="pw-theme-btn" class="pw-icon-btn pw-icon-theme" title="Toggle dark/light mode"><span id="pw-theme-icon">&#9790;</span><span id="pw-theme-label">Dark</span></button>');
  h.push('<button id="pw-dock-btn" class="pw-icon-btn pw-icon-dock" title="Switch Side">&#9664;</button>');
  h.push('<button id="pw-scrape-btn" class="pw-icon-btn pw-icon-scrape" title="Re-scrape tests">&#8635;</button>');
  h.push('<button id="pw-download-btn" class="pw-icon-btn pw-icon-green" title="Download Excel">&#8595;</button>');
  h.push('</div>');
  h.push('</div>');

  /* ── Tabs ── */
  h.push('<div id="pw-tabs">');
  h.push('<button id="pw-tab-form" class="pw-tab active" data-view="form">Form</button>');
  h.push('<button id="pw-tab-list" class="pw-tab" data-view="list">Saved <span id="pw-saved-badge" class="pw-tab-badge">0</span></button>');
  h.push('<button id="pw-tab-rca" class="pw-tab" data-view="rca">Library</button>');
  h.push('</div>');

  /* ── Status Bar ── */
  h.push('<div id="pw-status-bar"><span id="pw-status-text">Loading\u2026</span></div>');

  /* ── Form Section ── */
  h.push('<div id="pw-form-section">');

  /* Test info card */
  h.push('<div id="pw-test-info-card">');
  h.push('<div id="pw-test-info-empty">&#8592; Click a test to begin</div>');
  h.push('<div id="pw-test-info-filled">');
  h.push('<div id="pw-test-info-top">');
  h.push('<span id="pw-test-sc"></span>');
  h.push('<span id="pw-test-name"></span>');
  h.push('</div>');
  h.push('<span id="pw-result-badge" class="pw-result-display"></span>');
  h.push('<input id="pw-result" type="hidden" />');
  h.push('</div>');
  h.push('</div>');

  /* Editable fields */
  h.push('<div id="pw-fields-area">');

  /* Label */
  h.push('<div class="pw-field pw-field-input">');
  h.push('<label>Label</label>');
  h.push('<input id="pw-label" placeholder="e.g. Login timeout issue" autocomplete="off" />');
  h.push('<div id="pw-suggest-label" class="pw-autocomplete-list"></div>');
  h.push('<div id="pw-label-chips"></div>');
  h.push('</div>');

  /* Category */
  h.push('<div class="pw-field pw-field-input"><label>Category</label><input id="pw-category" placeholder="e.g. Functional Bug" autocomplete="off" /><div id="pw-suggest-category" class="pw-autocomplete-list"></div></div>');

  /* Owner */
  h.push('<div class="pw-field pw-field-input"><label>Owner</label><input id="pw-owner" placeholder="e.g. Frontend Team" autocomplete="off" /><div id="pw-suggest-owner" class="pw-autocomplete-list"></div></div>');

  /* Jira */
  h.push('<div class="pw-field pw-field-input"><label>Jira</label><input id="pw-jira" placeholder="e.g. PROJ-123" autocomplete="off" /><div id="pw-suggest-jira" class="pw-autocomplete-list"></div></div>');

  h.push('</div>'); /* /pw-fields-area */

  /* Form action bar */
  h.push('<div id="pw-form-actions">');
  h.push('<input type="date" id="pw-label-date" class="pw-date-input" title="Entry date" />');
  h.push('<button id="pw-save-btn">Save</button>');
  h.push('<button id="pw-delete-current-btn" class="pw-btn-danger" style="display:none">Delete</button>');
  h.push('</div>');

  h.push('</div>'); /* /pw-form-section */

  /* ── Saved List Section ── */
  h.push('<div id="pw-list-section">');
  h.push('<div id="pw-list-toolbar">');
  h.push('<div id="pw-date-filter-bar">');
  h.push('<label class="pw-date-filter-label"><input type="checkbox" id="pw-date-filter-check"> Filter by date</label>');
  h.push('<input type="date" id="pw-date-filter-input" style="display:none" />');
  h.push('</div>');
  h.push('<button id="pw-delete-all-btn" class="pw-icon-btn pw-icon-danger" title="Delete all labels">&#128465;</button>');
  h.push('</div>');
  h.push('<div id="pw-list-container"></div>');
  h.push('</div>');

  /* ── RCA Library Section ── */
  h.push('<div id="pw-rca-section">');
  h.push('<div id="pw-rca-toolbar">');
  h.push('<span id="pw-rca-title">RCA Library</span>');
  h.push('<span id="pw-rca-count"></span>');
  h.push('</div>');
  h.push('<div id="pw-rca-container"></div>');
  h.push('</div>');

  /* ── Resize handle ── */
  h.push('<div id="pw-resize-handle"></div>');

  panel.innerHTML = h.join("");
  document.body.appendChild(panel);

  var toggle = document.createElement("div");
  toggle.id = "pw-page-toggle";
  toggle.title = "Show / Hide Test Identifier";
  toggle.innerHTML = "&#9664;";
  document.body.appendChild(toggle);

  var toast = document.createElement("div");
  toast.id = "pw-toast";
  document.body.appendChild(toast);
}

/* ======================================================
   POSITION & LAYOUT
   ====================================================== */

/**
 * applyPanelPosition()
 * --------------------
 * Applies the current panel side/width from state to the DOM.
 * Should be called any time state.side or state.width changes.
 *
 * Reads from state:
 *   state.side      "right"|"left"  — which edge the panel sticks to
 *   state.width     number (px)     — current panel width
 *   state.minimized boolean         — if true, page padding is removed
 *
 * What it does:
 *   - Sets panel inline left/right style and adds/removes pw-docked-left class
 *   - Positions the resize handle on the inner edge of the panel
 *   - Applies body padding so page content is not hidden behind the panel
 *     (skipped when minimized — no padding needed when panel is off-screen)
 *   - Updates the #pw-page-toggle tab position, border-radius, and arrow glyph
 *   - Updates #pw-dock-btn arrow glyph to show which direction it will move
 *
 * Arrow logic for #pw-page-toggle:
 *   Right panel, not minimized → ▶ (click to hide right)
 *   Right panel, minimized     → ◀ (click to show from right)
 *   Left panel, not minimized  → ◁ (click to hide left)
 *   Left panel, minimized      → ▶ (click to show from left)
 */
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

/**
 * toggleMinimize()
 * ----------------
 * Slides the panel off-screen and removes body padding, or restores it.
 * Toggled by clicking #pw-page-toggle (the edge tab).
 *
 * Reads/writes: state.minimized, state.side
 *
 * Minimized state:
 *   - Adds .pw-minimized to panel (CSS translateX slides it off-screen)
 *   - For left-docked panels also adds .pw-docked-left to ensure correct
 *     slide direction (translateX negative = slide left)
 *   - Removes body padding (panel is no longer occupying space)
 *   - Moves the toggle tab to the screen edge (right:0 or left:0)
 *   - Updates arrow glyph to show "expand" direction
 *
 * Restored state:
 *   - Removes .pw-minimized and .pw-docked-left (applyPanelPosition re-adds
 *     pw-docked-left if needed)
 *   - Calls applyPanelPosition() to restore full layout
 *
 * NOTE: .pw-docked-left is removed then re-added by applyPanelPosition() on
 * restore — the brief remove is harmless but slightly redundant.
 */
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

/**
 * setupDragResize()
 * -----------------
 * Attaches mousedown → mousemove → mouseup drag logic to the
 * #pw-resize-handle element so the user can drag to resize the panel width.
 *
 * Called every time init() runs (panel rebuild), because the handle element
 * is re-created with injectPanel() each time. The listener is on the new
 * element so no cleanup of old listeners is needed.
 *
 * Resize logic:
 *   - On mousedown: captures startX (cursor position) and startW (current width)
 *   - On mousemove: calculates pixel diff from startX
 *     Right-docked: dragging LEFT increases width (startX - ev.clientX)
 *     Left-docked:  dragging RIGHT increases width (ev.clientX - startX)
 *   - Clamps width to 280px min, 600px max
 *   - Calls applyPanelPosition() on every move to keep layout in sync
 *   - On mouseup: removes both mousemove and mouseup listeners (cleanup)
 *
 * NOTE: Listeners are on document (not the handle) during drag so the mouse
 * can move outside the handle without losing the drag.
 */
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

/*
 * toastTimer
 * ----------
 * Holds the setTimeout ID for auto-hiding the toast.
 * Stored at module scope so clearTimeout can cancel a previous toast
 * when a new one is shown before the 3s expires.
 */
var toastTimer = null;

/**
 * showToast(msg, type)
 * --------------------
 * Shows a temporary floating notification at the bottom of the panel.
 * Auto-dismisses after 3 seconds. Cancels any currently showing toast.
 *
 * Targets: #pw-toast (created by injectPanel, appended to body)
 *
 * @param {string} msg   The message text to display
 *                       e.g. "Entry saved!", "Scraped 98 rows", "Label is required"
 * @param {string} type  CSS class suffix controlling the colour:
 *                       "success" — green
 *                       "error"   — red
 *                       "warning" — yellow/orange
 *                       "info"    — neutral (default if omitted)
 *
 * CSS: .pw-toast-show activates visibility; removing the class hides it.
 * The panel.css handles the slide-in/out animation via transition.
 */
function showToast(msg, type) {
  var toast = document.getElementById("pw-toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.className   = "pw-toast-show pw-toast-" + (type || "info");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { toast.className = ""; }, 3000);
}
