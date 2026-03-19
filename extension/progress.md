# Progress

## Feature 1: RCA Carryover
- [x] `parseJenkinsUrl` + `findPreviousBuildReport` + `importLabelsFromPreviousBuild` (content.js)
- [x] `getRecurringTestIds` — 3-build streak detection (content.js)
- [x] `checkCarryover()` — init-time check, suppress key logic (form.js)
- [x] Carryover banner HTML — `#pw-carryover-banner` (ui.js)
- [x] Import / Ignore button wiring with localStorage suppression (form.js)
- [x] `[RECURRING]` badge in renderList Saved view (form.js)
- [x] Banner + recurring badge styles (panel.css)
- [x] Manifest version bump → 2.7.0

## Feature 3: Multi-Banner Summary Export
- [x] `downloadMultiBannerExcel()` — collects all same-env/build reports (excel.js)
- [x] One Details sheet per banner + cross-banner Summary sheet (excel.js)
- [x] `#pw-multi-export-btn` in header actions, hidden unless Jenkins URL (ui.js)
- [x] Button wired to `downloadMultiBannerExcel()` (form.js)

## Feature 4: Recurring Failure Tagging
- [x] `getRecurringTestIds(env, banner, allReports, threshold)` — walk back N builds (content.js)
- [x] Recurring prefix `[RECURRING]` applied during import in `importLabelsFromPreviousBuild` (content.js)
- [x] `[RECURRING]` badge rendered in Saved list (form.js + panel.css)

## Branch Setup
- [x] `feature/rca-carryover` — active branch for all Feature 1/3/4 work
- [x] `feature/onedrive-testing` — created from master (empty, ready)
- [x] `feature/blob-testing` — created from master with .gitignore guards committed
