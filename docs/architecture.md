# Architecture

## Runtime model

The project still ships as a static app from `site/`, but the frontend is now split into small ES modules.

Key boundaries:

- `site/app.js`: app orchestration and feature wiring
- `site/js/config/`: constants and environment-specific URL resolution
- `site/js/services/`: archive fetching, local progress persistence, cloud config
- `site/js/ui/`: DOM lookup and shared UI-facing helpers
- `site/js/utils/`: label and text formatting helpers

## Local vs hosted

Both local development and GitHub Pages use the same UI code.

The only intentional runtime difference is archive resolution:

- `localhost` / `127.0.0.1`: resolve archive assets from `../archive/...`
- GitHub Pages: resolve archive assets from the public GCS bucket

That split now lives in `site/js/config/env.js`.

## Deployment model

GitHub Pages still deploys the `site/` directory as a static artifact.

Before upload, CI now validates:

- required static files exist
- `site/catalog.json` parses correctly
- catalog paths stay repo-relative
- derived counts match committed stats

## Future refactor seams

The next safe extractions are:

- quiz engine into `site/js/features/quizzes/`
- flashcards into `site/js/features/flashcards/`
- study workspace into `site/js/features/study/`
- auth and sync into `site/js/features/auth/`
