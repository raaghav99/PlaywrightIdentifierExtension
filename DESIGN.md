# Dual-Panel Workbench Layout — Design Proposal

## Concept

Transform the extension from a single toggle-view side panel into a **dual-panel flanking workbench**, where the host page stays visible in the center and both sides serve distinct purposes.

---

## Layout

```
┌─────────────────┬──────────────────────────────┬─────────────────┐
│   LEFT PANEL    │        HOST PAGE / DATA       │   RIGHT PANEL   │
│  (RCA Library   │                               │  (Form + Save)  │
│   Saved List)   │   ← page content centered →   │                 │
│                 │                               │                 │
│  240px          │        flex: 1                │  300px          │
└─────────────────┴──────────────────────────────┴─────────────────┘
```

The middle section is the live host page — the test list or page under test stays visible at all times while the user fills in data on the right and references the library on the left.

---

## Panel Responsibilities

### Left Panel — Reference & History

| Section | Content |
|---|---|
| Saved entries list | Browse previously saved RCA entries |
| RCA Library table | Full read-only reference table |
| Report switcher | Tab between different URLs / sessions |
| Search / filter bar | Filter library or saved entries |
| Stats summary | Count of passed / failed / labeled tests |

### Right Panel — Active Work

| Section | Content |
|---|---|
| SC / Name / Result | Read-only test context (from click) |
| Label + autocomplete | Main RCA label input |
| Category / Owner / Jira | Supporting metadata fields |
| Save + Delete buttons | Commit or remove the entry |
| Status bar | Last save time, sync status |

---

## Why This Split Makes Sense

**Currently**, both the library and the form are in one panel and toggled with buttons — the user loses context of the library when filling the form, and vice versa.

**With dual panels**, the workflow becomes:
1. User clicks a failing test on the page (center)
2. Right panel auto-fills with SC / Name / Result
3. User looks left to find the correct RCA label from the library
4. User types / selects the label on the right
5. Saves — saved entry immediately appears in the left list

No toggling. No lost context. Everything visible at once.

---

## Screen Width Concern

This layout requires enough horizontal space to be useful.

| Screen Width | Usable Center | Verdict |
|---|---|---|
| 1920px | 1380px | Excellent |
| 1440px | 900px | Good |
| 1366px | 826px | Acceptable |
| 1280px | 740px | Tight |
| < 1200px | < 660px | Left panel should auto-hide |

**Rule:** If `window.innerWidth < 1200`, the left panel should be hidden by default on load.

---

## Minimum Screen Width Handling

- On load, check `window.innerWidth`
- If below threshold (1200px), left panel is hidden
- User can manually show it via a toggle button in the toolbar
- Persist the user's preference in `chrome.storage.local`

---

## Dimensions

| Panel | Default Width | Min | Max |
|---|---|---|---|
| Left | 240px | 180px | 360px |
| Right | 300px | 260px | 420px |
| Center | flex: 1 | 400px | unlimited |

Both panels support drag-to-resize using the existing resize handle pattern already in place on the right panel.

---

## State to Persist

```json
{
  "leftPanelVisible": true,
  "leftPanelWidth": 240,
  "rightPanelWidth": 300
}
```

Stored alongside the existing `side`, `width`, and `position` keys in `chrome.storage.local`.

---

## What Does NOT Change

- Toolbar stays at the top of the right panel only — no dual toolbars
- Keyboard shortcuts remain the same
- The existing RCA autocomplete, save, delete, and sync logic is unchanged
- The extension still injects into the host page via content script — no new permissions needed

---

## Open Questions (To Decide Before Implementation)

1. Should the left panel also have a toolbar row (search, filter toggle)?
2. Should clicking a saved entry in the left panel pre-fill the right panel form?
3. Should the left panel show entries for the current URL only, or all saved entries?
4. Resize handles: one between left+center, one between center+right, or just right panel resizable?
