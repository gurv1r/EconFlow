# UpLearn Economics Study Dashboard

A local-first revision dashboard for an exported UpLearn Economics archive. It turns the Year 12 and Year 13 course export into a searchable study workspace with topic browsing, revision tracking, spaced flashcard review, quiz practice, exam-paper mode, study notes, and weak-topic recommendations.

The project is designed to keep the large/raw course archive out of Git while still publishing the dashboard source and generated catalog.

## Highlights

- **Searchable course catalog** for modules, topics, quizzes, definition packs, videos, articles, and exam papers.
- **Smart revision dashboard** with due flashcards, weak-topic focus, today-plan suggestions, and recent notes.
- **Progress tracking in the browser** using `localStorage`, including topic completion, quiz review data, flashcard scheduling, notes, and exam-paper practice.
- **Spaced flashcard review** generated from exported definition groups.
- **Exam-focused support** for Edexcel Economics themes, paper guidance, timed paper practice, and mistake review.
- **Local media playback** through a small Python HTTP server with byte-range support for video/audio files.
- **GitHub Pages deployment** for the static dashboard interface and catalog.

## Repository Structure

```text
.
├── site/                         # Static dashboard app
│   ├── app.js                    # Main dashboard logic and progress system
│   ├── catalog.json              # Generated course catalog consumed by the app
│   └── ...                       # HTML/CSS/assets for the dashboard
├── build_uplearn_site.py         # Builds site/catalog.json from the local archive
├── serve_uplearn_site.py         # Local HTTP server with range-request support
├── launch_uplearn_site.ps1       # Windows helper to start the server and open the app
├── uplearn_econ_export.py        # Export/rebuild helper script
├── selenium_audit.py             # Browser audit/testing helper
├── full_selenium_walkthrough.py  # End-to-end browser walkthrough helper
└── agents-descriptor.md          # Notes for future coding agents
```

## Requirements

- Python 3.10+
- A modern browser
- Windows PowerShell, only if using `launch_uplearn_site.ps1`
- Optional: Chrome, Selenium, and related drivers if running the audit/walkthrough scripts

No Node.js build step is required for the dashboard itself.

## Quick Start

Clone the repository and start the local server from the project root:

```powershell
python serve_uplearn_site.py
```

Then open:

```text
http://127.0.0.1:8000/site/
```

On Windows, the launcher can start the server if needed and open the dashboard automatically:

```powershell
.\launch_uplearn_site.ps1
```

By default the server uses port `8000`. To choose another port:

```powershell
$env:UPLEARN_SITE_PORT = "8010"
python serve_uplearn_site.py
```

## Rebuilding the Catalog

The dashboard reads `site/catalog.json`. To rebuild it from the local exported archive, keep the archive in this expected location:

```text
archive/UpLearn Economics/
```

Then run:

```powershell
python build_uplearn_site.py
```

The builder scans modules, definitions, exam papers, topic summaries, article lessons, quizzes, and videos, then writes a fresh `site/catalog.json`.

## Local Archive Expectations

The raw UpLearn export is intentionally not committed. Local-only features, such as opening raw videos, article HTML, quiz source files, and archive assets, expect the ignored `archive/` folder to sit beside the repository source.

A simplified expected layout is:

```text
archive/
└── UpLearn Economics/
    ├── summary.json
    ├── Year 12/
    └── Year 13/
```

If the archive is missing, the static dashboard can still load the committed interface and catalog, but links to raw local media/assets will not resolve.

## Progress and Data Storage

Study progress is stored in the browser under the localStorage key:

```text
uplearn-econ-progress-v3
```

The app tracks:

- topic completion
- quiz scores and mistake reviews
- flashcard scheduling
- notes and recent study resources
- exam-paper practice state
- study preferences such as AS/A Level scope and covered-topic filters

Use the dashboard export/import controls to back up or move progress between browsers/devices.

## GitHub Pages

This repository includes a GitHub Actions workflow that publishes the `site/` folder to GitHub Pages.

The hosted version can browse the static interface, generated catalog, and archive-backed assets through Google Cloud Storage while local development still reads from the ignored `archive/` folder.

