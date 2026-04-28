# Deploy

## GitHub Pages

Pages is deployed from `main` through `.github/workflows/deploy-pages.yml`.

The workflow now performs a validation pass before uploading the `site/` artifact.

## Hosted archive assets

The static app is served from GitHub Pages, while archive-backed assets are served from Google Cloud Storage.

Hosted base URL:

```text
https://storage.googleapis.com/uplearn-economics-study-dashboard-assets-260426/
```

## Recommended deploy checklist

1. Run `python scripts/validate_site.py`.
2. Verify the site locally at `http://127.0.0.1:8000/site/`.
3. Push to `main`.
4. Confirm the Pages job succeeds.
5. Smoke-test one module, one quiz, one video, and one paper on the deployed site.
