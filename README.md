# Powder Chaser

<img src="public/icons/icon-alpine-192.png" alt="Powder Chaser outlined alpine mountain icon" width="80" height="80" />

A calmer way to choose your next powder day in Japan. Compare overnight snowfall across three weather models, see a clear **Go / Maybe / Skip** recommendation, and check the evidence when a trip is borderline.

| Environment | Preview | Source branch |
| --- | --- | --- |
| Live app | [Open Powder Chaser](https://kebin20.github.io/powder-chaser/) | [`main`](https://github.com/kebin20/powder-chaser/tree/main) |
| Staging | [Open staging demo](https://kebin20.github.io/powder-chaser/staging/) | [`staging`](https://github.com/kebin20/powder-chaser/tree/staging) |

The deployment environment and forecast mode are separate: both previews offer a clearly labelled sample mode and an optional live forecast mode. Live and staging keep separate browser preferences and favourite resorts.

## Features

- Calm Alpine design with two **static 2D hero cards**: snowfall conditions and a snow-depth illustration. Swipe or use the carousel buttons; there is no animation or automatic rotation.
- Japan resort selection, two upcoming ski mornings in Japan time, and base/upper-mountain forecasts.
- Overnight snowfall range, followed by a short trip recommendation.
- Expandable model comparison, official resort links, and data limitations.
- A personal minimum-snowfall threshold and favourite resorts saved in your browser.
- A searchable Japan catalogue of 520 downhill areas across 35 prefectures, with English/Japanese names, aliases, and prefecture filters.
- An on-demand snowfall-history view: published Grand Hirafu records where verified, and clearly labelled ERA5 estimates elsewhere, with five/ten winter charts and source details.
- Search by resort or region, save a personal shortlist, and compare the next two mornings in Plan a trip.
- Outlined alpine favicon, Apple home-screen icon, web app manifest, and an offline app shell.
- A wider desktop dashboard with the hero and forecast summary alongside each other, while phones retain the compact layout.

The eight curated starter resorts are Akakura Kanko, Kagura, Hakuba Happo-one, Nozawa Onsen, Madarao Mountain, Niseko Grand Hirafu, Rusutsu, and Furano. The full searchable catalogue contains 520 Japan downhill areas. Coordinates and elevations are representative forecast sampling points or mapped estimates, not exact lift or observation-station locations.

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
| `npm test` | Forecast, history, catalogue, recommendation, and service-worker tests |
| `npm run test:watch` | Re-run tests while developing |
| `npm run build` | Type-check, compile, and stamp the service worker release |
| `npm run preview` | Serve the compiled app locally |
| `npm run icons` | Regenerate PNG/ICO icons from the original SVG |
| `npm run images` | Reproduce the optimised WebP hero assets from the original PNGs |
| `npm run catalogue:import` | Refresh the licensed Japan ski-area catalogue from OpenSkiData |

Optional build configuration is documented in [`.env.example`](.env.example):

| Variable | Local | Live build | Staging build |
| --- | --- | --- | --- |
| `VITE_BASE_PATH` | `/` | `/powder-chaser/` | `/powder-chaser/staging/` |
| `VITE_APP_ENV` | `development` | `production` | `staging` |

Vite exposes `VITE_` variables to visitors. Future licensed API credentials belong in a server, not in these values or this public repository.

## Performance and layout

The two static hero illustrations use **53,450 bytes combined**, down from **252,390 bytes** for the original PNGs: **78.8% smaller**. Vite publishes the WebP images with content hashes. The original PNGs remain as reproducible sources and for compatibility with earlier versions; the current UI loads the WebP assets.

The build records every compiled asset for the service worker, including images and any deferred chunks, and deduplicates entry-point URLs before precaching. Known assets in the current release are served from the cache first. Live and staging keep separate offline caches, and the worker bypasses external weather requests.

Live forecasting shares one three-day provider response across both upcoming ski mornings for the same resort, elevation, and Japan query date. The **45-minute cache** holds at most **32 responses** and does not reuse a previous Japan query day's entry after midnight. Concurrent views share a request; cancelling one view does not cancel another view's forecast.

Desktop screens use a wider main panel with larger text, a taller hero, and side-by-side forecast and planning cards. Mobile keeps its compact hero and bottom navigation. Keyboard users can skip to the main content; settings are labelled, and each view has one visible main heading.

The catalogue has its own content-hashed data chunk for independent caching across UI updates; it is still part of the initial download. The history view is a separate JavaScript chunk and only requests archive data after it is opened. Catalogue lists show 24 rows at a time and search the full local dataset. See the [0.1.2 performance audit](docs/performance.md) for its benchmark conditions and results; the expanded catalogue and history feature were added after that benchmark. Asset sizes describe downloaded files, not a guaranteed page-load time on every connection.

## Development and previews

```text
codex/feature-name ──PR──▶ staging ──promotion PR──▶ main
                            │                         │
                       staging preview             live app
```

Create feature branches from `staging`, open pull requests into `staging`, review the staging preview, then promote `staging` to `main` with a pull request. See [CONTRIBUTING.md](CONTRIBUTING.md) for the commands and review checklist.

CI installs locked dependencies, type-checks, runs tests, and builds pull requests and pushes to either environment branch. The Pages deployment workflow checks out **main and staging separately**, validates and builds each, and publishes one artifact: main at the site root and staging under `/staging/`. A staging push always builds live from main. A failed build keeps the last successful deployment online, and deployments are serialized to avoid overwriting each other.

The workflow uses GitHub's standard token with Pages/OIDC permissions; it requires no deployment secret. GitHub Pages uses the **GitHub Actions** publishing source, and the `github-pages` environment must permit deployments triggered by both `main` and `staging`. Pull requests run CI and do not deploy. See [GitHub's Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Both branches must exist before the first deployment. If a bootstrap push does not create a run, open **Actions → Deploy live and staging → Run workflow** on `main`. This publishes the same paired artifact as an automatic deployment.

If a pull request's CI run is missing, open **Actions → CI → Run workflow** and select that pull request's **head branch**. After validation completes, the manual result reporter publishes its actual success or failure as a `validate` commit status for the tested SHA, linking to the run's logs. GitHub does not evaluate manual workflow job checks for PR branch protection, so this status carries the verified outcome; see [GitHub's required-check documentation](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks). A new commit needs a new run. If a manual run fails, rerun manual CI after resolving the failure so its status is updated.

## Add to an iPhone home screen

1. Open the [live app](https://kebin20.github.io/powder-chaser/) in Chrome on your iPhone.
2. Tap **Share** beside the address bar, then **Add to Home Screen**.
3. Confirm the name and tap **Add**.

The app supplies an opaque **180 × 180 Apple touch icon**, 192/512 px web-app icons, maskable variants, and a standalone manifest. These assets use environment-relative paths, so live and staging each install with the correct URL. The staging installation is named **Powder Staging** to help distinguish it on your home screen. See [Google's Chrome iOS instructions](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DiOS&hl=en).

The service worker precaches the static shell and compiled app assets, with separate caches for live and staging. It serves known release assets from the cache first and does not cache weather responses. Offline access can reopen the interface; it cannot retrieve a current forecast. Close existing app tabs and reopen after an update so a waiting service worker can activate.

## Project map

```text
src/
  App.tsx                 Resort dashboard and interactions
  main.tsx                App entry and service worker registration
  data/                   Licensed Japan catalogue, curated resorts, sample fixtures
  components/             Lazy historical snowfall dialog and charts
  assets/                 Optimised WebP hero illustrations
  lib/                    Japan dates, snapshots, recommendation and forecast logic
  types.ts                Shared data contracts
public/
  icons/                  Original SVG, favicon, Apple and manifest icons
  manifest.webmanifest    Home-screen app metadata
  sw.js                   Static-shell service worker
scripts/
  generate-icons.mjs      Reproducible icon generation with Sharp
  optimize-images.mjs     Reproducible WebP generation from original hero PNGs
  stamp-build.mjs         Release-specific offline cache identifier
  import-japan-resorts.mjs Reproducible licensed catalogue import
docs/
  performance.md          Earlier performance benchmark conditions and results
  resort-catalogue.md      Catalogue coverage, sources, licence and import
  history.md              Resort records, estimate method and cache behaviour
.github/
  workflows/              CI and paired live/staging Pages deployment
  ISSUE_TEMPLATE/         Bug reports and feature requests
tests/                    Behavioral tests
```

## Resort catalogue and snowfall history

Use **Find a resort**, search in English or Japanese, or filter by prefecture. Tap the star to add an area to **Favorites**. The catalogue includes all named Japan downhill areas available in the selected OpenSkiData snapshot, plus a separate Grand Hirafu sampling location. It is not a guarantee that every operating ski resort is mapped. Closed/planned areas are excluded where the source identifies them; six retained areas have unknown catalogue operating status. A mapped status does not confirm lift access on a trip date. See [catalogue coverage, provenance, and licensing](docs/resort-catalogue.md).

The existing eight curated IDs are retained, so saved favourites survive the expansion. Favourites are stored on this browser; there is no account or cross-device synchronisation. New areas use live forecasts rather than inheriting a fictional resort report. Missing terrain heights use the provider’s default location grid and are labelled **Resort area**. Missing official websites link to the source map listing.

**Snowfall history** opens a separate dialog without adding a chart to the main dashboard. Resort records and model estimates are separate datasets. Verified Grand Hirafu records retain their published dates, station locations, partial totals, and missing years; partial reports do not become final winter bars. Other resorts use Open-Meteo’s historical ERA5 snowfall estimates. The estimate chart adds daily fresh snowfall over complete **1 November–30 April** winters, shows monthly totals, and offers five/ten winters. Missing days remain unavailable. Historical snowfall is not snow depth or a prediction of the next trip. See [history data and methodology](docs/history.md).

## Next steps

Integrate licensed Japanese forecast feeds and timestamped resort reports, improve catalogue coverage and official historical records, calibrate forecast accuracy against observations, and add personalised powder alerts. The initial app focuses on the visual workflow and a working model comparison.

## Changelog

<details>
<summary>0.1.3 · 15 October 2026 · Japan catalogue and snowfall history</summary>

- Search 520 Japan downhill areas by English/Japanese name or prefecture and save favourites.
- Open five/ten winter history charts with separate resort-record and model-estimate views.
- Lazy history loading, paginated resort lists, and explicit handling of missing map metadata.

[Open the full changelog](CHANGELOG.md). Detailed releases are collapsible so this README stays easy to scan.

</details>
