import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from 'react';
import { ChevronDown, ExternalLink, Info, Snowflake, WifiOff, X } from 'lucide-react';
import { fetchSnowDepthHistory, type SeasonSnowDepth, type SnowDepthHistory as SnowDepthHistoryData } from '../lib/snow-depth-history';
import { hasOfficialSnowfallHistory } from '../lib/history';
import type { Elevation, Resort } from '../types';
import './SnowDepthHistory.css';

type Range = 5 | 10;
const DAY_MS = 86_400_000;
const PLOT = { width: 820, height: 315, left: 58, right: 18, top: 16, bottom: 42 };
const COLORS = ['#337ea8', '#c26a49', '#6577a5', '#348577', '#a26c9a', '#b08a35', '#477796', '#bd775b', '#657d57', '#845f83'];
const domainStart = Date.UTC(2019, 10, 1);
const domainDays = 182; // Nov 1–Apr 30, including Feb 29 for consistent alignment.
const plotWidth = PLOT.width - PLOT.left - PLOT.right;
const plotHeight = PLOT.height - PLOT.top - PLOT.bottom;

function domainIndex(date: string) {
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const year = month >= 11 ? 2019 : 2020;
  return Math.round((Date.UTC(year, month - 1, day) - domainStart) / DAY_MS);
}

function dateAt(index: number) {
  return new Date(domainStart + index * DAY_MS).toISOString().slice(0, 10);
}

function shortDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatDepth(value: number | null) {
  return value === null ? '—' : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} cm`;
}

function seriesValues(season: SeasonSnowDepth) {
  const values: (number | null)[] = Array.from({ length: domainDays }, () => null);
  for (const day of season.days) {
    const index = domainIndex(day.date);
    if (index >= 0 && index < domainDays) values[index] = day.depthCm;
  }
  return values;
}

function pathFor(values: (number | null)[], maximum: number) {
  const segments: string[] = [];
  let segment: string[] = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (segment.length) segments.push(segment.join(' '));
      segment = [];
      return;
    }
    const x = PLOT.left + index / (domainDays - 1) * plotWidth;
    const y = PLOT.top + plotHeight - value / maximum * plotHeight;
    segment.push(`${segment.length ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`);
  });
  if (segment.length) segments.push(segment.join(' '));
  return segments;
}

function HistoryChart({ seasons, selected, inspectIndex, setInspectIndex, id }: {
  seasons: SeasonSnowDepth[]; selected: string[]; inspectIndex: number; setInspectIndex: (index: number) => void; id: string;
}) {
  const series = useMemo(() => seasons.filter(season => selected.includes(season.season)).map(season => ({
    season, color: COLORS[seasons.findIndex(item => item.season === season.season) % COLORS.length], values: seriesValues(season),
  })), [seasons, selected]);
  const maximumDepth = Math.max(0, ...series.flatMap(item => item.values.filter((value): value is number => value !== null)));
  const maxAxis = Math.max(100, Math.ceil(maximumDepth / 100) * 100);
  const ticks = Array.from({ length: 5 }, (_, index) => maxAxis * (4 - index) / 4);
  const date = dateAt(inspectIndex);
  const monthTicks = [
    ['Nov', '2019-11-01'], ['Dec', '2019-12-01'], ['Jan', '2020-01-01'],
    ['Feb', '2020-02-01'], ['Mar', '2020-03-01'], ['Apr', '2020-04-01'],
  ] as const;

  function inspectPointer(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width) return;
    const chartX = (event.clientX - bounds.left) / bounds.width * PLOT.width;
    const position = Math.round((chartX - PLOT.left) / plotWidth * (domainDays - 1));
    setInspectIndex(Math.max(0, Math.min(domainDays - 1, position)));
  }

  return <>
    <div className="depth-chart-wrap">
      <svg className="depth-chart" viewBox={`0 0 ${PLOT.width} ${PLOT.height}`} role="img" aria-labelledby={`${id}-chart-title ${id}-chart-desc`} onPointerMove={inspectPointer}>
        <title id={`${id}-chart-title`}>Estimated snow depth through the winter</title>
        <desc id={`${id}-chart-desc`}>Daily 9 AM Japan time ERA5-Land snow-depth estimates in centimeters for the selected winters. Use the date slider below to inspect each date.</desc>
        {ticks.map((tick, index) => {
          const y = PLOT.top + index / 4 * plotHeight;
          return <g key={tick} className="depth-chart-grid"><line x1={PLOT.left} x2={PLOT.width - PLOT.right} y1={y} y2={y} /><text x={PLOT.left - 9} y={y + 4} textAnchor="end">{Math.round(tick)}</text></g>;
        })}
        {monthTicks.map(([label, first]) => {
          const x = PLOT.left + domainIndex(first) / (domainDays - 1) * plotWidth;
          return <g key={label} className="depth-chart-month"><line x1={x} x2={x} y1={PLOT.top} y2={PLOT.top + plotHeight} /><text x={x} y={PLOT.height - 10} textAnchor="middle">{label}</text></g>;
        })}
        <line className="depth-chart-inspection" x1={PLOT.left + inspectIndex / (domainDays - 1) * plotWidth} x2={PLOT.left + inspectIndex / (domainDays - 1) * plotWidth} y1={PLOT.top} y2={PLOT.top + plotHeight} />
        {series.map(item => <g key={item.season.season}>
          {pathFor(item.values, maxAxis).map((path, index) => <path key={index} d={path} stroke={item.color} />)}
          {item.values[inspectIndex] !== null && <circle className="depth-chart-point" cx={PLOT.left + inspectIndex / (domainDays - 1) * plotWidth} cy={PLOT.top + plotHeight - item.values[inspectIndex]! / maxAxis * plotHeight} r="4.5" fill={item.color} />}
        </g>)}
      </svg>
    </div>
    <div className="depth-chart-legend" aria-label="Selected winters">{series.map(item => <span key={item.season.season}><i style={{ background: item.color }} />{item.season.season}</span>)}</div>
    <section className="depth-inspector" aria-label="Depth on selected date">
      <div className="depth-inspector-heading"><span>Snow depth on</span><strong>{shortDate(date)}</strong></div>
      <div className="depth-inspector-values">{series.map(item => <div key={item.season.season}><span><i style={{ background: item.color }} />{item.season.season}</span><strong>{formatDepth(item.values[inspectIndex])}</strong></div>)}</div>
      <label className="depth-date-slider"><span className="sr-only">Inspect a date between November 1 and April 30</span><input type="range" min="0" max={domainDays - 1} value={inspectIndex} onChange={event => setInspectIndex(Number(event.target.value))} /><span>Nov 1</span><span>Apr 30</span></label>
    </section>
  </>;
}

export default function SnowDepthHistory({ resort, elevation, onClose }: { resort: Resort; elevation: Elevation; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const id = useId();
  const [range, setRange] = useState<Range>(5);
  const [selected, setSelected] = useState<string[]>([]);
  const [inspectIndex, setInspectIndex] = useState(75);
  const [retry, setRetry] = useState(0);
  const [online, setOnline] = useState(() => navigator.onLine);
  const key = `${resort.id}:${elevation}:${range}:${retry}`;
  const [state, setState] = useState<{ key: string; data: SnowDepthHistoryData | null; error: string | null }>({ key: '', data: null, error: null });
  const data = state.key === key ? state.data : null;
  const error = state.key === key ? state.error : null;
  const loading = !data && !error;

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
    fetchSnowDepthHistory(resort, elevation, range, controller.signal).then(result => {
      if (!controller.signal.aborted) {
        setState({ key, data: result, error: null });
        setSelected(result.seasons.slice(-3).map(season => season.season));
        setInspectIndex(75);
      }
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setState({ key, data: null, error: reason instanceof Error ? reason.message : 'Unable to load snow-depth history. Please try again.' });
    });
    return () => controller.abort();
  }, [key, resort, elevation, range]);

  const location = (elevation === 'upper' ? resort.upperElevationM : resort.baseElevationM) === null
    ? 'Resort area · mapped grid elevation'
    : `${elevation === 'upper' ? 'Upper mountain' : 'Base area'} · ${(elevation === 'upper' ? resort.upperElevationM : resort.baseElevationM)!.toLocaleString()} m`;

  function toggleSeason(season: string) {
    setSelected(current => current.includes(season)
      ? current.length > 1 ? current.filter(value => value !== season) : current
      : [...current, season]);
  }

  return <dialog ref={dialog} className="snow-depth-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={event => { event.preventDefault(); onCloseRef.current(); }} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onCloseRef.current();
  }}>
    <header className="snow-depth-header"><div><span className="snow-depth-eyebrow">YOUR MOUNTAIN THROUGH THE YEARS</span><h2 id={`${id}-title`}>Snow depth history</h2><p className="snow-depth-resort">{resort.name}</p><p className="snow-depth-location">{location}</p></div><button ref={closeButton} className="snow-depth-close" onClick={onClose} aria-label="Close snow depth history"><X size={20} aria-hidden="true" /></button></header>
    <div className="snow-depth-content">
      <p id={`${id}-description`} className="snow-depth-description">Compare the morning snowpack across past winters. Select seasons, then move across the chart to compare the same date.</p>
      <div className="snow-depth-range"><span>Completed winters</span><div role="group" aria-label="Number of winters to show">{([5, 10] as const).map(value => <button key={value} aria-pressed={range === value} onClick={() => setRange(value)}>{value} years</button>)}</div></div>
      <section className="snow-depth-source" aria-label="Historical depth data source"><div><span className="snow-depth-source-badge"><Snowflake size={12} aria-hidden="true" /> MODEL ESTIMATE</span><a href={data?.sourceUrl ?? 'https://open-meteo.com/en/docs/historical-weather-api'} target="_blank" rel="noreferrer">ERA5-Land · about 11 km grid<ExternalLink size={12} aria-hidden="true" /></a></div><p>A 09:00 JST model estimate at this location and mapped elevation. It is not a resort or piste measurement; ERA5-Land can overestimate depth.</p>{hasOfficialSnowfallHistory(resort) && <p className="snow-depth-official-note"><Info size={14} aria-hidden="true" />Published Niseko records cover seasonal snowfall totals, not daily snow depth; they remain separate in Snowfall history.</p>}</section>
      {!online && <p className="snow-depth-offline" role="status"><WifiOff size={15} aria-hidden="true" />You’re offline. Connect to load this winter comparison.</p>}
      <div className="snow-depth-results" aria-busy={loading}>
        {loading ? <div className="snow-depth-message" role="status"><Snowflake size={28} strokeWidth={1.5} aria-hidden="true" /><h3>Looking back at the snowpack</h3><p>Loading {range} winters of daily depth estimates.</p></div> : error ? <div className="snow-depth-message snow-depth-error" role="alert"><h3>Snow depth history is unavailable</h3><p>{error}</p><button onClick={() => setRetry(value => value + 1)}>Try again</button></div> : data && data.seasons.every(season => season.availableDays === 0) ? <div className="snow-depth-message" role="status"><h3>No depth values available</h3><p>This reanalysis source has no 09:00 snow-depth readings for the selected location and winters.</p></div> : data && <>
          <details className="snow-depth-season-picker"><summary><span>Choose winters</span><span className="snow-depth-selection-count">{selected.length} selected</span><ChevronDown size={15} aria-hidden="true" /></summary><div role="group" aria-label="Choose winters to compare">{data.seasons.map((season, index) => <label key={season.season}><input type="checkbox" checked={selected.includes(season.season)} disabled={selected.length === 1 && selected.includes(season.season)} onChange={() => toggleSeason(season.season)} /><i style={{ background: COLORS[index % COLORS.length] }} /><span>{season.season}</span><small>{season.availableDays}/{season.expectedDays} days</small></label>)}</div></details>
          {selected.length > 0 && <section className="snow-depth-chart-section" aria-label="Snow depth comparison"><div className="snow-depth-chart-heading"><h3>Depth through the winter</h3><span>Centimetres · 09:00 JST</span></div><p className="snow-depth-chart-caption">Each line follows estimated snow depth from November to April.</p><HistoryChart seasons={data.seasons} selected={selected} inspectIndex={inspectIndex} setInspectIndex={setInspectIndex} id={id} /></section>}
          {data.seasons.some(season => season.availableDays < season.expectedDays) && <p className="snow-depth-gap-note">Some morning values are missing. Gaps stay empty instead of being treated as zero.</p>}
        </>}
      </div>
      <details className="snow-depth-method"><summary><span>About this estimate</span><ChevronDown size={15} aria-hidden="true" /></summary><p>The chart samples Open-Meteo’s ERA5-Land reanalysis snow depth at 09:00 Japan time for each day from 1 November to 30 April. The provider’s global grid is about 11 km and uses the mapped base or upper elevation when available. It cannot resolve every slope, piste, wind drift or local snowpack change, and the provider notes that ERA5-Land may overestimate snow depth.</p><p>Historical depth shows a broad modelled pattern across past winters. It is not a forecast, an official resort report, or a measure of current piste conditions.</p>{data?.warnings.map(warning => <p key={warning}>{warning}</p>)}{data && <p>Retrieved {new Date(data.retrievedAt).toLocaleString('en-GB', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} JST. <a href={data.sourceUrl} target="_blank" rel="noreferrer">Data source & methodology<ExternalLink size={12} aria-hidden="true" /></a></p>}<p className="snow-depth-attribution">Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>.</p></details>
    </div>
  </dialog>;
}
