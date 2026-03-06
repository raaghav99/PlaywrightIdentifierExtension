# Feature Batch: Auto-Scrape, Download All, Date Labels, Label History

---

## 1. Auto-Scrape All Tests on Load

### What
When the extension initialises (`init()` in `content.js`), immediately scrape
**every** `.test-file-test` row on the page and save them to
`chrome.storage.local` as a lightweight "skeleton" list — even before the user
clicks anything.

### Data shape (skeleton entry)
```js
{
  id:        "sc_SC_042_Test name here",   // deterministic, derived from sc+name
  sc:        "SC_042",
  name:      "Login - should redirect user",
  result:    "FAILED",
  label:     "",        // empty until user fills in
  category:  "",
  owner:     "",
  jira:      "",
  timestamp: null       // null = not yet labelled by user
}
```

### Key rules
- Use a **deterministic ID** (`sc + "|" + name`) so re-scraping on URL change
  doesn't create duplicates — it just upserts.
- Only overwrite `result` on re-scrape (result can change between runs).
  Never overwrite `label / category / owner / jira / timestamp` if already set.
- Store in a **separate key** `pw_scraped` to avoid mixing with labelled
  `pw_entries`. On download, merge both: `pw_scraped` provides the base rows,
  `pw_entries` values patch in the user-filled metadata.

### Where to add
- New function `scrapeAllTests()` called at end of `init()` in `content.js`.
- Reuse the same SC/Name/Result extraction logic already in `populateForm()`
  (`form.js:162–196`) — extract it into a shared helper `extractRowData(row)`.

---

## 2. Download Without Labels (Full Page Export)

### What
`downloadExcel()` (`excel.js`) currently bails if `pw_entries` is empty.
Change it so it always downloads. Rows with no label are included with an empty
Label column — only SC, Name, and Result are mandatory.

### Behaviour
- Read `pw_scraped` (all tests) and `pw_entries` (labelled ones).
- Merge: for each scraped row, if a matching `pw_entries` entry exists
  (same SC + Name), use the labelled data; otherwise use the skeleton row.
- Sort entire output by SC number ascending (already done for labelled rows,
  extend to all rows).
- Summary sheet: count "Labelled" vs "Unlabelled" totals separately.
- Toast changes: instead of "No saved entries to export", always proceed.
  Show `"Exported N tests (X labelled)"`.

### Columns stay the same
`SC No | Scenario Name | Result | Label | Category | Owner | Jira | Labelled Date`

Unlabelled rows: Label/Category/Owner/Jira/Date cells are blank.

---

## 3. Date-Prefixed Labels + Date Picker

### What
Two connected changes:

#### 3a. Date picker in the form
Add a compact date picker input above the Label field.
Default value = today's date.
Stored in `state.selectedDate` (shared state object in `content.js`).

```
[Date: 05/03/2026 ▾]     ← date input, defaults to today
[Label: ____________]
```

#### 3b. Label gets date prefix on save
When `saveEntry()` (`form.js:314`) builds `entryData`, prefix the label:

```
"05/03: Login timeout issue"
```

Format: `DD/MM: <user typed label>`.

- The date shown in the label uses the **selected date from the picker**, not
  necessarily today (so user can back-date to e.g. 5th March for yesterday's run).
- The prefix is added automatically on save — user types only the description
  part.
- On the autocomplete dropdown (`showSuggestions`) strip the date prefix when
  matching, so `"Login timeout"` still finds `"05/03: Login timeout issue"`.

#### 3c. Filter by date in the saved list / download
When a date is selected in the picker:
- "View Saved" list filters to only entries whose label starts with that date
  prefix.
- Download button exports only entries for the selected date.
- A small **"All dates"** toggle/checkbox lets user override and export
  everything.

---

## 4. Delete All Button

### What
Add a **"Delete All"** button in the footer (next to "Download Excel").
Clears both `pw_entries` and `pw_scraped` from `chrome.storage.local`.

### Behaviour
- Show a confirmation toast first: `"Hold to confirm delete all"` or a simple
  `confirm()` dialog.
- After clearing: reset count badge to 0, clear the list view, show toast
  `"All data cleared"`.

### Where to add
- Button in `injectPanel()` (`ui.js:57`) in `#pw-footer`.
- Handler in `attachListeners()` (`form.js:9`).
- New function `deleteAllEntries()` in `form.js`.

---

## 5. Label History (Smart Autocomplete)

### What
Currently `showSuggestions("label")` (`form.js:120`) pulls labels from
`pw_entries` and sorts by frequency.

Replace this with a **dedicated label history store** (`pw_label_history`) in
`chrome.storage.local` that is maintained independently.

### Data shape
```js
// pw_label_history: array
[
  { text: "Login timeout issue", useCount: 7, lastUsed: "2026-03-06T10:00:00Z" },
  { text: "API 500 on checkout",  useCount: 3, lastUsed: "2026-03-05T14:22:00Z" },
  ...
]
```

### Sort order in dropdown
**Primary:** most recently used (lastUsed descending)
**Secondary:** highest use count

So the label you used 5 minutes ago appears at the top, even if an older label
has been used more times overall.

### When to update history
In `saveEntry()` (`form.js:314`), after successfully saving:
- Look up the label text (without date prefix) in `pw_label_history`.
- If found: increment `useCount`, update `lastUsed`.
- If not found: push a new entry with `useCount: 1`.
- Save back to `pw_label_history`.

### Dropdown behaviour
- Show top 10 matches.
- Match on the description part only (strip `DD/MM:` prefix if present).
- Show the label text **without** the date prefix in the dropdown — the prefix
  is added on save automatically.
- Show `(7x)` frequency badge next to each item (reuse existing
  `.pw-suggest-count` style).

---

## Storage Keys Summary

| Key               | Contents                                      |
|-------------------|-----------------------------------------------|
| `pw_entries`      | Labelled entries (existing, unchanged)        |
| `pw_scraped`      | Auto-scraped skeleton rows (SC+Name+Result)   |
| `pw_label_history`| Label usage history for smart autocomplete    |

---

## Files to Modify

| File         | Changes needed |
|--------------|----------------|
| `content.js` | Add `scrapeAllTests()` call in `init()`, add `state.selectedDate`, extract `extractRowData(row)` helper |
| `form.js`    | `saveEntry()` — date prefix + update `pw_label_history`; `showSuggestions("label")` — use history store; `attachListeners()` — wire Delete All and date picker; new `deleteAllEntries()` |
| `ui.js`      | `injectPanel()` — add date picker row above Label field, add "Delete All" button in footer |
| `excel.js`   | `downloadExcel()` — merge `pw_scraped` + `pw_entries`, remove empty-check bail, add date filter, update summary sheet |

---

## Implementation Order

1. `extractRowData(row)` helper (unblocks everything else)
2. `scrapeAllTests()` + `pw_scraped` store
3. Download merge logic in `excel.js`
4. Date picker UI + `state.selectedDate`
5. Date-prefixed save in `saveEntry()`
6. `pw_label_history` store + updated `showSuggestions`
7. Delete All button + `deleteAllEntries()`
