# Agents Descriptor

This file is for coding agents working on the UpLearn Economics Study Dashboard. Read it before editing the app so you understand the data flow, local-only archive assumptions, and safe ways to test changes.

## Project Purpose

This repository contains a static study dashboard built from an exported UpLearn Economics archive. The dashboard is meant to make the exported course easier to search, revise, and study locally.

The tracked app is the dashboard and its generated catalog. The raw exported archive is intentionally local-only and ignored by Git.

## Current Repository Shape

- `site/index.html`: static HTML shell and templates for the dashboard.
- `site/styles.css`: all visual styling for the dashboard.
- `site/app.js`: all client-side app logic, including local-vs-hosted archive URL resolution.
- `site/catalog.json`: generated catalog consumed by `site/app.js`.
- `serve_uplearn_site.py`: local HTTP server for the project root. It supports byte range requests, which matters for local video playback.
- `launch_uplearn_site.ps1`: Windows convenience launcher. It starts the local server if needed and opens `http://127.0.0.1:8000/site/`.
- `build_uplearn_site.py`: builds `site/catalog.json` from the local `archive/UpLearn Economics` export.
- `uplearn_econ_export.py`: exports course data and media from UpLearn into `archive/UpLearn Economics`.
- `selenium_audit.py`: shorter Selenium smoke/audit script.
- `full_selenium_walkthrough.py`: broader Selenium walkthrough that exercises search, study mode, quizzes, videos, notes, paper mode, flashcards, export/import, and reset.
- `.github/workflows/deploy-pages.yml`: deploys the `site/` folder to GitHub Pages.
- `.gitattributes`: normalizes line endings.
- `.gitignore`: excludes the raw archive and generated scratch/test artifacts.

## Local-Only Files

These paths are expected locally but should not be committed without a deliberate decision:

- `archive/`
- `chrome-profile-copy/`
- `shots/`
- `__pycache__/`
- `selenium_audit_report.json`
- `full_selenium_walkthrough_report.json`
- `site_preview*.png`

The hosted GitHub Pages version can load the dashboard and `site/catalog.json`. Archive-backed resources can also be served from Google Cloud Storage in hosted mode, while local development still expects the ignored `archive/` folder to exist beside `site/` in the local project root.

## Data Flow

1. `uplearn_econ_export.py` talks to the UpLearn GraphQL API and writes the full local archive under `archive/UpLearn Economics`.
2. `build_uplearn_site.py` reads the local archive and writes a compact generated catalog to `site/catalog.json`.
3. `site/index.html`, `site/styles.css`, and `site/app.js` render the study dashboard in the browser.
4. `site/app.js` fetches `./catalog.json` at boot.
5. Archive-backed resources are resolved by `archiveUrl(path)`.
6. `archiveUrl(path)` uses the local `../archive/` path on `127.0.0.1` and `localhost`, and uses the Google Cloud Storage base URL in hosted mode.
7. User progress lives only in browser `localStorage` under `uplearn-econ-progress-v3`.

## Catalog Snapshot

At the time this descriptor was written, `site/catalog.json` contained:

- 4 modules
- 132 topics
- 1,015 videos
- 452 quizzes
- 1,766 quiz questions
- 558 definitions
- 32 exam papers
- 202 exam questions

If the archive is regenerated, rebuild `site/catalog.json` and update this snapshot if useful.

## Running Locally

From the project root:

```powershell
python serve_uplearn_site.py
```

Then open:

```text
http://127.0.0.1:8000/site/
```

On Windows:

```powershell
.\launch_uplearn_site.ps1
```

The server binds to `127.0.0.1` and uses `UPLEARN_SITE_PORT` if set, otherwise port `8000`.

## Rebuilding Data

To rebuild only the dashboard catalog from an existing local archive:

```powershell
python build_uplearn_site.py
```

This expects:

```text
archive/UpLearn Economics/summary.json
archive/UpLearn Economics/Year 12/...
archive/UpLearn Economics/Year 13/...
```

To re-export from UpLearn:

```powershell
$env:UPLEARN_TOKEN = "<token>"
python uplearn_econ_export.py
python build_uplearn_site.py
```

Do not paste real tokens into docs, commits, issues, logs, or PR descriptions. `uplearn_econ_export.py` currently contains a fallback token constant; prefer `UPLEARN_TOKEN` and treat auth material as sensitive.

## Frontend Architecture

The frontend is intentionally framework-free:

- `boot()` loads `catalog.json`, seeds flashcards, binds events, renders stats, and applies filters.
- Global `state` holds the catalog, filtered modules, progress, quiz session, flashcard session, current study session, and timer handle.
- Filtering flows through `applyFilters()`, `buildModuleHaystack()`, `renderModules()`, and topic/module render helpers.
- Progress flows through `loadProgress()`, `normalizeProgress()`, `saveProgress()`, and localStorage.
- Smart review flows through `renderSmartDashboard()`, `buildTodayPlan()`, flashcard helpers, weak-topic helpers, and recommendation helpers.
- Study mode flows through `openTopicStudy()`, `openVideoStudy()`, `openQuizStudyNotes()`, `openStudyHtml()`, `openExamPaperStudy()`, and `setStudySession()`.
- Quiz practice flows through `openQuiz()`, `normalizeQuestion()`, `renderQuiz()`, question renderers, `gradeQuestion()`, and `finishQuiz()`.
- Paper mode flows through paper state helpers, timer helpers, mark inputs, and sidebar rendering.

