# EconFlow

EconFlow is a local-first Edexcel A-Level Economics revision dashboard built from an exported UpLearn Economics archive.

The app turns the raw Year 12 and Year 13 course export into a clearer Economics A Level study workspace with:

- module and topic browsing
- video, quiz, article, and exam-paper access
- progress tracking
- flashcard review
- revision notes
- weak-topic and today-plan suggestions
- optional Firebase-backed login and sync

## What Lives In Git

This repository tracks:

- the EconFlow dashboard app in `site/`
- the catalog builder and export scripts
- deployment and backend config
- the generated `site/catalog.json`

This repository does not normally track:

- the full `archive/UpLearn Economics` export
- browser profile copies
- screenshots
- local audit output

## Repository Layout

```text
.
+-- site/
|   +-- index.html
|   +-- styles.css
|   +-- app.js
|   +-- catalog.json
|   +-- js/
|   |   +-- config/
|   |   +-- services/
|   |   +-- ui/
|   |   \-- utils/
|   \-- firebase-config.js
+-- build_uplearn_site.py
+-- uplearn_econ_export.py
+-- serve_uplearn_site.py
+-- launch_uplearn_site.ps1
+-- scripts/
+-- docs/
+-- selenium_audit.py
+-- full_selenium_walkthrough.py
+-- firestore.rules
+-- gcs-cors.json
\-- agents-descriptor.md
```

## How It Works

The project has a straightforward pipeline:

1. `uplearn_econ_export.py` exports course data and media into `archive/UpLearn Economics`
2. `build_uplearn_site.py` reads that archive and writes `site/catalog.json`
3. `site/app.js` bootstraps EconFlow and composes the smaller frontend modules under `site/js/`
4. raw resources are resolved through local archive paths in development and GCS paths in production

## Quick Start

Serve the repo root locally:

```powershell
python serve_uplearn_site.py
```

Then open:

```text
http://127.0.0.1:8000/site/
```

On Windows, you can also use:

```powershell
.\launch_uplearn_site.ps1
```

If you need a different local port:

```powershell
$env:UPLEARN_SITE_PORT = "8010"
python serve_uplearn_site.py
```

Validate the committed static app before pushing:

```powershell
python scripts/validate_site.py
```

## Local Archive Expectations

The builder and local media links expect this structure beside the repo source:

```text
archive/
\-- UpLearn Economics/
    +-- summary.json
    +-- Year 12/
    \-- Year 13/
```

If the archive is missing:

- the committed dashboard UI still loads
- `site/catalog.json` still loads
- raw local lesson/video links will not resolve

## Rebuild The Catalog

After changing archive parsing logic or after refreshing the archive:

```powershell
python build_uplearn_site.py
```

This rebuilds:

- `site/catalog.json`

The builder currently extracts:

- modules
- topics
- videos
- articles
- quizzes
- definitions
- exam papers
- API-verified video ordering metadata

## Re-Export From UpLearn

If you explicitly need a fresh live export:

```powershell
$env:UPLEARN_TOKEN = "<token>"
python uplearn_econ_export.py
python build_uplearn_site.py
```

Important:

- do not paste real tokens into commits, docs, issues, or logs
- prefer `UPLEARN_TOKEN` over relying on any fallback token in code
- treat exported course data as sensitive

## Video Ordering

Video order matters in this project.

The correct sequence comes from the UpLearn API lesson arrays, not from alphabetical folder order.

Current behavior:

- the export script can stamp `displayOrder` and `displayTitle` into `lesson.json`
- the builder reconstructs lesson order from each module's exported `module.json`
- the generated catalog carries `displayOrder` and `displayTitle`
- the UI labels videos like `Video 1 - Title`

This was verified against the live API for the visible Economics topics in the catalog.

## Progress Storage

Local progress is stored in browser `localStorage` under:

```text
uplearn-econ-progress-v3
```

That key is intentionally unchanged so existing local progress carries over into EconFlow without a migration step.

The app stores:

- topic completion and touches
- quiz attempts and review history
- flashcard scheduling
- notes
- exam-paper tracking
- preferences
- last opened study session

EconFlow includes export/import controls for this progress.

## Firebase Login And Sync

Cloud sync is optional and local-first.

Current setup:

- auth: Email/Password
- Firestore document path: `users/{uid}/progress/default`
- local progress writes happen immediately
- cloud sync compares `updatedAt` and keeps the newer payload

To enable it:

1. create or choose a Firebase project
2. enable Email/Password authentication
3. create Firestore
4. apply `firestore.rules`
5. fill in `site/firebase-config.js`

If Firebase is not configured, the app stays in local-only mode.

## GitHub Pages And Hosted Archive

GitHub Pages serves the static EconFlow site from `site/`.

Hosted archive-backed assets are served from Google Cloud Storage:

- project: `uplearn-econ-dash-260426`
- bucket: `gs://uplearn-economics-study-dashboard-assets-260426`
- public base URL: `https://storage.googleapis.com/uplearn-economics-study-dashboard-assets-260426/`

Behavior split:

- local `127.0.0.1` / `localhost`: reads `../archive/...`
- hosted GitHub Pages: reads the GCS bucket

Catalog paths remain stable:

- `archive/UpLearn Economics/...`

That lets one generated catalog work in both environments.

## GCS Commands

Upload or refresh hosted archive assets:

```powershell
& 'C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd' storage rsync archive gs://uplearn-economics-study-dashboard-assets-260426/archive --recursive
```

Reapply CORS policy:

```powershell
& 'C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd' storage buckets update gs://uplearn-economics-study-dashboard-assets-260426 --cors-file=gcs-cors.json
```

## Testing

Good manual checks after app or catalog changes:

- dashboard loads without errors
- module accordions expand
- topic completion controls persist
- study workspace opens expected resources
- video order and labels are correct
- quizzes can be answered
- flashcards rate and save
- notes save
- paper mode works

Automation helpers:

```powershell
python selenium_audit.py
```

```powershell
python full_selenium_walkthrough.py
```

## Refactor Notes

The first refactor pass keeps the static Pages deployment model, but splits shared frontend concerns into modules:

- `site/js/config/` for constants and environment-aware archive resolution
- `site/js/services/` for resource loading, local persistence, and cloud config
- `site/js/ui/` for DOM lookup
- `site/js/utils/` for labels and text handling

Additional documentation:

- `docs/architecture.md`
- `docs/local-dev.md`
- `docs/deploy.md`

## Development Notes

- Serve the repo root, not `site/index.html` directly
- Rebuild `site/catalog.json` after builder or archive logic changes
- Bump cache-busting query params in `site/index.html` when frontend updates need to reach Pages quickly
- Avoid committing `archive/`
- Read `agents-descriptor.md` before making larger automated changes

## Current Snapshot

The generated catalog currently contains:

- 4 modules
- 132 topics
- 1,015 videos
- 452 quizzes
- 1,766 quiz questions
- 558 definitions
- 32 exam papers

Those numbers are useful as a sanity check, but they may legitimately change after a fresh export.
