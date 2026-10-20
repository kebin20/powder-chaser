# Morning resort check

Open **Forecast details & resort report** to see the morning check. It is a separate observation view: it does not turn reported snow into a forecast or use today's lifts to verify tomorrow's access. It remains available when model forecasts fail.

## Verified coverage

| Resort | Observations | Source |
| --- | --- | --- |
| Rusutsu | West Mt. total snow accumulation and explicitly labelled 24-hour snowfall; independently timestamped lift status | [Snow and weather](https://rusutsu.com/en/snow-and-weather-report/), [official lift data](https://rusutsu.com/assets/partial/ajax/trail-and-lift/get-front.php) |
| Madarao | Explicitly labelled 24-hour snowfall and total depth, with the source report timestamp | [Official ski page](https://www.madarao.jp/ski) |
| Hakuba Happo-one | Kurobishi total depth at 1,680 m, with its full-year station update; the generic `SnowFall` field has no stated window and is not presented as 24-hour snowfall | [Official winter page](https://www.happo-one.jp/en/winter/) |
| Nozawa Onsen | Independently dated lift/transport status only; snow readings remain unknown | [Official English lift status](https://en.nozawaski.com/the-mountain/moutain-info/slopes-lifts/) |

Source fields may be blank or retain earlier-season dates outside winter. Dashes and missing/invalid numbers are **unavailable**, never zero. A genuine reported zero remains zero. Madarao's lift table describes an operating schedule, so the initial adapter does not present it as live confirmed operations. Official webcam links cover all eight curated starter resorts. They open the official page rather than embedding heavy video players.

The two additional sources were verified on **21 October 2026**. Happo's Kurobishi board explicitly reported 0 cm at 07:35 JST; this is a source observation, not a statement that its ski terrain is open. The station name and height are pinned; a changed/unrecognized station fails closed. Its other station timestamps are not borrowed. Nozawa's English lift board still carried **6 May 2026, 15:54 JST** on the verification date. The app retains that old date and displays it as a past report, even though the page was fetched in October. Its explicit status symbols are interpreted using the [official lift legend](https://nozawaski.com/winter/lift_price/lift_time/); unknown symbols remain unknown, and commented retired rows are excluded.

Automatic coverage is still deliberately incomplete for the default favourites. Nozawa's snow board has only month/day timestamps, and its fresh-snow field measures yesterday 15:00 to today 08:00 rather than 24 hours. The adapter supplies neither an assumed year nor a converted snowfall total. Akakura Kanko's [official home page](https://akr-ski.com/) and [slope page](https://akr-ski.com/slope/) did not expose a dated snow board during the same check; undated lift symbols and the announced winter operating period cannot establish current conditions. Their official pages and webcam links remain available for manual checks. Winter source formats should be verified again when those boards return.

Other catalogue resorts show unknown observations with their official report link, or the source map listing when no official site is known. Coverage should expand with verified source adapters, not inferred operating status or another mountain's report.

## Dates and freshness

Each report retains its station, source URL, report date and explicit publication timestamp. Lift status has its own timestamp because a lift update can be older or newer than the snow report. The generated file's `generatedAt` records collection time only; it never replaces a source's timestamp.

Readings are current only when dated today in Japan and less than 24 hours old. Older valid readings remain visible as **Past report**. Unknown/future timestamps suppress the reading. Current operations are marked separately from future trip access; a report for today never confirms either of the two upcoming ski mornings. Partial operation and a temporary hold remain distinct from open or closed.

Reported fresh snow is a **24-hour observation**, while model forecasts use the app's 18:00–08:00 overnight window. These values are not directly interchangeable. The observation station also need not match the selected forecast sampling height. The live snow-depth hero remains unknown because these station-specific readings are confined to the report view.

## Collection and loading

Run `npm run reports:refresh` to refresh `public/data/resort-reports.json` locally. The collector uses five allowlisted official endpoints, at most three concurrent jobs, an 8-second timeout per request, a 1 MB response cap and at most two attempts. It refuses redirects; it does not follow arbitrary links or evaluate source scripts. Snow and lift sources fail independently; failure does not borrow an old value and give it a new timestamp. A malformed new source leaves existing sources available. Nozawa adds operations under its own timestamp while keeping its snow fields and snow timestamp unknown.

The Pages workflow collects reports into each environment's `dist/data/resort-reports.json` after compiling its own branch. The same workflow is scheduled hourly from November through May and once daily June–October. Scheduled runs execute from `main`; GitHub Actions may delay or skip schedules, and source outages may leave fields unavailable. The report timestamps remain the authority. Manual Pages deployment also refreshes reports. The workflow still checks out and builds main/staging separately, tests both and publishes one serialized artifact. The initial staging rollout tolerates a live branch that does not yet contain the collector.

The client loads the one generated file only when opening the details dropdown in live mode. Concurrent consumers share a request and cache it in memory for 15 minutes; cancellations are independent and unsuccessful requests can be retried. Winter Demo keeps its fictional observations explicitly labelled and does not download the official report file. The service worker bypasses the JSON; offline reload retains the interface and official links, without claiming to retrieve current observations.

## Favourites comparison

Favorites compares one selected ski morning across saved resorts, using the current height and snowfall threshold. It preserves save order, shows six at a time and starts at most three concurrent forecast loads. A failed resort does not block its neighbours. Switching dates, height, mode, page or view cancels obsolete work; the existing provider cache still shares payloads across both ski mornings. Threshold changes only reevaluate the loaded forecasts.

Each resort shows its snowfall range and Go / Maybe / Skip heuristic, with separate powder potential, its weather concern, and trip-date access. The comparison uses the same missing-data and future-access rules as the dashboard. Imported official observations do not alter its verdict. The original resort examples cover eight starter resorts. Explicit Winter Demo test scenarios apply consistently across saved catalogue resorts; unsupported original examples remain unavailable until a test scenario or live mode is chosen.
