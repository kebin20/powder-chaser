# Performance and UI audit — 0.1.2

Measured on 14 October 2026 against the 0.1.1 build. These are controlled local measurements, not field measurements from visitors or a guarantee of real-world loading time.

## Loading measurements

The same Chrome browser and production preview were used for both versions: a 390 × 844 viewport, fresh browser contexts, 150 ms network latency, 160 KB/s download throughput, and 4× CPU slowdown. Service workers were disabled for this comparison so cached assets could not hide the cold-load cost. Each version ran three times in fictional demo mode; live provider latency is not included.

| Measurement | Before | Optimized candidate |
| --- | ---: | ---: |
| Largest Contentful Paint, median | 1,952 ms | 1,068 ms |
| Initial encoded resource bodies | 213,033 B | 117,088 B |
| Cumulative Layout Shift | 0 | 0 |
| Both hero illustration files | 252,390 B | 53,450 B |

The main improvement comes from image delivery: the two illustrations are **78.8% smaller**, and initial encoded resource transfer fell by approximately **45%**. LCP samples were 1,996 / 1,952 / 1,948 ms before and 1,196 / 1,068 / 1,068 ms after. Small style refinements and different devices, compression, network conditions, or browser caches can change these timings.

The original PNGs remain available for previously installed versions. The current app imports native-resolution WebP files from `src/assets`; Vite gives them content-hashed URLs. Run `npm run images` to regenerate them from the originals. Image dimensions are explicit, and the initial weather illustration receives high fetch priority.

## Requests and offline caching

Both trip dates use the same three-day model response. They now share one provider request and cache entry rather than downloading the response once per morning. Concurrent consumers can cancel independently; the provider request stops when all consumers leave. Cache reuse is bounded by the 45-minute TTL, selected resort/elevation, and JST query day. A manual refresh cannot be overwritten by an older pending response.

The Favorites screen does not request a hidden forecast. Existing prediction, missing-data, and recommendation rules are unchanged.

The build stamps a deduplicated list of compiled assets into the service worker. This includes both illustrations and any future deferred JavaScript chunks. Known release assets use the cache immediately after installation; live and staging keep separate caches, and weather APIs remain outside the service worker. Service-worker registration stays after page load.

## UI verification

- Responsive layouts checked from 320 to 1,440 px, including the 850/851 px desktop boundary and 768 px-high laptop windows.
- Desktop uses a wider dashboard, scrollable resort discovery, side-by-side forecast summaries on wide screens, and two-column planning cards.
- Mobile keeps the static 203 px hero. Wide desktop heroes adapt to 250 px.
- One visible page heading, labelled preferences controls, a keyboard skip link, readable supporting text, and clear resort links.
- Automated axe checks found no WCAG A/AA violations in the audited forecast, depth/details, preferences and planning screens at 390, 1,024 and 1,440 px, plus Maybe, Skip, offline and live-error states at 390 px. This is an automated check, not a complete accessibility certification.
- Behavioral weather and service-worker checks pass, including shared requests, cancellation, JST rollover, missing hours, deduplicated precaching, cache reuse, and environment isolation.

To recheck loading, build and serve the production app with `npm run build` and `npm run preview`, then apply the same network/CPU conditions in browser developer tools. Keep the initial resort, demo mode, viewport, and cache state consistent between comparisons.