Important DOM IDs are declared near the top of `site/app.js`. When changing `site/index.html`, keep those IDs in sync with `site/app.js`.

## Progress Model

Progress is stored in localStorage and can be exported/imported from the UI. The shape includes:

- topic state: summaries, videos, quizzes, notes, covered flags, last touched timestamps
- quiz scores and attempts
- flashcard schedule and ratings
- paper timing, completion, and marks
- preferences such as study stage and filtering behavior
- last opened study session

When changing this model, update `normalizeProgress()` so older saved progress continues to work.

## Styling Notes

The app uses a dark dashboard style with green/blue accents:

- CSS variables live at the top of `site/styles.css`.
- Layout is a two-column shell with sticky sidebar and main dashboard/study content.
- Dialogs are native `<dialog>` elements.
- Course/topic content uses cards, details/summary sections, pills, and progress widgets.
- Responsive behavior is entirely CSS-driven.

Keep new UI consistent with the existing dashboard language unless intentionally redesigning the whole app.

## Deployment

The GitHub Pages workflow publishes only the `site/` directory. The hosted app therefore depends on the external Google Cloud Storage bucket for archive-backed videos, JSON, HTML, and raw assets.

Before changing Pages behavior or bucket permissions, decide whether the raw archive should remain private/local. Publishing exported course materials should be treated as a deliberate privacy/copyright decision.

## Testing

Basic local smoke test:

```powershell
python serve_uplearn_site.py
```

Then visit `http://127.0.0.1:8000/site/` and check that modules render.

Automated audits require Selenium and Chrome/Chromedriver support:

```powershell
python selenium_audit.py
python full_selenium_walkthrough.py
```

Generated outputs are ignored by Git:

- `selenium_audit_report.json`
- `full_selenium_walkthrough_report.json`
- `shots/`

Useful manual checks after frontend changes:

- Dashboard loads without console errors.
- Search filters modules/topics.
- Module details expand.
- Topic study opens and notes save.
- Quiz dialog opens and can answer/navigate questions.
- Flashcard session opens, reveals, and rates cards.
- Paper mode opens, timer works, marks update score.
- Export/import progress works.
- Local raw archive/video links work when `archive/` exists.

## Git And Branch State

Primary branch is `main`.

`master` previously held the site work and was merged into `main` with unrelated histories. If `origin/master` still exists, delete it only with explicit user confirmation because that is a GitHub-side branch deletion.

## Safety And Privacy Notes

- Do not commit `archive/` unless the user explicitly asks and understands the implications.
- Do not expose UpLearn auth tokens, cookies, account data, or private course exports.
- Do not run `uplearn_econ_export.py` against the live UpLearn API unless the user asks for a fresh export and has authorized token use.
- Do not overwrite local progress in the browser unless the user asks; reset progress is user-facing and destructive.
- Avoid destructive Git commands such as hard resets or branch deletion without explicit approval.

## Common Change Recipes

Add a new dashboard widget:

1. Add markup or a template in `site/index.html`.
2. Add styles in `site/styles.css`.
3. Add state/render logic in `site/app.js`.
4. Reuse existing progress/catalog helpers where possible.
5. Smoke test locally.

Change catalog shape:

1. Update `build_uplearn_site.py`.
2. Rebuild `site/catalog.json`.
3. Update `site/app.js` consumers.
4. Keep old/optional fields tolerated where possible.

Change progress shape:

1. Update `createEmptyProgress()`.
2. Update `normalizeProgress()` for backwards compatibility.
3. Update export/import expectations if needed.
4. Test with existing localStorage and a fresh profile if practical.

Change raw archive rendering:

1. Check how `archiveUrl(path)` resolves paths.
2. Confirm the target file exists under local `archive/` and, when relevant, under the configured Google Cloud Storage bucket.
3. Keep the local/hosted split in mind: localhost uses local files, GitHub Pages uses GCS.

## GCS Archive Backend

Hosted archive assets are stored in:

- project: `uplearn-econ-dash-260426`
- bucket: `gs://uplearn-economics-study-dashboard-assets-260426`
- region: `europe-west2`
- public base URL: `https://storage.googleapis.com/uplearn-economics-study-dashboard-assets-260426/`

The upload preserves the `archive/...` prefix exactly so existing catalog paths keep working without regeneration.

Recommended upload command from the repo root:

```powershell
& 'C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd' storage rsync archive gs://uplearn-economics-study-dashboard-assets-260426/archive --recursive
```

Current CORS policy should allow:

- origins: `https://gurv1r.github.io`, `http://127.0.0.1:8000`, `http://localhost:8000`
- methods: `GET`, `HEAD`, `OPTIONS`
- response headers: `Content-Type`, `Content-Length`, `Accept-Ranges`, `Content-Range`, `ETag`

Do not make the bucket public without explicit user confirmation because the archive contains exported course materials.

## Known Limitations

- The app is a single large vanilla JS file, so related behavior may be separated by helper order rather than modules.
- Hosted Pages does not include raw archive content directly; it relies on the external Google Cloud Storage bucket.
- The catalog is generated and can become stale if the raw archive changes.
- Browser progress is per-origin localStorage; changing host/port/domain changes where progress is stored.
- Selenium scripts assume the site is served at `http://127.0.0.1:8000/site/`.
