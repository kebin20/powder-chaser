# Reliability and performance audit — 0.1.5

Checked on 17 October 2026 against the released 0.1.4 source. These are local browser checks and a small provider sample, not visitor field measurements or a guaranteed load time.

## Measured changes

| Measurement | 0.1.4 | 0.1.5 |
| --- | ---: | ---: |
| Hourly readings per shared forecast response | 72 | 38 |
| Sample provider JSON body | 6,294 B | 3,745 B |
| Initial DOM elements, including hidden controls | 996 | 750 |
| Result rows rendered inside the closed resort chooser | 24 | 0 |
| Cold-load LCP, median of three runs | 1,412 ms | 1,416 ms |
| Cumulative Layout Shift in all six runs | 0 | 0 |

The provider sample used Akakura Kanko's upper sampling height and the same three models on both queries. Explicit `start_hour` and `end_hour` retain the hourly readings needed for both ski mornings: 19:00 on the query date through 08:00 two days later, JST. The snowfall reading ending at 19:00 includes 18:00–19:00 snowfall. Every normalised snowfall, temperature, wind and rain result matched the previous response for both mornings. The response body was **40.5% smaller**, with **47.2% fewer hourly readings**; the size reduction varies with location and weather. Query support is documented by [Open-Meteo](https://open-meteo.com/en/docs/jma-api).

Cold-load checks used Chrome, a 390 × 844 viewport, fresh contexts, 150 ms latency, 160 KB/s download throughput, 4× CPU slowdown, service workers blocked, and explicit Winter Demo preferences. Three alternating runs per version gave LCP values of 1,412 / 1,412 / 1,404 ms before and 1,416 / 1,416 / 1,412 ms after. This sample demonstrates **no meaningful paint-time improvement**. Initial encoded resource bodies increased slightly, from 164,591 to 164,871 bytes, to include the reliability fixes. The closed chooser change removes 246 DOM elements, about **24.7%**, rather than reducing catalogue download size. The full catalogue still arrives in a separately cached initial data chunk.

## Reliability fixes

- Failed forecasts retry after reconnection, including when the connection returns before the pending request fails. The reconnect is consumed by the next attempt so focus events and timers do not repeatedly retry errors. Hidden pages wait until visible.
- Resuming on focus or visibility after Japan midnight updates both trip dates and resets the chosen morning to Tomorrow.
- Runtime service-worker cache open/read/write failures no longer discard successful network responses. Offline navigation uses the active release's cached shell. Installation still requires a complete offline asset set.
- Complete ten-winter archive payloads serve five-winter subsets without another download, including after reload and offline. The seven-day TTL, eight-payload limit, missing-day validation and source separation remain in place. Equal sampling heights share the provider payload while keeping the caller's height label.
- Detailed history totals, monthly values, tables and accessible chart labels retain up to one decimal place. A 0.4 cm fixture remains 0.4 cm in these views.
- Settings and resort-search dialogs have accessible titles; clicking their inner padding keeps them open, while Escape and outside-backdrop clicks still dismiss them.
- Loading, unavailable and incomplete weather states use a neutral cloud rather than a snowfall illustration.

## Verification

All **93 behavioural tests** pass, along with TypeScript checks and the production build. Coverage includes the bounded forecast query, requested-window completeness, stale-request handling, cache-storage failures, release isolation, archive subset reuse and history precision.

Automated browser checks cover forecast, snow depth/details, resort search, preferences and planning at **320, 390, 1,024 and 1,440 px**. These 20 screens had no horizontal overflow, runtime errors or automated axe WCAG A/AA violations. Additional history checks at those widths verified exact values, cache reuse, offline reopen, focus restoration and Escape. This is an automated accessibility audit, not a complete accessibility certification.

Recovery checks include repeated focus events without retries, reconnecting after an error, reconnecting during a pending failed request, reconnecting while hidden, and focus/visibility resume across Japan midnight. Visibility state was explicitly simulated for the hidden-tab scenarios. Real forecast API responses were checked separately from the deterministic browser fixtures.

## Further work

The largest remaining product gap is timestamped official resort snow and lift reports. Forecast model agreement alone cannot confirm that terrain will open. Keep missing access and report data visible until an authorised, attributable feed supplies it. For larger traffic volumes, shared server-side forecast/history caching would avoid each visitor downloading the same provider payload and allow central rate-limit handling; the current browser caches remain bounded and local.
