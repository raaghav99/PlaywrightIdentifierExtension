# Claude Code — Project Workflow

## Multi-Model Pipeline (AUTO-ACTIVATE ON OPEN)

This project uses a 4-model collaborative pipeline. Follow this for every non-trivial task:

| Step | Model | Role |
|------|-------|------|
| 1 | **Claude** | Generate idea, shape the ask |
| 2 | **Codex CLI** | Review idea, write technical spec + edge cases |
| 3 | **Gemini CLI** | Write the actual code from the spec |
| 4 | **Claude** | Final review, security/logic check, then push |

## Rules

- **Always follow the pipeline** for new features, bug fixes, and refactors.
- **Claude starts every task** by generating the idea/approach before handing off.
- **Codex reviews** — never skips edge cases or requirements.
- **Gemini writes code** — production-ready, clean, with inline comments.
- **Claude does final review** before any `git push` or deployment.
- Pipeline outputs are saved to `pipeline_runs/<timestamp>/` for audit trail.

## How to Run the Pipeline

```bash
./pipeline.sh "describe your task here"
```

Then bring the output back to Claude for final review.

## Project

**PlaywrightIdentifierExtension** — Chrome extension for identifying and highlighting Playwright selectors, extracting test data, and generating RCA reports.

## Key Files

- `extension/` — Chrome extension source
- `content.js` — DOM interaction + selector logic
- `ui.js` — Panel UI
- `panel.css` — Styles
- `manifest.json` — Extension manifest
- `pipeline.sh` — Multi-model pipeline script

## On Every Session Start

1. Greet and confirm pipeline is active
2. Ask what the user wants to build/fix
3. Generate idea (Step 1) before anything else
