# UpLearn Economics Study Dashboard

A local study dashboard for an exported UpLearn Economics archive. The app turns the exported Year 12 and Year 13 content catalog into a searchable dashboard with module browsing, revision tracking, spaced review, weak-topic focus, and a study panel.

## What's Included

- `site/` contains the static dashboard.
- `site/catalog.json` contains the generated course catalog used by the dashboard.
- `serve_uplearn_site.py` starts a local HTTP server with range-request support for media playback.
- `launch_uplearn_site.ps1` starts the local server and opens the dashboard in Chrome.
- `build_uplearn_site.py` and `uplearn_econ_export.py` are helper scripts for rebuilding or exporting the catalog/site.
- `selenium_audit.py` and `full_selenium_walkthrough.py` are browser audit scripts used during testing.

## Local Usage

From the project root:

```powershell
python serve_uplearn_site.py
```

Then open:

```text
http://127.0.0.1:8000/site/
```

On Windows, you can also run:

```powershell
.\launch_uplearn_site.ps1
```

## GitHub Pages

This repository includes a GitHub Actions workflow that publishes the `site/` folder to GitHub Pages.

The hosted dashboard can load the static catalog and interface. Links that open raw archive files, videos, quiz source files, or local assets need the ignored `archive/` folder to be present beside the site, so those work in the local version.

To enable Pages:

1. Open the repository on GitHub.
2. Go to `Settings` -> `Pages`.
3. Set `Source` to `GitHub Actions`.
4. Push to `main` or rerun the workflow.

## Local-Only Files

The raw archive and generated scratch files are intentionally ignored by Git:

- `archive/`
- `chrome-profile-copy/`
- `shots/`
- `__pycache__/`
- generated audit reports
- generated preview screenshots

This keeps the GitHub repository focused on the dashboard source and generated catalog rather than the full exported course dump.
