# Feature: Reuse Failure Metadata Across Test Cases

## Problem

When multiple test cases fail for the **same reason**, the user currently has to
manually retype the same Label, Category, Owner, and Bug ID (Jira) for every
test case. This is repetitive and error-prone.

## Idea

Add a **"Copy from previous"** dropdown (separate from the existing merge banner)
that lets you pull metadata from a previously saved entry into the current form.

### How it should work

1. User fills in **TestCase 1** completely:
   - SC, Name, Result (unique to this test)
   - Label, Category, Owner, Jira (the failure reason metadata)
   - Saves the entry.

2. User clicks **TestCase 2** (a different test, different SC + Name).
   - Form opens blank as usual.
   - A small **"Copy from..."** dropdown is available near the Label/Category fields.

3. User opens the dropdown — it lists **recently saved entries**, showing their
   Label · Category · Owner · Jira as a summary line.

4. User picks TestCase 1's entry from the dropdown.
   - Label, Category, Owner, Jira get **auto-filled** from TestCase 1.
   - SC, Name, Result remain as they are (unique to TestCase 2).

5. User hits **Save Entry** — a brand new entry is created for TestCase 2, but
   with the same failure metadata as TestCase 1.

---

## What stays unique per test

| Field    | Unique per test? |
|----------|-----------------|
| SC       | YES             |
| Name     | YES             |
| Result   | YES             |
| Label    | No — copied     |
| Category | No — copied     |
| Owner    | No — copied     |
| Jira     | No — copied     |

---

## Difference from existing Merge

| Feature        | Existing Merge                          | This Feature                              |
|----------------|-----------------------------------------|-------------------------------------------|
| Trigger        | Same SC + Name already exists in storage | Any previously saved entry               |
| Purpose        | Avoid duplicates / update same test     | Reuse failure reason across different tests |
| SC + Name      | Must match                              | Different (new test)                      |
| Result         | Can be updated                          | New, unique to this test                  |
| Outcome        | Updates or replaces an old entry        | Creates a new entry with copied metadata  |

---

## Implementation Notes (what needs to change)

- Add a **"Copy from..."** button/link near the Label field in the form UI (`form.html` / `ui.js`).
- On click, load all saved entries from `chrome.storage.local` and show them in
  a styled dropdown (reuse `.pw-merge-option` styles or similar).
- Display each option as: `Label · Category · Owner · Jira` (skip empty fields).
- On selection, populate only Label, Category, Owner, Jira — leave SC, Name,
  Result untouched.
- No `editingId` should be set — this is always a **new save**, not an update.
- Consider limiting the dropdown to the **last 20 unique label+category combos**
  to keep it clean.

---

## Priority

Update / implement this **after** the existing merge flow is stable, since it
is additive and does not conflict with current logic.
