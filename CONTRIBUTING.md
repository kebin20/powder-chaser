# Contributing to Powder Chaser

Develop and review changes in staging before promoting them to the live app.

## Branch workflow

| Branch | Role | Preview |
| --- | --- | --- |
| `main` | Released source | [Live app](https://kebin20.github.io/powder-chaser/) |
| `staging` | Integration and review | [Staging](https://kebin20.github.io/powder-chaser/staging/) |
| `codex/<feature>` | A focused change based on staging | Local app and pull-request CI |

```sh
git fetch origin
git switch staging
git pull --ff-only origin staging
git switch -c codex/feature-name
npm ci
npm run dev
```

Keep changes focused, update `CHANGELOG.md` for user-visible work, and run:

```sh
npm run check
npm test
npm run build
```

Push the feature branch and open a pull request targeting `staging`. Include what the user sees, why it changed, and relevant validation. UI changes should include a mobile screenshot and a check at narrow widths. After merge, review the [staging preview](https://kebin20.github.io/powder-chaser/staging/) and promote through a `staging` → `main` pull request. Avoid direct pushes to environment branches during regular development.

## Forecast changes

Use the same coordinate, elevation, units, Japan timezone, and overnight window when comparing models. Preserve missing values as unknown. Keep measured resort reports separate from predictions, and include report location and timestamp when observations are integrated. Mark samples as fictional and never use sample values as a silent fallback for failed live data.

Tests should cover decision outcomes and actual data boundaries: incomplete hours, missing models, stale forecasts, date changes in Japan, and unknown or date-mismatched operations. Avoid tests that only repeat implementation details.

Document new provider terms and provenance. Licensed feeds should be accessed through an appropriate backend. Do not commit credentials; browser-exposed `VITE_` variables are public.

## UI and icons

Keep the hero static and two-dimensional. Make the snowfall summary and trip verdict easy to scan, with supporting evidence available in disclosures. Check touch targets, keyboard focus, sufficient contrast, and screen-reader labels. The snow-depth scene must distinguish an illustrative gauge from an official report.

Edit `public/icons/icon.svg` and run `npm run icons` to regenerate favicon, Apple touch, app, and maskable assets. Keep the Apple icon opaque and the maskable mark inside its safe region. Commit the generated assets alongside the source.

## Deployment changes

`.github/workflows/ci.yml` validates pushes and pull requests to main/staging. `.github/workflows/deploy.yml` validates both branch heads and uploads one Pages artifact with separate builds:

```sh
VITE_APP_ENV=production VITE_BASE_PATH=/powder-chaser/ npm run build
VITE_APP_ENV=staging VITE_BASE_PATH=/powder-chaser/staging/ npm run build
```

The build stamps `dist/sw.js` with a content digest. Workers and caches are scoped to their environment; the live worker excludes `/staging/`. Test asset, manifest, icon, and service-worker URLs for both paths after changing deployment configuration. A failed branch build prevents publishing the paired artifact and preserves the prior successful site.

GitHub Pages must publish through GitHub Actions, and its environment must allow the main and staging branches. The workflow uses standard GitHub permissions without a custom token. Pull-request checks never publish.

## Release notes

Add concise changes under **Unreleased** in `CHANGELOG.md`. At release, move them into a dated `<details>` block with an informative `<summary>`, place the newest version first, and update the short collapsible preview in `README.md`. Keep the latest headline visible while lengthy histories remain expandable.
