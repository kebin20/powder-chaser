# Changelog

User-visible changes are grouped by release. Expand a release for the detailed notes.

## Unreleased

No unreleased changes recorded.

<details>
<summary><strong>0.1.4 — 2026-10-15</strong> · Live forecasts by default</summary>

- Start fresh visits in Live Models mode.
- Migrate the old automatically saved demo setting to live once, preserving favourites, selected resort, elevation and snowfall threshold.
- Keep Winter Demo as an explicit saved choice after the upgrade.
- Show a load error when live forecasts fail; never replace them with fictional snow automatically.

</details>

<details>
<summary><strong>0.1.3 — 2026-10-15</strong> · Japan catalogue and snowfall history</summary>

### Added

- 520 Japan downhill ski areas across 35 prefectures from the open OpenSkiData catalogue, retaining the eight original curated IDs and saved favourites.
- Search for English/Japanese names and aliases, prefecture filters, incremental list pagination, source attribution, a downloadable ODbL catalogue, and a reproducible import command.
- An on-demand Snowfall history button with five/ten winter charts, monthly estimate totals, accessible tables, source details, retry/offline states, and separate resort-record/model-estimate datasets.
- Verified Grand Hirafu historical resort records, preserving partial reports, reporting locations and missing winters.
- ERA5 estimates for other locations, using complete November–April winters and keeping missing days unavailable.

### Changed

- Newly catalogued areas use live model forecasts rather than another resort’s fictional demo.
- Unknown map elevations use the provider location grid with a clear resort-area label. Missing operator websites link to the source listing.
- History loads in a separate JavaScript chunk and caches archive data locally. Failed optional chunks leave the forecast usable. The catalogue has its own hashed chunk for independent caching. Both history chunks and the catalogue work with the existing scoped offline shell.

### Verification

- 67 behavioural tests pass, including historical aggregation, catalogue validation, cancellation/cache handling and service-worker scopes.
- Responsive and accessibility checks cover catalogue/favourites and separate official/estimated history views; a real archive request and cached offline reopen pass.

</details>

<details>
<summary><strong>0.1.2 — 2026-10-14</strong> · Lighter assets and a wider desktop view</summary>

### Changed

- Converted the static hero artwork to WebP: 252,390 → 53,450 bytes combined, a 78.8% reduction. Original PNG paths remain available for compatibility.
- Added `npm run images` to reproduce the optimised illustrations and moved the UI to Vite's content-hashed asset URLs.
- Precached all compiled assets, including deferred chunks and illustrations, with deduplicated URLs and cache-first delivery of known release assets.
- Shared one live provider response across both upcoming ski mornings for a resort and elevation. The bounded 45-minute cache is keyed by the Japan query date, and concurrent consumers cancel independently.
- Expanded the desktop dashboard with a wider main panel, a taller hero, and side-by-side forecast and planning cards.
- Increased text readability and contrast, added a keyboard skip link, labelled settings, and kept one visible main heading per view.

### Verification

- Expanded behavioral coverage to 35 tests: 29 weather/date/recommendation tests and six service-worker tests.
- Documented benchmark conditions and performance measurements in `docs/performance.md`.

</details>

<details>
<summary><strong>0.1.1 — 2026-10-14</strong> · Clearer hero and alpine identity</summary>

### Changed

- Gave the weather illustration and caption separate rows with consistent spacing inside the compact static hero.
- Reserved clear space below the snow-depth illustration for its report note.
- Added a visible official resort website link beside the resort selection area.
- Made the Go / Maybe / Skip badge larger and easier to spot.
- Introduced a simple outlined alpine mark in the header's blue across browser, Apple home-screen, standard, and maskable icons.
- Used new icon filenames to refresh browser favicons and updated the offline shell's icon precache to match.
- Added reporting of manual CI results as commit statuses for the exact tested SHA, so validated manual runs can satisfy required PR checks when an automatic run is missing.

</details>

<details>
<summary><strong>0.1.0 — 2026-10-14</strong> · First usable demo</summary>

### Added

- Calm Alpine resort dashboard with large static 2D snowfall and snow-depth illustrations; swipe, keyboard, and button carousel controls.
- Japan resort choices, two upcoming dates in JST, and base/upper elevation selection.
- Forecast snowfall range and Go / Maybe / Skip recommendation with supporting explanations.
- Expandable weather-model comparison, official resort links, and data provenance.
- Browser-saved preferences and favourite resorts.
- Clearly labelled fictional winter samples for exploring the interface.
- Live JMA MSM, ECMWF IFS, and GFS forecasts through Open-Meteo, using a common overnight reporting window.
- Missing-data handling, request cancellation, and bounded forecast cache.
- SVG/ICO/PNG browser favicon, opaque Apple touch icon, standard and maskable app icons.
- Environment-relative web app manifest and scoped static-shell service worker with build-specific cache versions.
- Public repository, main/staging workflow, CI, and paired GitHub Pages previews.
- README, contribution guide, collapsible release notes, and issue/pull-request templates.

### Current limitations

- Live official snow reports and lift/trail operations are not ingested yet; the app links to official sources and displays unknown data.
- Go recommendations require confirmed operations for the selected date, so a promising live forecast remains Maybe when access is unverified.
- The snow-depth tree graphic is an illustration, not a surveyed snow gauge.
- Model consensus and snow-quality rules have not been calibrated against resort observations.
- Yahoo Weather, tenki.jp, and Weathernews integrations remain future work subject to provider access and licensing.
- Offline mode reopens the app shell; current weather requires a network connection.

</details>
