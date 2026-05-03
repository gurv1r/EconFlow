# Agent Guide

This document is the working guide for coding agents on the EconFlow repository.

## What This Repo Is

This repository contains a static revision dashboard built around a local export of the UpLearn Economics course archive.

The tracked source of truth in Git is:

- the dashboard app in `site/`
- the catalog builder and export tooling
- the generated `site/catalog.json`
- deployment and backend config

The full exported course archive is local-only by default and is intentionally excluded from Git.

## Current Shape

Core app files:

- `site/index.html`: static shell, templates, dialogs, and cache-busted script/style references
- `site/styles.css`: all dashboard styling
- `site/app.js`: app state, rendering, archive path resolution, quiz flow, flashcards, notes, paper mode, and Firebase sync
- `site/catalog.json`: generated catalog consumed by `site/app.js`
- `site/firebase-config.js`: optional Firebase config toggle and placeholders

Data and tooling:

- `build_uplearn_site.py`: rebuilds `site/catalog.json` from the local archive
- `uplearn_econ_export.py`: exports course data and media from the UpLearn GraphQL API into `archive/UpLearn Economics`
- `serve_uplearn_site.py`: local HTTP server for the repo root with byte-range support
- `launch_uplearn_site.ps1`: Windows launcher for the local site

Verification helpers:

- `selenium_audit.py`
- `full_selenium_walkthrough.py`

Infra and backend config:

- `.github/workflows/deploy-pages.yml`: GitHub Pages deploy
- `firestore.rules`: Firestore rules for user-scoped sync
- `gcs-cors.json`: CORS policy for the hosted archive bucket

## Local Files You Should Expect

These are normal locally and should not be committed unless the user explicitly asks:

- `archive/`
- `chrome-profile-copy/`
- `shots/`
- `__pycache__/`
- generated Selenium reports
- generated preview screenshots

At the moment this repo may use a local junction:

- `archive -> C:\Users\Gurvir\Documents\EconFlow\archive`

Treat that as local environment setup, not repository content.

## Data Flow

The repo has a simple pipeline:

1. `uplearn_econ_export.py` reads the UpLearn API and writes the raw export to `archive/UpLearn Economics`.
2. `build_uplearn_site.py` reads that archive and produces `site/catalog.json`.
3. `site/app.js` loads `./catalog.json` at boot and renders the dashboard.
4. Raw lesson HTML, videos, quizzes, and papers are opened through `archiveUrl(path)`.
5. Local progress is stored in browser `localStorage` under `uplearn-econ-progress-v3`.
6. If Firebase is configured, that same progress object can sync to Firestore.

## Archive Path Rules

Archive-backed resources are resolved differently depending on origin:

- local mode on `127.0.0.1` or `localhost` uses `../archive/`
- hosted mode uses `https://storage.googleapis.com/uplearn-economics-study-dashboard-assets-260426/`

Catalog paths remain stable in both modes:

- `archive/UpLearn Economics/...`

That means the same `site/catalog.json` works locally and on GitHub Pages.

## Video Ordering Rule

Video ordering is important in this repo.

The correct ordering is not alphabetical by folder name. It must follow the UpLearn API lesson order from each subsection's `videoLessons` and `examHowToLessons` arrays.

Current behavior:

- `build_uplearn_site.py` reconstructs course order from each module's `module.json`
- local `lesson.json` files are normalized with `displayOrder` and `displayTitle`
- generated catalog entries expose `displayOrder` and `displayTitle`
- UI labels now use the API-verified format `Video N - Title`

If you touch video ordering again:

- do not sort lessons alphabetically
- do not trust folder order alone
- verify against the API or module export data

## Progress Model

The app is local-first.

The progress object includes:

- topic check state
- topic touches
- quiz scores and attempts
- flashcard schedule and ratings
- notes and note index
- exam paper checklist, marks, and timer data
- study preferences
- last opened study resource

If you change the shape:

- update `createEmptyProgress()`
- update `normalizeProgress()`
- keep old saved progress readable

## Firebase Sync

Cloud sync is optional.

Current model:

- auth mode: Email/Password
- Firestore path: `users/{uid}/progress/default`
- the app writes locally first
- sync compares `updatedAt` timestamps

If Firebase is not configured, the dashboard still works fully in local-only mode.

## GCS Hosted Archive

Hosted raw assets are served from:

- project: `uplearn-econ-dash-260426`
- bucket: `gs://uplearn-economics-study-dashboard-assets-260426`
- region: `europe-west2`
- public base URL: `https://storage.googleapis.com/uplearn-economics-study-dashboard-assets-260426/`

Useful commands:

```powershell
python build_uplearn_site.py
```

```powershell
& 'C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd' storage rsync archive gs://uplearn-economics-study-dashboard-assets-260426/archive --recursive
```

```powershell
& 'C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd' storage buckets update gs://uplearn-economics-study-dashboard-assets-260426 --cors-file=gcs-cors.json
```

## How To Run Locally

Serve the repo root, not the `site/` folder directly:

```powershell
python serve_uplearn_site.py
```

Open:

```text
http://127.0.0.1:8000/site/
```

Why this matters:

- `site/` needs access to `../archive/...`
- local video playback depends on range requests
- opening `site/index.html` directly will not behave like the real app

## Safe Change Workflow

For most feature or data changes:

1. update source code
2. rebuild `site/catalog.json` if builder logic or archive parsing changed
3. test locally through `http://127.0.0.1:8000/site/`
4. if hosted behavior depends on archive assets, decide whether GCS also needs an update
5. bump cache-busting query params in `site/index.html` when frontend bundles changed and you need Pages users to get the new JS/CSS quickly

## Good Verification Targets

Manual checks that usually matter:

- module list loads
- module accordions expand
- section-topic completion toggles work and persist
- study workspace opens the expected first resource
- video rail labels and order are correct
- quiz dialog opens and records answers
- flashcard review advances and saves
- notes save
- paper mode timer and marks work
- export/import progress works

Useful automation:

```powershell
python selenium_audit.py
```

```powershell
python full_selenium_walkthrough.py
```

## Things To Avoid

- Do not commit the raw `archive/` unless the user clearly asks.
- Do not expose UpLearn tokens, cookies, or user account data.
- Do not run a fresh live export unless the user wants it.
- Do not assume alphabetical file order matches course order.
- Do not break hosted archive paths unless you also intentionally migrate GCS content.
- Do not use destructive Git commands without explicit approval.

## Repo Facts Worth Knowing

At the time of this guide:

- primary branch: `main`
- generated catalog includes 4 modules
- generated catalog includes 1,015 videos
- visible topic video ordering has been API-checked and matched for 125 topics with videos

If those counts change after a re-export or rebuild, that may be expected. Treat the current code and generated catalog as more important than these snapshot numbers.
