import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronDown, ExternalLink, Info, Snowflake, WifiOff, X } from 'lucide-react';
import { fetchSnowfallHistory, hasOfficialSnowfallHistory, type HistoryRange, type HistorySourceKind, type SeasonSnowfall, type SnowfallHistory as SnowfallHistoryData } from '../lib/history';
import type { Elevation, Resort } from '../types';
import './SnowfallHistory.css';

interface Props {
  resort: Resort;
  elevation: Elevation;
  onClose: () => void;
}

function centimeters(value: number | null) {
  return value === null ? '—' : Math.round(value).toLocaleString();
}

function completeSeason(season: SeasonSnowfall) {
  return season.complete && season.totalCm !== null;
}

function shortSeason(season: string) {
  const years = season.match(/^(\d{4})\D+(\d{2}|\d{4})$/);
  return years ? `${years[1].slice(-2)}/${years[2].slice(-2)}` : season;
}

function monthName(month: string) {
  const parsed = new Date(`${month}-01T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? month : parsed.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
}

function SeasonChart({ seasons, selected, onSelect, id, estimate }: { seasons: SeasonSnowfall[]; selected: string | null; onSelect: (value: string) => void; id: string; estimate: boolean }) {
  const highest = Math.max(1, ...seasons.filter(completeSeason).map(season => season.totalCm!));
  return <section className="snow-history-chart-panel" aria-labelledby={`${id}-chart-title`}>
    <div className="snow-history-section-heading"><h3 id={`${id}-chart-title`}>Snowfall by winter</h3><span>{estimate ? 'November–April · cm' : 'Published final totals · cm'}</span></div>
    <p className="snow-history-caption">Choose a winter {estimate ? 'to see its months' : 'to see its record'}. {estimate ? 'Incomplete winters' : 'Partial records and missing winters'} have no total bar.</p>
    <div className={`snow-history-chart ${seasons.length > 5 ? 'snow-history-chart-many' : ''}`} role="group" aria-label="Select a winter. Exact values are also available in the season data table.">
      {seasons.map(season => <button key={season.season} className="snow-history-season" aria-pressed={selected === season.season} aria-label={`${season.season}: ${completeSeason(season) ? `${centimeters(season.totalCm)} centimeters` : 'incomplete records'}. Show ${estimate ? 'monthly snowfall' : 'resort record'}.`} onClick={() => onSelect(season.season)}>
        <span className="snow-history-chart-value" aria-hidden="true">{completeSeason(season) ? centimeters(season.totalCm) : '—'}</span>
        <span className="snow-history-bar-space" aria-hidden="true"><span className={completeSeason(season) ? 'snow-history-bar' : 'snow-history-bar-missing'} style={{ '--snow-history-bar-height': `${completeSeason(season) ? season.totalCm! / highest * 100 : 0}%` } as CSSProperties} /></span>
        <span className="snow-history-chart-label" aria-hidden="true">{shortSeason(season.season)}</span>
      </button>)}
    </div>
  </section>;
}

function HistoryContent({ data, selected, setSelected, id }: { data: SnowfallHistoryData; selected: string | null; setSelected: (value: string) => void; id: string }) {
  const completed = data.seasons.filter(completeSeason);
  const mean = completed.length ? completed.reduce((sum, season) => sum + season.totalCm!, 0) / completed.length : null;
  const recent = completed.at(-1);
  const snowiest = completed.reduce<SeasonSnowfall | null>((best, season) => !best || season.totalCm! > best.totalCm! ? season : best, null);
  const current = data.seasons.find(season => season.season === selected) ?? data.seasons.at(-1);
  const estimate = data.sourceKind === 'estimate';
  return <>
    <section className={`snow-history-source ${estimate ? 'snow-history-source-estimate' : ''}`} aria-label="Snowfall data source">
      <div className="snow-history-source-top"><span className="snow-history-source-badge">{estimate ? 'Model estimate' : 'Resort records'}</span><a href={data.sourceUrl} target="_blank" rel="noreferrer">{data.sourceName}<ExternalLink size={13} aria-hidden="true" /></a></div>
      <p>{estimate ? 'Estimated fresh snowfall at this location. A weather model grid may miss mountain conditions; these are not measured resort totals.' : 'Fresh snowfall from published resort records. Recording periods and stations can vary between winters, so an average would be misleading. Gaps stay visible.'}</p>
      <span className="snow-history-location">{estimate ? data.elevationM === null ? 'Resort coordinates · elevation unverified' : `${data.elevation === 'upper' ? 'Upper mountain' : 'Base area'} · ${data.elevationM.toLocaleString()} m` : 'Resort reporting stations'} · {data.windowLabel}</span>
    </section>

    {data.seasons.length ? <>
      {estimate ? <div className="snow-history-stats" aria-label="Complete winter snowfall summary">
        <div><span>Winter average</span><strong>{centimeters(mean)}<small> cm</small></strong><p>{completed.length ? `${completed.length} complete ${completed.length === 1 ? 'winter' : 'winters'}` : 'No complete winters'}</p></div>
        <div><span>Latest complete</span><strong>{centimeters(recent?.totalCm ?? null)}<small> cm</small></strong><p>{recent?.season ?? 'Not available'}</p></div>
        <div><span>Snowiest winter</span><strong>{centimeters(snowiest?.totalCm ?? null)}<small> cm</small></strong><p>{snowiest?.season ?? 'Not available'}</p></div>
      </div> : <div className="snow-history-stats snow-history-stats-records" aria-label="Published resort record summary"><div><span>Latest final record</span><strong>{centimeters(recent?.totalCm ?? null)}<small> cm</small></strong><p>{recent?.season ?? 'Not available'}</p></div><div><span>Final records available</span><strong>{completed.length}<small> winters</small></strong><p>Within the selected period</p></div></div>}
      <SeasonChart seasons={data.seasons} selected={current?.season ?? null} onSelect={setSelected} id={id} estimate={estimate} />
      {current && <section className="snow-history-months" aria-labelledby={`${id}-month-title`}>
        <div className="snow-history-section-heading"><h3 id={`${id}-month-title`}>{current.season}{current.monthly.length ? ' by month' : ' resort record'}</h3><span>{completeSeason(current) ? `${centimeters(current.totalCm)} cm total` : 'Incomplete winter'}</span></div>
        {current.monthly.length ? <><div className="snow-history-month-grid">{current.monthly.map(month => <div key={month.month}><span>{monthName(month.month)}</span><strong>{month.complete ? centimeters(month.totalCm) : '—'}<small> cm</small></strong>{!month.complete && <span className="snow-history-month-gap">Missing days</span>}</div>)}</div><p className="snow-history-caption">{current.availableDays} of {current.expectedDays} days available. {completeSeason(current) ? 'The total adds fresh snowfall across these six months.' : 'Missing days prevent a reliable winter total.'}</p></> : <div className="snow-history-record">
          <p>{current.totalCm === null ? 'No verified resort record is available for this winter.' : `${centimeters(current.totalCm)} cm ${current.complete ? 'published final total' : 'partial total; not a final winter total'}.${current.reportedAt ? ` ${current.complete ? 'Published' : 'As of'} ${current.reportedAt}.` : ''}`}</p>
          {current.location && <p>Reporting location: {current.location}</p>}
          {current.notes.map(note => <p key={note}>{note}</p>)}
          <p>Monthly snowfall is not published in this imported record.</p>
          {current.sourceUrl && <a href={current.sourceUrl} target="_blank" rel="noreferrer">View this winter’s resort record<ExternalLink size={13} aria-hidden="true" /></a>}
        </div>}
      </section>}
      <details className="snow-history-table-details">
        <summary><span>View exact season data</span><ChevronDown size={16} aria-hidden="true" /></summary>
        <div className="snow-history-table-scroll"><table><caption>{estimate ? 'Winter snowfall totals in centimeters, November to April' : 'Published resort snowfall records; periods and reporting stations may differ'}</caption><thead><tr><th scope="col">Winter</th><th scope="col">Snowfall</th><th scope="col">{estimate ? 'Coverage' : 'Record'}</th></tr></thead><tbody>{data.seasons.map(season => <tr key={season.season}><th scope="row">{season.season}</th><td>{completeSeason(season) ? `${centimeters(season.totalCm)} cm` : !estimate && season.totalCm !== null ? `${centimeters(season.totalCm)} cm · partial` : 'Unavailable'}</td><td>{estimate ? `${season.availableDays}/${season.expectedDays} days` : completeSeason(season) ? 'Final' : season.reportedAt ? `As of ${season.reportedAt}` : 'Missing'}</td></tr>)}</tbody></table></div>
      </details>
    </> : <div className="snow-history-message"><Snowflake size={26} strokeWidth={1.5} aria-hidden="true" /><h3>No winter records available</h3><p>This source does not have usable snowfall history for the selected location and period.</p></div>}

    <details className="snow-history-method">
      <summary><span>About these totals & sources</span><ChevronDown size={16} aria-hidden="true" /></summary>
      <p>{estimate ? 'A model winter runs from 1 November through 30 April. Totals add new snowfall each day; they do not show snow depth on the ground. Only complete winters contribute to the average and snowiest-winter summary.' : 'Resort records retain their published recording periods and reporting locations. Partial totals are labelled and omitted from the chart. There is no resort-wide average because these records are not always directly comparable.'}</p>
      <p>Historical snowfall helps compare past winters. It does not predict powder conditions for your next trip.</p>
      {data.warnings.map(warning => <p key={warning}>{warning}</p>)}
      <p>Retrieved {new Date(data.retrievedAt).toLocaleString('en-GB', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} JST.</p>
      <a href={data.sourceUrl} target="_blank" rel="noreferrer">View the source & methodology<ExternalLink size={13} aria-hidden="true" /></a>
      {estimate && <p className="snow-history-attribution">Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>.</p>}
    </details>
  </>;
}

export default function SnowfallHistory({ resort, elevation, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const id = useId();
  const [range, setRange] = useState<HistoryRange>(5);
  const officialAvailable = hasOfficialSnowfallHistory(resort);
  const [sourceKind, setSourceKind] = useState<HistorySourceKind>(() => officialAvailable ? 'resort' : 'estimate');
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const source = officialAvailable ? sourceKind : 'estimate';
  const key = `${resort.id}:${elevation}:${range}:${source}:${retry}`;
  const [state, setState] = useState<{ key: string; data: SnowfallHistoryData | null; error: string | null }>({ key: '', data: null, error: null });
  const data = state.key === key ? state.data : null;
  const error = state.key === key ? state.error : null;
  const loading = !data && !error;
  const location = useMemo(() => `${resort.region} · ${source === 'resort' ? 'Resort records' : (elevation === 'upper' ? resort.upperElevationM : resort.baseElevationM) === null ? 'Resort area' : elevation === 'upper' ? 'Upper mountain' : 'Base area'}`, [resort.region, resort.upperElevationM, resort.baseElevationM, source, elevation]);

  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    if (element && !element.open) element.showModal();
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setState({ key, data: null, error: null });
    fetchSnowfallHistory(resort, elevation, range, controller.signal, source).then(result => {
      if (!controller.signal.aborted) { setState({ key, data: result, error: null }); setSelected(result.seasons.at(-1)?.season ?? null); }
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setState({ key, data: null, error: reason instanceof Error ? reason.message : 'Unable to load snowfall history. Please try again.' });
    });
    return () => controller.abort();
  }, [key, resort, elevation, range, source]);

  return <dialog ref={dialog} className="snow-history-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={event => { event.preventDefault(); onCloseRef.current(); }} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onCloseRef.current();
  }}>
    <header className="snow-history-header"><div><span className="snow-history-eyebrow">A LONGER VIEW OF YOUR MOUNTAIN</span><h2 id={`${id}-title`}>Snowfall history</h2><p className="snow-history-resort">{resort.name}</p><p className="snow-history-header-location">{location}</p></div><button ref={closeButton} className="snow-history-close" onClick={onClose} aria-label="Close snowfall history"><X size={20} aria-hidden="true" /></button></header>
    <div className="snow-history-content">
      <p id={`${id}-description`} className="snow-history-description"><Info size={16} aria-hidden="true" /><span>Fresh snowfall over past winters, separate from current snow depth and tomorrow’s forecast.</span></p>
      <div className="snow-history-controls"><span>Completed winters</span><div role="group" aria-label="Number of winters to show">{([5, 10] as const).map(value => <button key={value} aria-pressed={range === value} onClick={() => setRange(value)}>{value} years</button>)}</div></div>
      {officialAvailable ? <div className="snow-history-source-choice" role="group" aria-label="Snowfall history source"><button aria-pressed={source === 'resort'} onClick={() => setSourceKind('resort')}>Resort records</button><button aria-pressed={source === 'estimate'} onClick={() => setSourceKind('estimate')}>Model estimate</button></div> : <p className="snow-history-unconnected">A verified resort archive is not connected yet. Showing model estimates.</p>}
      {!online && <p className="snow-history-offline" role="status"><WifiOff size={16} aria-hidden="true" />You’re offline. Previously saved history may be available; connect to load new records.</p>}
      <div className="snow-history-results" aria-busy={loading}>
        {loading ? <div className="snow-history-message" role="status"><Snowflake size={29} strokeWidth={1.5} aria-hidden="true" /><h3>Looking back at the snow</h3><p>Loading {range} completed winters. The archive can take a moment.</p></div> : error ? <div className="snow-history-message snow-history-error" role="alert"><h3>History is unavailable</h3><p>{error}</p><button className="snow-history-retry" onClick={() => setRetry(value => value + 1)}>Try again</button></div> : data && <HistoryContent data={data} selected={selected} setSelected={setSelected} id={id} />}
      </div>
    </div>
  </dialog>;
}