Archive backend behavior:

- Local mode on `127.0.0.1` or `localhost` keeps loading raw assets from the local `../archive/` path.
- Hosted mode on GitHub Pages switches `site/app.js` to `https://storage.googleapis.com/uplearn-economics-study-dashboard-assets-260426/`.
- Catalog paths stay unchanged at `archive/UpLearn Economics/...`, so the same `site/catalog.json` works in both environments.

GCS bucket details:

- Project ID: `uplearn-econ-dash-260426`
- Bucket: `gs://uplearn-economics-study-dashboard-assets-260426`
- Region: `europe-west2`
- Public base URL: `https://storage.googleapis.com/uplearn-economics-study-dashboard-assets-260426/`

CORS is configured for:

- `https://gurv1r.github.io`
- `http://127.0.0.1:8000`
- `http://localhost:8000`

Supported methods and response headers:

- Methods: `GET`, `HEAD`, `OPTIONS`
- Response headers: `Content-Type`, `Content-Length`, `Accept-Ranges`, `Content-Range`, `ETag`

## Cloud Login And Sync

The dashboard now includes a local-first account system for sign up, log in, and cross-device progress sync using Firebase Authentication and Cloud Firestore.

What it stores:

- topic completion and touches
- quiz attempts, answers, and review history
- flashcard scheduling
- notes and note index
- exam-paper tracking
- last opened study session
- course-stage preferences

How it works:

- The dashboard still writes immediately to browser `localStorage`.
- When a user signs in, the app compares local progress with the Firestore document and keeps the newer copy.
- Later edits stay local-first and are pushed to Firestore automatically after a short debounce.
- Manual `Sync now` and `Pull cloud save` buttons are available in the sidebar UI.

Firebase setup:

1. Create or link a Firebase project for this app.
2. Add a web app in the Firebase console.
3. Enable Email/Password under Authentication.
4. Create a Firestore database.
5. Apply the rules from [firestore.rules](C:/Users/Gurvir/Documents/2026-04-23-i-have-chrome-open-with-my-2/firestore.rules).
6. Fill in [site/firebase-config.js](C:/Users/Gurvir/Documents/2026-04-23-i-have-chrome-open-with-my-2/site/firebase-config.js) and set `enabled: true`.

The config file is intentionally checked in with empty placeholders so the static app keeps working before Firebase is wired up.

To enable Pages:

1. Open the repository on GitHub.
2. Go to **Settings → Pages**.
3. Set **Source** to **GitHub Actions**.
4. Push to `main` or rerun the Pages workflow.

## Testing and Audits

The repository includes Selenium helper scripts for checking the dashboard in a browser:

```powershell
python selenium_audit.py
python full_selenium_walkthrough.py
```

These scripts are intended for local validation while developing UI or catalog changes.

## Ignored Local Files

The following are intentionally kept out of Git:

- `archive/`
- `chrome-profile-copy/`
- `shots/`
- `__pycache__/`
- generated audit reports
- generated preview screenshots

This keeps the repository lightweight and focused on the dashboard source, generated catalog, and automation scripts rather than the full exported course dump.

## GCS Archive Sync

Upload or resume the archive sync from the project root with:

```powershell
& 'C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd' storage rsync archive gs://uplearn-economics-study-dashboard-assets-260426/archive --recursive
```

The sync preserves the `archive/...` prefix exactly so existing catalog paths continue to line up with the exported archive.

To reapply the bucket CORS policy:

```powershell
& 'C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd' storage buckets update gs://uplearn-economics-study-dashboard-assets-260426 --cors-file=gcs-cors.json
```

## Development Notes

- Keep `site/catalog.json` in sync after changing archive parsing logic.
- Use the local Python server rather than opening `site/index.html` directly, especially when testing media playback or archive links.
- Avoid committing raw exported course files or browser profile data.
- Read `agents-descriptor.md` before making larger automated code changes.
- If you enable cloud auth, remember that Firebase client config belongs in `site/firebase-config.js` and Firestore rules must limit each user to their own document.
