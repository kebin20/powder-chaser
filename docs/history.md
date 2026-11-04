# Historical snow data

The history buttons open separate, lazily loaded views. They never change the current forecast or trip recommendation, and neither searching the Japan catalogue nor saving a favourite fetches historical weather for every resort.

The app has two separate history views: **Snowfall history** for seasonal fresh-snow totals and **Snow depth history** for daily snowpack comparisons. These values use different source variables and are never combined as if they were the same measurement.

## Sources stay separate

Published resort records are preferred when a verified adapter exists. The first adapter covers the existing **Niseko Grand Hirafu** selection, using [Niseko United's 2022/23 review](https://www.niseko.ne.jp/ja/news/how-much-did-it-snow-in-niseko-winter-2022-23/), [2023/24 report](https://www.niseko.ne.jp/en/news/how-much-did-it-snow-in-niseko-in-winter-2023-24/), [2024/25 report](https://www.niseko.ne.jp/en/news/2025-niseko-season-snowfall/), and [2025/26 review](https://www.niseko.ne.jp/en/news/how-much-did-it-snow-in-niseko-this-winter/). Facts were checked on 15 October 2026. The reporting locations and periods vary or are unstated. Early April reports remain **partial**, and missing years remain unavailable. These are dated, curated published facts, not a live resort-report feed. The official view does not calculate a cross-station average or fill gaps with estimates.

Other selections use **model estimates**. The visitor can also switch Grand Hirafu to a separate estimate view. The two sources never share an unlabelled chart or summary. The combined Niseko United map area remains distinct from the curated Grand Hirafu selection and does not inherit the same station records automatically.

## Estimate method

The [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api) is requested with `daily=snowfall_sum`, `models=era5`, and `timezone=Asia/Tokyo`. The service returns daily fresh snowfall in **centimetres**. ERA5 is pinned for consistency across the selected winters; its roughly 25 km grid cannot resolve every Japanese mountain or match a resort's reporting station.

Five or ten completed winters are shown, oldest to newest. Each estimate winter runs **1 November–30 April** and is selected using the Japan date. Six monthly totals and each winter total sum fresh snowfall; they are not snow depth. Only a winter with all expected daily values contributes to the full-season average, latest-complete and snowiest-winter summary. Leap days are included. Missing, duplicate, invalid or negative daily values cannot become zero. A genuinely complete zero-snow winter remains zero. Detailed selected-season, monthly and table totals retain up to one decimal place; headline summaries and chart labels remain rounded for readability.

Known curated or mapped base/upper sampling heights are sent explicitly. Unknown heights are omitted, allowing the provider's default location grid; the UI labels this **Resort area**, without claiming a measured base or upper station. ERA5 publication has a five-day delay, so early-May missing days remain visible and incomplete responses are not persisted for a week.

## Loading, cache, and failure handling

Archive requests start only after opening the history view and choosing a source/range. Complete responses are cached for **seven days**, with at most **eight payloads**, keyed by location, actual sampling height, range and latest season. Equal sampling heights share the payload while retaining the selected height label in the parsed view. A valid ten-winter payload can serve a complete five-winter subset without downloading it again; gaps inside the requested subset still require a new request. Stored payloads are validated again before use. Storage is optional, old/future timestamps expire, closing the view cancels its request, and a 25-second timeout gives a retryable error. Official records and previously cached estimates can be read offline; new estimates need a connection. The service worker caches the compiled view but does not intercept archive API traffic.

Long archive queries count as multiple weighted API calls. The [Open-Meteo pricing documentation](https://open-meteo.com/en/pricing) explains the accounting. On-demand loading and persistence avoid repeatedly downloading large ranges. The initial free endpoint is for non-commercial use under the [provider terms](https://open-meteo.com/en/terms), with the displayed Open-Meteo/ERA5 attribution. At larger traffic volumes, move reusable historical summaries to a licensed server/static dataset or commercial archive plan; do not prefetch histories for the entire catalogue from each visitor.

## Snow depth history

The **Snow depth history** view uses the hourly `snow_depth` variable from Open-Meteo's [Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api), pinned to **ERA5-Land** for the full comparison period. The provider documents this reanalysis at approximately **11 km** resolution and notes that ERA5-Land snow depth can be overestimated. A grid estimate cannot represent a specific run, piste, patrol station, drifting, or the exact local snowpack.

The chart samples the grid at **09:00 Japan time** each day from 1 November through 30 April. Metres are converted to centimetres. A mapped base/upper elevation is passed to the provider when available; unknown elevations use the provider's grid height and are labelled Resort area. Five or ten completed winters can be compared. Lines align by month and day, and a keyboard-accessible date slider shows the depth estimate for the same date across selected winters. Missing values remain chart gaps and appear as unavailable in the date readout.

This is explicitly an **estimate**, not a resort report. The currently curated Grand Hirafu resort archive publishes seasonal snowfall totals, but not a daily snow-depth series; that official dataset remains in the separate Snowfall history view and is never converted into depth. A future resort adapter should use only a dated, source-linked daily depth archive and keep its station and measurement period visible.

Depth history loads only after opening the view for the selected resort. Complete daily series are cached in this browser for seven days, with up to four compact parsed datasets. Incomplete datasets remain usable for the current view but are fetched again next time. The request is cancelled when the dialog closes and times out after 25 seconds. New data requires a connection; a previously cached complete comparison can be opened offline.

[JMA's historical CSV downloads](https://ds.data.jma.go.jp/risk/obsdl/) could support a future station-observation adapter. A nearby JMA station must retain its own name, height, distance, coverage and quality flags; it must not be presented as a resort measurement. This release does not import JMA historical station records.

## Checks

Behavioural tests cover Japan season boundaries, leap days, source separation, official partial/final facts, units/time zone, missing data, cancellation, cache limits/expiry and stale-request protection. Browser checks cover source/range selection, monthly and table views, mobile/desktop layout, focus/Escape, retry/offline states, lazy loading, favourites and catalogue filters. Snow-depth parsing additionally requires metre units, an Asia/Tokyo timestamp, and a usable 09:00 reading before a daily point is included.
