# Changelog

User-visible changes are grouped by release. Expand a release for the detailed notes.

## Unreleased

No unreleased changes recorded.

<details>
<summary><strong>0.1.8 — 2026-10-21</strong> · Test winter decisions</summary>

### Added

- Eleven Winter Demo choices in Preferences: resort examples, cold powder, light snowfall, unconfirmed access, conflicting forecasts, rain below/snow above, wind holds, closed terrain, outdated readings, missing data and connection failure. Explicit test scenarios work across the catalogue, remain clearly fictional on every screen and make no live forecast/report requests.
- Separate powder potential (Promising / Borderline / Low / Unknown) and trip-date access signals on Forecast, Favorites and Plan a trip. The overall Go / Maybe / Skip retains its access requirement; weather concerns remain visible while access is unconfirmed.
- Verified official Happo-one Kurobishi depth and separately dated Nozawa lift reports. Snowfall without a compatible 24-hour window remains unknown, and old observations never receive a new publication timestamp.

### Reliability and verification

- Saved scenarios preserve existing favourites and live-first preferences. Returning to live removes fictional values; simulated failures never fall back to real or fabricated weather.
- Stale, duplicated, incomplete and mismatched forecast windows cannot produce a promising outlook. Original report source dates and independent lift timestamps are retained.
- 209 behavioural tests pass. Browser checks cover all eleven scenarios, both heights, saved preferences, Forecast/Favorites/Plan transitions, and a clean return to live; 45 responsive accessibility screens passed across 320–1,440 px.
- See [winter testing and coverage limits](docs/winter-testing.md). Scenario testing checks app behaviour; forecast accuracy still needs compatible observations.

</details>

<details>
<summary><strong>0.1.7 — 2026-10-20</strong> · Lighter startup</summary>

### Improved

- Replace the two static WebP hero illustrations with authored SVG equivalents, reducing their combined source size from 53,450 to 2,812 bytes while keeping the 2D alpine design.
- Losslessly compact catalogue delivery at build time. The compiled catalogue is 53.5% smaller as JavaScript text and 18% smaller with consistent gzip compression; every canonical source field and all searchable resorts remain intact.
- Skip the hidden desktop sidebar on mobile and mount it when resizing into the desktop layout. Build the full search index only when a query needs it.
- Isolate React in a stable runtime chunk so app-only updates can reuse it; cold-start runtime bytes are essentially unchanged.
- Hydrate the bounded browser forecast cache once, scope storage by deployment, validate both ski mornings before persistence and retain original retrieval timestamps. Partial forecasts stay in memory only; cache failures remain nonfatal.
- Keep precached static feature files usable offline when a server varies response headers by Origin; navigation, unknown resources and live data retain their existing handling.
- Reuse Japan date/time formatters instead of repeatedly allocating them.

### Verification

- 166 behavioural tests pass, including importing the actual production catalogue and checking every source field, cache reload/scope/expiry/validation and existing forecast, history, report and service-worker cases.
- Production builds and browser checks cover responsive layout/resizing, Japanese search, favourites, SVG artwork and deferred features offline. See [startup measurements and their limits](docs/audit-0.1.7.md).

</details>

<details>
<summary><strong>0.1.6 — 2026-10-18</strong> · Compare favourites and check the mountain</summary>

### Added

- A forecast comparison in Favorites with a shared ski-morning selector, selected height/threshold, snowfall range, Go / Maybe / Skip, and the main concern for each saved resort.
- Six-resort pages with at most three concurrent loads, shared provider caching, cancellation, independent failures and failed-only retries. Saved order is retained; no catalogue-wide forecast downloads.
- A morning resort check inside the existing forecast-details dropdown, available even when a model forecast fails. Reported 24-hour snow, depth, current lift status, source timestamps and official links stay separate from overnight forecasts.
- Initial official report adapters for Rusutsu and Madarao, with webcam links. Unavailable readings stay unknown and old reports are labelled; Madarao's lift schedule is not treated as verified live access.
- Scheduled report collection during hourly winter / daily offseason Pages deployments. No extra hosted backend, account or API key is required.

### Reliability and scope

- New comparison/report UI loads on demand with failure boundaries; report data is fetched only when the dropdown opens in live mode.
- Independently dated lift and snowfall readings retain their own freshness. A current-day report never verifies a future ski morning, and reported snow uses a separate window from the overnight forecast.
- Source changes and network failures preserve unknown values rather than producing zeros or assumed operations.

### Verification

- 136 behavioural tests, TypeScript and production build pass, including bounded comparison requests, cancellation, report freshness, independent source failures and parser fixtures.
- Browser checks cover 320/390/1024/1440px, twelve automated accessibility audits, failed-only retry/reconnect races, stale/missing/future reports, lazy data requests and optional-chunk failures.

</details>

<details>
<summary><strong>0.1.5 — 2026-10-17</strong> · Reliability and smaller forecast downloads</summary>

### Improved

- Request 38 hourly forecast readings covering both overnight ski windows, instead of 72. A measured Akakura Kanko response shrank from 6,294 to 3,745 bytes with identical normalised forecast values.
- Reuse complete five-winter subsets from cached ten-winter archive responses. Sampling heights share history payloads when the underlying provider request is identical.
- Render resort-chooser result rows only while it is open.

### Fixed

- Retry failed live forecasts after the connection returns without repeated focus-based retries.
- Update the two upcoming ski dates when the app resumes after Japan midnight.
- Preserve successful network responses when service-worker cache storage fails, and use the active release's shell for offline navigation.
- Keep up to one decimal place in detailed history totals, monthly values and data tables; chart labels and headline summaries remain rounded.
- Keep dialogs open when their inner padding is clicked, retain outside-backdrop/Escape dismissal, and give them explicit accessible titles.
- Show a neutral cloud for loading, unavailable and incomplete forecasts rather than implying incoming snow.

### Verification

- 93 behavioural tests pass, including cache-storage failures, precise history totals, archive subset reuse and bounded forecast query windows.
- Production builds, responsive browser checks and accessibility checks pass. See [audit conditions and measured results](docs/audit-0.1.5.md).

</details>

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
