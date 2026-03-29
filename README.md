# Playwright RCA Helper

A Chrome extension that injects a panel into Playwright HTML reports so your team can label test failures, track root cause analysis, and export results to Excel — without leaving the report page.

---

## What it does

- **Label failures** — assign a label, category, owner, and Jira ticket to any test directly from the report
- **RCA library** — reusable autocomplete entries built from your labeling history
- **Excel export** — one-click download of all labeled results with SC numbers, names, results, and RCA data
- **Multi-banner export** — export all banners for the same Jenkins build into a single workbook (one sheet per banner)
- **RCA carryover** — when opening a new build, automatically offers to import labels from the previous build
- **Recurring detection** — tests that fail with the same label across 3+ consecutive builds are tagged `[RECURRING]`
- **Progress tracker** — live `X/Y fails labeled` counter with a progress bar; confetti fires when all failures are labeled
- **Dark mode** — follows system preference or toggle manually

---

## Installation

### From source (developer mode)

1. Clone or download this repo
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select the `extension/` folder
5. Open any Playwright HTML report (`localhost`, `file://`, or a Jenkins URL)

### From Chrome Web Store

Search for **Playwright RCA Helper** or install via the store link *(add link here)*.

---

## Usage

### Basic labeling

1. Open a Playwright HTML report in Chrome
2. The RCA Helper panel appears on the right side
3. Click any test row → the form populates with its name and result
4. Fill in **Label** (required), Category, Owner, Jira
5. Click **Save** — the entry is stored per-report-URL in IndexedDB

### RCA carryover (Jenkins)

When your report URL follows the Jenkins pattern:
```
.../environment/banner/343/html-report/index.html
```
Opening build `344` will show a banner:
> ↩ RCA from environment / Build 343 available (N labels)

Click **Import** to copy labels from the previous build as a starting point. Each build's data is independent — editing build 344 never touches build 343.

### Excel export

- **Single banner** — click the ↓ button in the header
- **Multi-banner** — click the multi-export button (visible on Jenkins URLs) to get all banners for the current build number in one file

---

## Key files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension manifest (MV3) |
| `content.js` | Core bootstrap — IndexedDB, scraping, state, carryover logic |
| `ui.js` | Panel HTML injection and layout |
| `form.js` | Form interactions, save/delete, list view, RCA library |
| `excel.js` | Single and multi-banner Excel export via SheetJS |
| `panel.css` | All panel styles (light + dark mode) |
| `xlsx.min.js` | Bundled SheetJS for Excel generation |

---

## Data storage

All data is stored in **IndexedDB** (origin-scoped), which means:
- Labels survive extension reinstalls and ID changes
- Data is scoped to the page origin — `localhost:9323` and `file://` are separate stores
- Reports are automatically purged after **10 days** of inactivity (with a warning toast)

---

## Branch structure

| Branch | Description |
|--------|-------------|
| `master` | Stable release (v2.7.1) |
| `feature/rca-carryover` | RCA carryover + progress tracker + confetti + bug fixes (v2.7.4) |

---

## Version history

| Version | Changes |
|---------|---------|
| 2.7.4 | Progress bar uses fail-test count as denominator |
| 2.7.3 | Progress tracker, confetti on completion, all critical bug fixes |
| 2.7.2 | Rebased rca-carryover onto master |
| 2.7.1 | IndexedDB migration, data-loss and race condition fixes |
| 2.7.0 | Migrated storage from chrome.storage to IndexedDB |
| 2.6.x | Label chips, searchable copy-from dropdown, chip row capping |
