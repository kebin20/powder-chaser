# Powder Chaser

<img src="public/icons/icon-192.png" alt="Powder Chaser mountain and snowflake icon" width="80" height="80" />

A calmer way to choose your next powder day in Japan. Compare overnight snowfall across three weather models, see a clear **Go / Maybe / Skip** recommendation, and check the evidence when a trip is borderline.

| Environment | Preview | Source branch |
| --- | --- | --- |
| Live app | [Open Powder Chaser](https://kebin20.github.io/powder-chaser/) | [`main`](https://github.com/kebin20/powder-chaser/tree/main) |
| Staging | [Open staging demo](https://kebin20.github.io/powder-chaser/staging/) | [`staging`](https://github.com/kebin20/powder-chaser/tree/staging) |

The deployment environment and forecast mode are separate: both previews offer a clearly labelled sample mode and an optional live forecast mode. Live and staging keep separate browser preferences and favourite resorts.

## What the first version does

- Calm Alpine design with two **static 2D hero cards**: snowfall conditions and a snow-depth illustration. Swipe or use the carousel buttons; there is no animation or automatic rotation.
- Japan resort selection, two upcoming ski mornings in Japan time, and base/upper-mountain forecasts.
- Overnight snowfall range, followed by a short trip recommendation.
- Expandable model comparison, official resort links, and data limitations.
- A personal minimum-snowfall threshold and favourite resorts saved in your browser.
- Search by resort or region, save a personal shortlist, and compare the next two mornings in Plan a trip.
- Original favicon, Apple home-screen icon, web app manifest, and an offline app shell.

Initial coverage: Akakura Kanko, Kagura, Hakuba Happo-one, Nozawa Onsen, Madarao Mountain, Niseko Grand Hirafu, Rusutsu, and Furano. Coordinates and elevations are representative forecast sampling points, not exact lift or observation-station locations.

## Data: sample vs live

**Sample mode** starts with fictional winter conditions so the UI can be explored at any time of year. Forecasts, snowfall reports, snow depth, and lift operations in this mode are illustrative. Displaying them against an upcoming date does not make them a real forecast.

**Live mode** requests three explicitly selected models through [Open-Meteo](https://open-meteo.com/en/docs): JMA MSM (`jma_msm`), ECMWF IFS (`ecmwf_ifs025`), and GFS (`gfs_global`). These are model forecasts provided through one aggregator; they are not Yahoo Weather, tenki.jp, or Weathernews feeds. No API key is needed for this initial non-commercial demo. Review [Open-Meteo's terms](https://open-meteo.com/en/terms) before commercial use or larger-scale deployment.

All three models use the same resort coordinate, selected elevation, and **18:00 the previous evening to 08:00 on the selected ski morning, JST**. Hourly snowfall is summed over that window. The middle forecast is the typical estimate; the smallest and largest values show model disagreement, not a probability interval. Missing or incomplete windows remain unknown instead of becoming zero.

Live mode currently does **not** ingest official resort snow reports or lift status. It links to official resort pages and marks these values as unknown. The snow-depth hero therefore shows a report placeholder in live mode. A failed live request shows an error rather than silently substituting sample snow.

Model grids cannot resolve every slope or local snowfall effect. JMA snowfall here is Open-Meteo's derived estimate, and selecting a mountain elevation does not turn the forecast into a measured upper-slope report. Retrieval timestamps describe when the app fetched data, not the model's issue time. See the [JMA](https://open-meteo.com/en/docs/jma-api), [ECMWF](https://open-meteo.com/en/docs/ecmwf-api), and [GFS](https://open-meteo.com/en/docs/gfs-api) source documentation.

## How the recommendation works

The recommendation is a transparent starting heuristic. It considers model agreement, the chosen snowfall threshold, temperature, rain, wind, data freshness, and verified access for the ski date.

- **Go:** all three forecasts meet the threshold, agree closely enough, conditions support snow, and relevant terrain is confirmed open for the selected date.
- **Maybe:** forecasts disagree, data is incomplete or old, rain/wind could matter, or lift and terrain access is unverified.
- **Skip:** all three forecasts fall below the threshold, or relevant terrain is confirmed closed for the selected date.

Because live lift operations are not yet integrated, a promising live forecast remains **Maybe** until access can be verified. Confidence describes forecast agreement and completeness; it is not a calibrated chance of powder, an assessment of avalanche danger, or a guarantee of untracked snow. The exact rules live in [`src/lib/decision.ts`](src/lib/decision.ts).

## Run locally

Use **Node.js 24** and npm. `.nvmrc` and `.node-version` specify the development version.

```sh
git clone https://github.com/kebin20/powder-chaser.git
cd powder-chaser
npm ci
npm run dev
```

Open the local URL printed by Vite. For a production build:

```sh
npm run check
npm test
npm run build
npm run preview
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local development with fast refresh |
| `npm run check` | TypeScript validation |
| `npm test` | Forecast, dates, and recommendation tests |
| `npm run test:watch` | Re-run tests while developing |
| `npm run build` | Type-check, compile, and stamp the service worker release |
| `npm run preview` | Serve the compiled app locally |
| `npm run icons` | Regenerate PNG/ICO icons from the original SVG |

Optional build configuration is documented in [`.env.example`](.env.example):

| Variable | Local | Live build | Staging build |
| --- | --- | --- | --- |
| `VITE_BASE_PATH` | `/` | `/powder-chaser/` | `/powder-chaser/staging/` |
| `VITE_APP_ENV` | `development` | `production` | `staging` |

Vite exposes `VITE_` variables to visitors. Future licensed API credentials belong in a server, not in these values or this public repository.

## Development and previews

```text
codex/feature-name ──PR──▶ staging ──promotion PR──▶ main
                            │                         │
                       staging preview             live app
```

Create feature branches from `staging`, open pull requests into `staging`, review the staging preview, then promote `staging` to `main` with a pull request. See [CONTRIBUTING.md](CONTRIBUTING.md) for the commands and review checklist.

CI installs locked dependencies, type-checks, runs tests, and builds pull requests and pushes to either environment branch. The Pages deployment workflow checks out **main and staging separately**, validates and builds each, and publishes one artifact: main at the site root and staging under `/staging/`. A staging push always builds live from main. A failed build keeps the last successful deployment online, and deployments are serialized to avoid overwriting each other.

The workflow uses GitHub's standard token with Pages/OIDC permissions; it requires no deployment secret. GitHub Pages uses the **GitHub Actions** publishing source, and the `github-pages` environment must permit deployments triggered by both `main` and `staging`. Pull requests run CI and do not deploy. See [GitHub's Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Add to an iPhone home screen

1. Open the [live app](https://kebin20.github.io/powder-chaser/) in Chrome on your iPhone.
2. Tap **Share** beside the address bar, then **Add to Home Screen**.
3. Confirm the name and tap **Add**.

The app supplies an opaque **180 × 180 Apple touch icon**, 192/512 px web-app icons, maskable variants, and a standalone manifest. These assets use environment-relative paths, so live and staging each install with the correct URL. The staging installation is named **Powder Staging** to help distinguish it on your home screen. See [Google's Chrome iOS instructions](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DiOS&hl=en).

The service worker caches the static shell and versioned app assets, with separate caches for live and staging. It does not cache weather responses. Offline access can reopen the interface; it cannot retrieve a current forecast. Close existing app tabs and reopen after an update so a waiting service worker can activate.

## Project map

```text
src/
  App.tsx                 Resort dashboard and interactions
  main.tsx                App entry and service worker registration
  data/                   Resort catalog, sample fixtures, provider definitions
  lib/                    Japan dates, snapshots, recommendation and forecast logic
  types.ts                Shared data contracts
public/
  icons/                  Original SVG, favicon, Apple and manifest icons
  manifest.webmanifest    Home-screen app metadata
  sw.js                   Static-shell service worker
scripts/
  generate-icons.mjs      Reproducible icon generation with Sharp
  stamp-build.mjs         Release-specific offline cache identifier
.github/
  workflows/              CI and paired live/staging Pages deployment
  ISSUE_TEMPLATE/         Bug reports and feature requests
tests/                    Behavioral tests
```

## Next steps

Integrate licensed Japanese forecast feeds and timestamped resort reports, expand resort coverage, calibrate forecast accuracy against observations, and add personalised powder alerts. The initial app focuses on the visual workflow and a working model comparison.

## Changelog

<details>
<summary>0.1.0 · 14 October 2026 · First usable demo</summary>

- Static Calm Alpine illustrations and resort dashboard.
- Sample/live forecast modes with three-model comparison and explainable recommendations.
- Live and staging development workflow, documentation, favicon, and home-screen icons.

[Open the full changelog](CHANGELOG.md). Detailed releases are collapsible so this README stays easy to scan.

</details>
