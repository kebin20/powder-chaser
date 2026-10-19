# Startup performance audit — 0.1.7

Measured on 19 October 2026 against the released 0.1.6 source. The changes keep the catalogue, favourites, forecasts, resort checks, history and offline features. These are controlled local measurements, not visitor field data or guaranteed load times.

## Cold-load comparison

Chrome used a 390 × 844 viewport at 2× display density, fresh contexts, 150 ms network latency, 160 KB/s download throughput and 4× CPU slowdown. Service workers were blocked to expose cold transfer costs. Both builds used explicit Winter Demo preferences, so provider latency did not affect paint measurements. Three alternating runs per version produced:

| Measurement | 0.1.6 | 0.1.7 |
| --- | ---: | ---: |
| Initial encoded resource bodies, excluding HTML | 165,107 B | 134,255 B |
| Largest Contentful Paint, median | 1,496 ms | 1,376 ms |
| DOM elements on the initial mobile screen | 719 | 367 |
| Hidden desktop resort rows on mobile | 24 | 0 |
| Cumulative Layout Shift, all runs | 0 | 0 |

The sample downloaded **18.7% less initial resource data**, created **49% fewer DOM elements**, and painted its largest content **8.0% sooner**. LCP samples were 1,496 / 1,436 / 1,540 ms before and 1,376 / 1,376 / 1,384 ms after. Observed long-task blocking totals were 60 / 35 / 36 ms before and 16 / 17 / 18 ms after. Three runs are a small sample; different devices, browser caches and network conditions will change timings. Live weather can use a different illustration and adds separate provider latency, so its transfer and time savings will differ.

## Smaller delivery

| Resource | Before | After |
| --- | ---: | ---: |
| Two hero illustration source files | 53,450 B WebP | 2,812 B SVG |
| Compiled catalogue JavaScript | 254,567 B | 118,385 B |
| Catalogue gzip, consistent Node zlib settings | 43,742 B | 35,878 B |

The hero artwork uses authored static SVG paths and a soft cloud gradient, with the same alpine colours, composition and view boxes. It contains no scripts, animation, embedded bitmap or external reference. The pair is **94.7% smaller** before transfer compression and stays sharp at high display densities. The SVGs remain separate hashed assets so screens that do not need them do not import their text into the initial app bundle. Legacy bitmap files remain for compatibility and source history; the current build only references the SVGs.

Production catalogue delivery packs repeated fields into ordered rows and a prefecture dictionary. It reconstructs duplicated IDs, source URLs and elevation flags, then verifies full deep equality against every field of the canonical source before producing a build. This reduces catalogue JavaScript text by **53.5%** and gzip by **18.0%**, preserving all 519 imported records, 520 selectable areas, aliases, Japanese names, coordinates, precision, heights, source links and saved IDs. The readable licensed JSON and importer remain unchanged. Unsupported schema changes fail the build instead of silently dropping fields.

React is isolated in a stable runtime chunk. A controlled App-copy edit retained its exact hash, allowing repeat visitors to reuse roughly **68 kB compressed** runtime across app-only updates. This split does not meaningfully reduce cold runtime bytes and adds a small module-loading overhead; Vite emits module preload links. All compiled chunks and illustrations remain in the scoped offline precache.

## Less startup and cache work

- Phones do not mount the hidden desktop sidebar. Crossing the 850/851 px breakpoint mounts or removes it while retaining the search query, prefecture and results.
- Name/alias normalization for the search index happens on the first nonempty query rather than during dashboard startup. Empty-query browsing and prefecture filtering do not need that index.
- Japan date/time formatters are reused, and both upcoming dates share one calculation of today's Japan date.
- Forecast browser storage hydrates once per app load, avoiding repeated synchronous JSON reads for each uncached resort. Persistent caching already existed; this release improves its loading and validation.
- Weather storage is scoped to each deployment. Persisted entries include the exact coordinates, sampling height, selected models and Japan query day; only complete data for all three models and both ski mornings is persisted. Reloads retain the original retrieval timestamp. Invalid, expired, future-dated or incomplete entries require a fresh request. Partial forecasts remain memory-only, the 45-minute/32-entry bounds remain, and storage failures do not block forecasts.

## Verification

All **166 behavioural tests** pass, including importing the actual compiled catalogue and comparing every source field, cache hydration/reload/scope/expiry/validation, and the existing forecasts, history, reports, comparison and service-worker cases. TypeScript and production builds pass.

Browser checks cover 320, 390, 850, 851, 1,024 and 1,440 px; English/Japanese/fullwidth search; pagination; imported resort coordinates/heights/source links; saved IDs/favourites; and resizing with an active search/filter. Cache checks verify zero extra requests after a valid reload, shared data for both dates/Favorites, original retrieval times, corrupt/incomplete-data refetch and explicit Refresh.

The static hero illustrations are visually checked at mobile/desktop sizes and high display density. Accessibility and offline checks cover the main views and first opening of deferred features after installation. Service-worker scopes, home-screen icons and external API bypass remain unchanged.

A final offline check on 20 October found that `Vary: Origin` could hide installed feature files from subsequent CORS module/style requests. Cache lookup now ignores response variation only for known fixed release assets or content-hashed assets. A real-browser regression test confirms first-use offline features; navigation and unknown resources retain ordinary variant matching, and live data remains outside the worker.
