# Playwright Test Identifier — Chrome Extension

**v2.3.8** — Label, organize, and export Playwright test results directly from the HTML report UI.

---

## What It Does

When you open a Playwright HTML report in your browser, this extension injects a side panel that lets you:

- Click any test row to view its details and assign metadata (label, category, owner, JIRA ticket)
- Save and persist that metadata across browser sessions
- Browse all labeled entries in the current report
- Maintain a reusable RCA (Root Cause Analysis) library across reports
- Export the full report with your labels to a styled Excel workbook

---

## Installation

1. Clone or download this repository
2. Download `xlsx.min.js` (SheetJS) and place it in the project root (required for Excel export)
3. Open Chrome and navigate to `chrome://extensions`
4. Enable **Developer mode** (top right toggle)
5. Click **Load unpacked** and select the project folder

The extension activates automatically on any Playwright HTML report page.

---

## Supported URLs

The extension runs on:

- `file://` — locally opened HTML reports
- `localhost` and `127.0.0.1` — reports served on loopback
- Any URL matching `*/html-report/*`

---

## Features

### Test Labeling

Click a test row in the Playwright HTML report to open its detail view. The side panel auto-populates with the test name, scenario code (e.g. `SC_015`), and result. Fill in:

| Field    | Description                                      |
|----------|--------------------------------------------------|
| Label    | Short description of the finding or fix          |
| Category | Type of issue (e.g. Functional Bug, UI Issue)    |
| Owner    | Person responsible for the fix or investigation  |
| JIRA     | Linked JIRA ticket ID                            |
| Date     | Date of the entry (defaults to today)            |

Hit **Save** to persist the entry. Entries are stored per report URL and auto-purged after 10 days.

### RCA Library

Every saved entry is added to a persistent cross-report library. When labeling a new test, the autocomplete fields pull suggestions from the library sorted by frequency of use. Use the **Copy from...** dropdown to quickly fill all fields from a previous entry.

### Saved Entries Tab

View all labeled entries for the current report. Filter by date, delete individual entries, or clear all at once.

### Excel Export

Click the **Export** button to download a `.xlsx` workbook named `identifier-report-YYYY-MM-DD.xlsx` with two sheets:

- **Summary** — generation date, total test counts, breakdowns by result, category, and owner
- **Details** — full test list with result-coded rows (green = PASS, red = FAIL) and all label fields

### Dark Mode

Toggle between light and dark themes using the moon/sun icon in the panel toolbar. Your preference is saved to `localStorage`. The extension also respects Playwright's own `dark` class on the `<html>` element.

### SPA Navigation Awareness

Playwright's HTML report is a React SPA. The extension polls for URL changes every 300ms and listens for arrow key navigation so the form always reflects the currently visible test without requiring a page reload.

---

## File Structure

```
PlaywrightIdentifierExtension/
├── manifest.json     # Chrome extension manifest (MV3)
├── content.js        # Core: report detection, state, storage, test scraping
├── ui.js             # Panel HTML injection, resize/dock, toast notifications
├── form.js           # Form logic, autocomplete, RCA library, navigation
├── excel.js          # Excel export via SheetJS
├── panel.css         # All styles (light/dark, tokens, layout)
├── icons/
│   └── icon48.png    # Extension icon
└── xlsx.min.js       # SheetJS (add manually — not committed)
```

---

## Storage Schema

Data is stored in Chrome's `chrome.storage.local`:

**`pw_reports`** — per-report data, keyed by page URL:
```json
{
  "http://localhost/index.html": {
    "url": "...",
    "scraped": [{ "id": "...", "sc": "SC_001", "name": "...", "result": "PASS" }],
    "labels": {
      "SC_001|Test name": {
        "label": "...", "category": "...", "owner": "...", "jira": "...",
        "labelDate": "2026-03-08", "timestamp": 1741392000000
      }
    },
    "lastAccessed": "2026-03-08T12:00:00.000Z"
  }
}
```

**`pw_rca_library`** — reusable entries across all reports:
```json
[
  { "id": "...", "label": "...", "category": "...", "owner": "...", "jira": "...", "useCount": 3, "lastUsed": 1741392000000 }
]
```

Reports not accessed in the last 10 days are automatically removed.

---

## Permissions

| Permission  | Reason                                   |
|-------------|------------------------------------------|
| `storage`   | Persist labels and RCA library           |
| `activeTab` | Detect and interact with the current tab |

---

## Changelog

| Version | Changes                                          |
|---------|--------------------------------------------------|
| 2.3.8   | Comprehensive JSDoc documentation                |
| 2.3.7   | Stability fixes — prevent duplicate listeners    |
| 2.3.6   | Logo dark mode fix                               |
| 2.3.5   | Dark mode toggle and UI polish                   |
| 2.3.0   | Full UI overhaul to SaaS style                   |
| 2.2.5   | Toolbar redesign, date picker, Excel cleanup     |
| 2.0.1   | 9 bug fixes, magnifying lens icon                |
| 1.0.0   | Multi-report storage, TTL, persistent RCA library|

---

## Requirements

- Google Chrome (Manifest V3)
- `xlsx.min.js` (SheetJS) placed in the project root for Excel export
