# Bug Report — Playwright Test Identifier v2
> Reviewed by Claude Sonnet 4.6 on 2026-03-07

---

## CRITICAL

### 1. Scrape button deadlock on re-entry
**Files:** `content.js:190`, `form.js:27-36`

When `state.scraping` is `true`, `scrapeAllTests` early-returns **without calling the callback**:
```js
function scrapeAllTests(cb) {
  if (state.scraping) return;  // cb is never called
  ...
}
```
The scrape button handler never gets its callback, so:
- `spinner.style.display = "none"` never runs → spinner stays visible
- `btn.disabled = false` never runs → button permanently disabled
- `dlBtn.disabled = false` never runs → download button permanently disabled

User is locked out until page reload. Triggers if the user hits the button while the auto-scrape from `init()` is still running, or if `saveReport` ever fails to invoke its own callback (leaving `state.scraping = true` forever).

**Fix:** Call `cb(0)` (or similar) in the early-return path, or disable the button in the UI during auto-scrape and re-enable after.

---

### 2. Minimize slides the wrong direction when panel is left-docked
**File:** `panel.css:24-25`

```css
#pw-ext-panel.pw-minimized {
  transform: translateX(calc(100% - 36px)); /* always slides RIGHT */
}
```
When `state.side === "left"`, this pushes the panel off the **right** edge of the screen instead of the left. The 36px tab appears on the wrong side.

**Fix:** Apply `translateX(calc(-100% + 36px))` via a `.pw-docked-left` class on the panel when left-docked, and target `#pw-ext-panel.pw-docked-left.pw-minimized` in CSS.

---

## DATA BUGS

### 3. RCA dedup key collision when fields contain `|`
**File:** `form.js:360-364`

```js
var rcaKey = rawLabel + "|" + category + "|" + owner + "|" + jira;
var exKey  = ex.label + "|" + (ex.category||"") + "|" + (ex.owner||"") + "|" + (ex.jira||"");
if (exKey === rcaKey) { /* treated as same entry */ }
```
If any field value contains a `|` character, two completely different entries can produce the same composite key. Example:
- Label `"Login|Timeout"`, category `"Bug"` → key `Login|Timeout|Bug||`
- Label `"Login"`, category `"Timeout|Bug"` → key `Login|Timeout|Bug||`

Result: the second save silently increments `useCount` of the first entry instead of creating a new one. Silent data corruption in the RCA library.

**Fix:** Use a delimiter that cannot appear in user input (e.g. `\x00`), or store a hash of the four fields, or compare each field individually instead of a composite string key.

---

### 4. Excel cell styles are silently ignored
**File:** `excel.js:150`

```js
XLSX.writeFile(wb, "identifier-report-" + dateStr + ".xlsx");  // no options
```
SheetJS community edition ignores `cell.s` (style) properties unless `{ cellStyles: true }` is passed to `writeFile`. All the header coloring and result colour-coding built on lines 93–143 produces zero output — the exported file has no formatting at all.

**Fix:**
```js
XLSX.writeFile(wb, "identifier-report-" + dateStr + ".xlsx", { cellStyles: true });
```

---

## LOGIC BUGS

### 5. Status bar shows stale labeled count after "Delete All"
**File:** `form.js:294-308`

`deleteAllEntries` calls `refreshCount(0)` (correct) but never calls `updateStatusBar`. After clearing all labels, the status bar still reads `✓ N tests scraped · M labeled` with the old value of M.

**Fix:** Add `updateStatusBar(report.scraped.length, 0, true)` inside the `saveReport` callback in `deleteAllEntries`.

---

### 6. Status bar shows "0 tests scraped" if user saves before auto-scrape completes
**File:** `form.js:349`, `form.js:404`

In `saveEntry`, if the user clicks a test and submits the form before the initial `scrapeAllTests` callback has finished writing to storage:
```js
// report fallback used because scrape hasn't saved yet:
var report = reports[url] || { url: url, scraped: [], labels: {}, lastAccessed: now };
...
updateStatusBar(report.scraped.length, ...);  // report.scraped.length === 0
```
The status bar flashes "✓ 0 tests scraped · 1 labeled" even though tests exist on the page.

**Fix:** In `saveEntry`'s `updateStatusBar` call, read `report.scraped.length` only if it's > 0, otherwise call `getReport` for the live count — or skip the `updateStatusBar` call in `saveEntry` entirely and let the existing status bar state persist.

---

## QUALITY / RESOURCE LEAKS

### 7. `manifest.json` version not bumped
**File:** `manifest.json:4`

Version is still `"1.0.0"` despite this being a major v2 refactor with new modules, multi-report storage, and RCA library. Chrome uses the version field for update detection.

**Fix:** Bump to `"2.0.0"` (or at minimum `"1.1.0"`).

---

### 8. MutationObserver never stored or disconnected
**File:** `form.js:87-89`

```js
new MutationObserver(function () {
  if (!document.getElementById("pw-ext-panel")) init();
}).observe(document.body, { childList: true, subtree: false });
```
The observer is not assigned to a variable and can never be disconnected. It leaks and keeps firing for the entire lifetime of the page.

**Fix:** Store the observer (e.g. on `state`) and call `.disconnect()` if/when the panel is torn down.

---

### 9. URL watcher `setInterval` never cleared
**File:** `form.js:96-101`

```js
setInterval(function () {
  if (location.href !== state.lastUrl) { ... }
}, 300);
```
The interval ID is not stored and the interval runs at 300ms forever. Minor but wasteful.

**Fix:** Store the return value (e.g. `state.urlWatchInterval = setInterval(...)`) so it can be cleared if needed.

---

## Summary Table

| # | Severity | Description | File |
|---|---|---|---|
| 1 | Critical | Scrape button deadlock — callback not called on re-entry | `content.js:190`, `form.js:27` |
| 2 | Critical | Minimize slides wrong direction when left-docked | `panel.css:24` |
| 3 | Data | RCA dedup key collision if any field contains `\|` | `form.js:360` |
| 4 | Data | Excel cell styles silently dropped (need `cellStyles:true`) | `excel.js:150` |
| 5 | Logic | Status bar stale labeled count after Delete All | `form.js:305` |
| 6 | Logic | Status bar "0 scraped" if save races ahead of auto-scrape | `form.js:404` |
| 7 | Quality | `manifest.json` version still `1.0.0` | `manifest.json:4` |
| 8 | Quality | MutationObserver never disconnected | `form.js:87` |
| 9 | Quality | URL watcher setInterval never cleared | `form.js:96` |
