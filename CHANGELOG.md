# Changelog

User-visible changes are grouped by release. Expand a release for the detailed notes.

## Unreleased

No unreleased changes recorded.

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
