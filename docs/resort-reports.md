# Morning resort check

Open **Forecast details & resort report** to see the morning check. It is a separate observation view: it does not turn reported snow into a forecast or use today's lifts to verify tomorrow's access. It remains available when model forecasts fail.

## Initial coverage

| Resort | Observations | Source |
| --- | --- | --- |
| Rusutsu | West Mt. total snow accumulation and explicitly labelled 24-hour snowfall; independently timestamped lift status | [Snow and weather](https://rusutsu.com/en/snow-and-weather-report/), [official lift data](https://rusutsu.com/assets/partial/ajax/trail-and-lift/get-front.php) |
| Madarao | Explicitly labelled 24-hour snowfall and total depth, with the source report timestamp | [Official ski page](https://www.madarao.jp/ski) |

Source fields may be blank or retain earlier-season dates outside winter. Dashes and missing/invalid numbers are **unavailable**, never zero. A genuine reported zero remains zero. Madarao's lift table describes an operating schedule, so the initial adapter does not present it as live confirmed operations. Official webcam links cover all eight curated starter resorts. They open the official page rather than embedding heavy video players.

Other catalogue resorts show unknown observations with their official report link, or the source map listing when no official site is known. Coverage should expand with verified source adapters, not inferred operating status or another mountain's report.

## Dates and freshness

Each report retains its station, source URL, report date and explicit publication timestamp. Lift status has its own timestamp because a lift update can be older or newer than the snow report. The generated file's `generatedAt` records collection time only; it never replaces a source's timestamp.

Readings are current only when dated today in Japan and less than 24 hours old. Older valid readings remain visible as **Past report**. Unknown/future timestamps suppress the reading. Current operations are marked separately from future trip access; a report for today never confirms either of the two upcoming ski mornings. Partial operation and a temporary hold remain distinct from open or closed.

Reported fresh snow is a **24-hour observation**, while model forecasts use the app's 18:00–08:00 overnight window. These values are not directly interchangeable. The observation station also need not match the selected forecast sampling height. The live snow-depth hero remains unknown because these station-specific readings are confined to the report view.

## Collection and loading

Run `npm run reports:refresh` to refresh `public/data/resort-reports.json` locally. The collector uses allowlisted official endpoints, bounded request timeouts and small retries. Snow and lift sources fail independently; failure does not borrow an old value and give it a new timestamp.

The Pages workflow collects reports into each environment's `dist/data/resort-reports.json` after compiling its own branch. The same workflow is scheduled hourly from November through May and once daily June–October. Scheduled runs execute from `main`; GitHub Actions may delay or skip schedules, and source outages may leave fields unavailable. The report timestamps remain the authority. Manual Pages deployment also refreshes reports. The workflow still checks out and builds main/staging separately, tests both and publishes one serialized artifact. The initial staging rollout tolerates a live branch that does not yet contain the collector.

The client loads the one generated file only when opening the details dropdown in live mode. Concurrent consumers share a request and cache it in memory for 15 minutes; cancellations are independent and unsuccessful requests can be retried. Winter Demo keeps its fictional observations explicitly labelled and does not download the official report file. The service worker bypasses the JSON; offline reload retains the interface and official links, without claiming to retrieve current observations.

## Favourites comparison

Favorites compares one selected ski morning across saved resorts, using the current height and snowfall threshold. It preserves save order, shows six at a time and starts at most three concurrent forecast loads. A failed resort does not block its neighbours. Switching dates, height, mode, page or view cancels obsolete work; the existing provider cache still shares payloads across both ski mornings. Threshold changes only reevaluate the loaded forecasts.

Each resort shows its snowfall range, existing Go / Maybe / Skip heuristic, and the main decision concern. The comparison uses the same missing-data and future-access rules as the dashboard. Imported official observations do not alter its verdict. Unsupported Winter Demo resorts remain unavailable until the visitor chooses live mode.
