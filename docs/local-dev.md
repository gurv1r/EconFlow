# EconFlow Local Development

## Start the site

```powershell
python serve_uplearn_site.py
```

Then open:

```text
http://127.0.0.1:8000/site/
```

## Local archive behavior

When the hostname is `127.0.0.1` or `localhost`, EconFlow resolves archive-backed resources from:

```text
../archive/UpLearn Economics/...
```

That logic is defined in `site/js/config/env.js`.

## Validation

Run the static validation pass before pushing:

```powershell
python scripts/validate_site.py
```

This checks the committed site structure and catalog integrity without requiring the private archive export.
