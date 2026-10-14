import { lazy, Suspense, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { ChartNoAxesColumn, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CloudRain, CloudSun, ExternalLink, Heart, Info, MapPin, MountainSnow, Search, SlidersHorizontal, Snowflake, Star, Thermometer, WifiOff, Wind, X } from 'lucide-react';
import { CATALOGUE_METADATA, RESORTS, RESORT_REGIONS, searchResorts } from './data/resorts';
import cloudImage from './assets/snow-cloud.webp';
import treeImage from './assets/snowy-tree.webp';
import HistoryBoundary from './components/HistoryBoundary';
import { getDemoSnapshot, hasDemoScenario } from './data/demo';
import { evaluatePowder } from './lib/decision';
import { formatJapanTime, getTripDates } from './lib/dates';
import { clearWeatherCache, fetchLiveSnapshot, WEATHER_CACHE_TTL_MS } from './lib/weather';
import type { DataMode, Elevation, PowderDecision, Resort, TripDate, WeatherSnapshot } from './types';

const SnowfallHistory = lazy(() => import('./components/SnowfallHistory'));
const BASE = import.meta.env.BASE_URL;
const storeKey = `powder-chaser:v1:${BASE}`;
type View = 'forecast' | 'favorites' | 'plan';
interface Preferences { favorites: string[]; resortId: string; elevation: Elevation; threshold: number; mode: DataMode }
const defaults: Preferences = { favorites: ['myoko', 'nozawa'], resortId: 'myoko', elevation: 'upper', threshold: 20, mode: 'demo' };
function readPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(storeKey) || '{}');
    return {
      favorites: Array.isArray(value.favorites) ? value.favorites.filter((id: unknown) => RESORTS.some(r => r.id === id)) : defaults.favorites.filter(id => RESORTS.some(r => r.id === id)),
      resortId: RESORTS.some(r => r.id === value.resortId) ? value.resortId : RESORTS.find(r => r.id === defaults.resortId)?.id || RESORTS[0].id,
      elevation: value.elevation === 'base' ? 'base' : 'upper',
      threshold: Number.isFinite(value.threshold) && value.threshold >= 5 && value.threshold <= 50 ? value.threshold : 20,
      mode: value.mode === 'live' ? 'live' : 'demo',
    };
  } catch { return { ...defaults, resortId: RESORTS.find(r => r.id === defaults.resortId)?.id || RESORTS[0].id }; }
}
function number(value: number | null, decimals = 0) { return value === null ? '—' : value.toFixed(decimals); }
function snowRange(snapshot: WeatherSnapshot) {
  if (snapshot.minCm === null || snapshot.maxCm === null) return '—';
  return snapshot.minCm === snapshot.maxCm ? number(snapshot.minCm) : `${number(snapshot.minCm)}–${number(snapshot.maxCm)}`;
}
function useSnapshot(resort: Resort, date: string, elevation: Elevation, mode: DataMode, enabled = true, refresh = 0) {
  const [routineRefresh, setRoutineRefresh] = useState(0);
  const key = `${resort.id}:${date}:${elevation}:${mode}:${refresh}:${routineRefresh}`;
  const [state, setState] = useState<{ key: string; data: WeatherSnapshot | null; error: string | null }>({ key: '', data: null, error: null });
  const demo = useMemo(() => mode === 'demo' && hasDemoScenario(resort) ? getDemoSnapshot(resort, date, elevation) : null, [resort, date, elevation, mode]);
  useEffect(() => {
    if (mode !== 'live' || !enabled) return;
    const controller = new AbortController();
    setState({ key, data: null, error: null });
    fetchLiveSnapshot(resort, date, elevation, controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ key, data, error: null });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ key, data: null, error: error instanceof Error ? error.message : 'Unable to fetch forecasts. Please try again.' });
    });
    return () => controller.abort();
  }, [key, mode, enabled, resort, date, elevation]);
  useEffect(() => {
    if (mode !== 'live' || !enabled || state.key !== key || !state.data) return;
    const retrievedAt = new Date(state.data.updatedAt).getTime();
    let requested = false;
    const checkFreshness = () => {
      if (requested || document.visibilityState === 'hidden') return;
      if (Date.now() - retrievedAt >= WEATHER_CACHE_TTL_MS) {
        requested = true;
        // Re-read through the provider cache; only explicit Refresh clears it.
        // Once this advances, the loaded-key guard blocks further checks while loading.
        setRoutineRefresh(current => current + 1);
      }
    };
    const timer = window.setInterval(checkFreshness, 60_000);
    window.addEventListener('focus', checkFreshness);
    window.addEventListener('online', checkFreshness);
    document.addEventListener('visibilitychange', checkFreshness);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', checkFreshness);
      window.removeEventListener('online', checkFreshness);
      document.removeEventListener('visibilitychange', checkFreshness);
    };
  }, [mode, enabled, key, state]);
  return { snapshot: demo || (state.key === key ? state.data : null), error: mode === 'demo' && !hasDemoScenario(resort) ? 'This resort has no fictional winter demo. Load live forecasts to see its current outlook.' : state.key === key ? state.error : null, loading: mode === 'live' && enabled && (state.key !== key || (!state.data && !state.error)) };
}
function Status({ decision }: { decision: PowderDecision }) {
  return <span className={`status ${decision.status}`}>{decision.status === 'go' && <Check size={14} aria-hidden="true" />}{decision.status.toUpperCase()}</span>;
}
function Hero({ snapshot, resort, elevation, loading }: { snapshot: WeatherSnapshot | null; resort: Resort; elevation: Elevation; loading: boolean }) {
  const [slide, setSlide] = useState(0);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const rain = snapshot && (snapshot.rainMm ?? 0) >= 2;
  const quiet = snapshot && snapshot.maxCm !== null && snapshot.maxCm <= 1;
  const label = loading ? 'Looking to the mountains' : !snapshot ? 'A fresh perspective' : snapshot.maxCm === null ? 'Forecast still unclear' : rain ? 'A mixed weather window' : quiet ? 'A quieter snow window' : 'Snow on the horizon';
  const depth = snapshot?.snowDepthCm ?? null;
  const rulerMax = Math.max(300, Math.ceil((depth ?? 0) / 100) * 100);
  return <>
    <section className="hero" aria-roledescription="carousel" aria-label="Weather and snow depth" onPointerDown={event => {
      if (event.pointerType === 'touch') touch.current = { x: event.clientX, y: event.clientY };
    }} onPointerUp={event => {
      if (!touch.current) return;
      const dx = event.clientX - touch.current.x, dy = event.clientY - touch.current.y;
      touch.current = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) setSlide(current => 1 - current);
    }} onPointerCancel={() => { touch.current = null; }}>
      {slide === 0 ? <div className="hero-slide weather-slide" role="group" aria-label="Weather, slide 1 of 2">
        <span className="hero-eyebrow">YOUR NEXT SNOW DAY</span>
        {rain ? <CloudRain className="alternate-weather" size={108} strokeWidth={1.25} aria-hidden="true" /> : quiet ? <CloudSun className="alternate-weather" size={104} strokeWidth={1.25} aria-hidden="true" /> : <img className="weather-illustration" src={cloudImage} width={480} height={371} decoding="async" fetchPriority="high" alt="" />}
        <div className="hero-caption"><h2>{label}</h2><p>{(elevation === 'upper' ? resort.upperElevationM : resort.baseElevationM) === null ? 'Resort area' : elevation === 'upper' ? 'Upper mountain' : 'Base area'} · {resort.region}</p></div>
      </div> : <div className="hero-slide depth-slide" role="group" aria-label="Total snow depth, slide 2 of 2">
        <div className="depth-scene"><img className="tree-illustration" src={treeImage} width={640} height={425} decoding="async" alt="" />
        <div className="depth-label"><span className="hero-eyebrow">TOTAL SNOW DEPTH</span><div className="depth-value">{number(depth)}<span>cm</span></div><p>{depth === null ? 'Official report needed' : snapshot?.report.fictional ? 'Illustrative resort report' : 'Resort reported'}</p></div>
        {depth !== null && <div className="ruler" aria-label={`${number(depth)} centimeters, on a scale of zero to ${rulerMax}`}><div className="ruler-fill" style={{ height: `${Math.min(depth / rulerMax * 100, 100)}%` }} />{[0, 1, 2, 3].map(tick => <span key={tick} style={{ bottom: `${tick / 3 * 100}%` }}>{Math.round(rulerMax * tick / 3)}</span>)}<i style={{ bottom: `${Math.min(depth / rulerMax * 100, 100)}%` }} /></div>}
        </div><div className="depth-footnote"><p>{depth === null ? 'Snow depth is separate from fresh powder.' : 'Total depth, not fresh snowfall.'}</p>{depth !== null && <p className="depth-location">{snapshot?.report.location}</p>}</div>
      </div>}
    </section>
    <nav className="hero-navigation" aria-label="Hero slides" onKeyDown={event => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); setSlide(current => 1 - current); }
    }}>
      <button className="icon-button hero-arrow" onClick={() => setSlide(current => 1 - current)} aria-label="Previous hero slide"><ChevronLeft size={15} /></button>
      <button className={`hero-tab ${slide === 0 ? 'active' : ''}`} aria-pressed={slide === 0} onClick={() => setSlide(0)}><i />Weather</button>
      <button className={`hero-tab ${slide === 1 ? 'active' : ''}`} aria-pressed={slide === 1} onClick={() => setSlide(1)}><i />Snow depth</button>
      <button className="icon-button hero-arrow" onClick={() => setSlide(current => 1 - current)} aria-label="Next hero slide"><ChevronRight size={15} /></button>
    </nav>
  </>;
}
function Evidence({ snapshot, resort, elevation, setElevation, decision, threshold, refresh }: { snapshot: WeatherSnapshot; resort: Resort; elevation: Elevation; setElevation: (value: Elevation) => void; decision: PowderDecision; threshold: number; refresh: () => void }) {
  const top = Math.max(30, ...snapshot.models.map(m => m.snowfallCm ?? 0));
  return <details className="evidence">
    <summary><span><Info size={15} />Forecast details & resort report</span><ChevronDown size={16} /></summary>
    <div className="evidence-content">
      <div className="elevation-switch" role="group" aria-label="Forecast elevation">{(['upper', 'base'] as const).map(value => <button key={value} aria-pressed={elevation === value} onClick={() => setElevation(value)}>{value === 'upper' ? 'Upper' : 'Base'} · {(value === 'upper' ? resort.upperElevationM : resort.baseElevationM)?.toLocaleString() ?? 'Not mapped'}{(value === 'upper' ? resort.upperElevationM : resort.baseElevationM) !== null && ' m'}</button>)}</div>
      <h3>One window. Three perspectives.</h3>
      <p className="small muted">{snapshot.window.start.slice(0, 10)} 18:00 → {snapshot.date} 08:00 JST</p>
      <div className="model-comparison">{snapshot.models.map(model => <div className="model-row" key={model.id}><a href={model.sourceUrl} target="_blank" rel="noreferrer">{model.label}<ExternalLink size={10} /></a><div className="model-track"><i style={{ width: `${Math.min((model.snowfallCm ?? 0) / top * 100, 100)}%` }} /></div><strong>{model.complete ? `${number(model.snowfallCm)} cm` : 'Unavailable'}</strong></div>)}</div>
      <p className="small muted">{decision.confidenceLabel}. The range shows model disagreement.</p>
      <div className="evidence-facts"><div><Thermometer size={15} /><span>Temperature<strong>{number(snapshot.tempC)}°C</strong></span></div><div><Wind size={15} /><span>Wind<strong>{number(snapshot.windKph)} km/h</strong></span></div><div><Snowflake size={15} /><span>Reported fresh · last 24 h<strong>{number(snapshot.reportedFreshCm)} cm</strong></span></div><div><MountainSnow size={15} /><span>Total reported depth<strong>{number(snapshot.snowDepthCm)} cm</strong></span></div></div>
      <div className="report-notes"><p><strong>Lift & terrain access</strong>{snapshot.operations.details}</p><p className="small muted">{snapshot.report.fictional ? 'Fictional resort report for this demo.' : 'Official resort snowfall and lift reports have not been imported.'} {snapshot.report.updatedAt && `Report time: ${formatJapanTime(snapshot.report.updatedAt)}.`}</p><a className="text-link" href={resort.officialReportUrl ?? resort.sourceUrl} target="_blank" rel="noreferrer">{resort.officialReportUrl ? 'Check the official resort report' : 'View resort map listing'}<ExternalLink size={13} /></a></div>
      <details className="method-details"><summary>How the recommendation works<ChevronDown size={14} /></summary><p>We compare complete overnight snowfall forecasts against your {threshold} cm minimum, then check forecast temperature, rain, wind and verified access. Missing access information keeps a promising forecast at Maybe. Confidence describes available data and model agreement; it is not a probability.</p><p>Forecasts describe snowfall potential. Terrain, tracking and local snow conditions still affect the ski experience.</p></details>
      {snapshot.warnings.length > 0 && <div className="data-notices">{snapshot.warnings.map(warning => <p key={warning}>{warning}</p>)}</div>}
      <div className="retrieval"><span>{snapshot.mode === 'demo' ? 'Illustrative forecasts' : `Retrieved ${formatJapanTime(snapshot.updatedAt)}`}</span>{snapshot.mode === 'live' && <button className="text-button" onClick={refresh}>Refresh</button>}</div>
      {snapshot.mode === 'live' && <p className="small muted">Retrieval time is not the model issue time. Model issue times are unavailable. Weather data: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>.</p>}
    </div>
  </details>;
}
function ResortList({ items, favorites, onSelect, onFavorite, selectedId, empty, listRef }: { items: Resort[]; favorites: string[]; onSelect: (id: string) => void; onFavorite: (id: string) => void; selectedId?: string; empty: string; listRef?: RefObject<HTMLDivElement | null> }) {
  const listKey = items.map(item => item.id).join(':');
  const [paging, setPaging] = useState({ key: '', limit: 24 });
  const limit = paging.key === listKey ? paging.limit : 24;
  const displayed = items.slice(0, limit);
  return <div className="resort-list" ref={listRef}>
    {displayed.length ? displayed.map(resort => <div className={`resort-row ${selectedId === resort.id ? 'selected' : ''}`} key={resort.id}>
      <button className="resort-select" onClick={() => onSelect(resort.id)}><span>{resort.name}</span><small><MapPin size={11} />{resort.region}{resort.upperElevationM !== null && ` · ${resort.upperElevationM.toLocaleString()} m`}{resort.catalogueStatus === 'unknown' && ' · Status unknown'}</small></button>
      <button className={`icon-button favorite-button ${favorites.includes(resort.id) ? 'saved' : ''}`} aria-label={`${favorites.includes(resort.id) ? 'Remove' : 'Save'} ${resort.name} ${favorites.includes(resort.id) ? 'from' : 'to'} favorites`} aria-pressed={favorites.includes(resort.id)} onClick={() => onFavorite(resort.id)}><Star size={17} fill={favorites.includes(resort.id) ? 'currentColor' : 'none'} /></button>
    </div>) : <p className="empty-copy">{empty}</p>}
    {items.length > displayed.length && <div className="catalogue-pagination"><p>{displayed.length} of {items.length} resorts</p><button className="text-button" onClick={() => setPaging({ key: listKey, limit: limit + 24 })}>Show {Math.min(24, items.length - limit)} more<ChevronDown size={14} /></button></div>}
  </div>;
}
export default function App() {
  const [preferences, setPreferences] = useState(readPreferences);
  const [view, setView] = useState<View>('forecast');
  const [dates, setDates] = useState(getTripDates);
  const [dateIndex, setDateIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('All');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [resortListOverflows, setResortListOverflows] = useState(false);
  const sidebarList = useRef<HTMLDivElement>(null);
  const settings = useRef<HTMLDialogElement>(null);
  const explorer = useRef<HTMLDialogElement>(null);
  const resort = RESORTS.find(r => r.id === preferences.resortId) || RESORTS[0];
  const date = dates[dateIndex];
  const data = useSnapshot(resort, date.date, preferences.elevation, preferences.mode, view !== 'favorites', refresh);
  const alternate = useSnapshot(resort, dates[1 - dateIndex].date, preferences.elevation, preferences.mode, view === 'plan', refresh);
  const decision = data.snapshot ? evaluatePowder(data.snapshot, preferences.threshold) : null;
  useEffect(() => { try { localStorage.setItem(storeKey, JSON.stringify(preferences)); } catch { /* Browsing remains available when storage is blocked. */ } }, [preferences]);
  useEffect(() => {
    const updateDates = () => {
      const next = getTripDates();
      if (next[0].date !== dates[0].date) { setDates(next); setDateIndex(0); }
    };
    const timer = window.setInterval(updateDates, 60_000);
    window.addEventListener('focus', updateDates);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', updateDates); };
  }, [dates]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  const patch = (value: Partial<Preferences>) => setPreferences(current => ({ ...current, ...value }));
  const toggleFavorite = (id: string) => setPreferences(current => ({ ...current, favorites: current.favorites.includes(id) ? current.favorites.filter(item => item !== id) : [...current.favorites, id] }));
  const selectResort = (id: string) => { const selected = RESORTS.find(item => item.id === id); patch({ resortId: id, ...(selected && !hasDemoScenario(selected) ? { mode: 'live' } : {}) }); setHistoryOpen(false); setView('forecast'); explorer.current?.close(); };
  const filtered = useMemo(() => searchResorts(query, region), [query, region]);
  const saved = RESORTS.filter(r => preferences.favorites.includes(r.id));
  useEffect(() => {
    const list = sidebarList.current;
    if (!list) return;
    const measure = () => setResortListOverflows(list.clientHeight > 0 && list.scrollHeight > list.clientHeight + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    measure();
    return () => observer.disconnect();
  }, [filtered.length]);
  const reload = () => { clearWeatherCache(); setRefresh(value => value + 1); };
  const filterControls = <><label className="search-field"><Search size={15} /><input placeholder="Resort name · English or 日本語" aria-label="Search resorts" value={query} onChange={event => setQuery(event.target.value)} /></label><label className="prefecture-filter"><span>Prefecture</span><select aria-label="Filter by prefecture" value={region} onChange={event => setRegion(event.target.value)}><option value="All">All Japan · {RESORTS.length}</option>{RESORT_REGIONS.map(item => <option key={item} value={item}>{item}</option>)}</select></label></>;
  const navigate = (newView: View) => { setView(newView); window.scrollTo({ top: 0 }); };
  const nav = <nav className="app-navigation" aria-label="Main navigation">{([{ id: 'forecast', label: 'Forecast', Icon: Snowflake }, { id: 'favorites', label: 'Favorites', Icon: Star }, { id: 'plan', label: 'Plan a trip', Icon: CalendarDays }] as const).map(item => <button key={item.id} className={view === item.id ? 'active' : ''} aria-current={view === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><item.Icon size={19} /><span>{item.label}</span></button>)}</nav>;
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="desktop-sidebar">
      <a className="brand" href={BASE} aria-label="Powder Chaser home"><MountainSnow size={25} strokeWidth={1.5} /><span>Powder Chaser</span></a>
      <div className="sidebar-intro"><span className="eyebrow">JAPAN, ONE SNOW DAY AT A TIME</span><h2>Follow the<br />fresh snow.</h2><p>A clearer view of your mountains.</p></div>
      {nav}
      <div className="sidebar-discover"><div className="section-heading"><h2>Find your mountain</h2><span>{RESORTS.length} resorts</span></div>{filterControls}<ResortList items={filtered} favorites={preferences.favorites} onSelect={selectResort} onFavorite={toggleFavorite} selectedId={resort.id} listRef={sidebarList} empty="No resorts match. Try another name or region." />{resortListOverflows && <p className="resort-scroll-hint"><ChevronDown size={12} aria-hidden="true" />Scroll for more resorts</p>}</div>
      <div className="sidebar-bottom"><span><MapPin size={12} />Made for Japan</span><button className="text-button" onClick={() => settings.current?.showModal()}><SlidersHorizontal size={13} />Preferences</button></div>
    </aside>
    <div className="main-column">
      <header className="mobile-header"><a className="brand" href={BASE}><MountainSnow size={22} strokeWidth={1.5} /><span>Powder Chaser</span></a><div className="header-actions">{import.meta.env.VITE_APP_ENV === 'staging' && <span className="environment-badge">STAGING</span>}<button className="icon-button settings-button" onClick={() => settings.current?.showModal()} aria-label="Open preferences"><SlidersHorizontal size={18} /></button></div></header>
      <div className="desktop-topline"><span>A little closer to powder.</span><div className="header-actions">{import.meta.env.VITE_APP_ENV === 'staging' && <span className="environment-badge">STAGING</span>}<button className="icon-button" onClick={() => settings.current?.showModal()} aria-label="Open preferences"><SlidersHorizontal size={17} /></button></div></div>
      {!online && <div className="offline-banner" role="status"><WifiOff size={14} />Offline · cached pages are available; forecasts need a connection.</div>}
      <main id="main-content" tabIndex={-1}>
      {view === 'forecast' ? <>
        <div className="forecast-heading"><div><div className="location-line"><MapPin size={11} />{resort.region}, Japan<span className={`mode-label ${preferences.mode}`}>{preferences.mode === 'demo' ? 'DEMO' : 'LIVE MODELS'}</span></div><button className="resort-heading" onClick={() => explorer.current?.showModal()} aria-label={`Choose resort, currently ${resort.name}`}><h1>{resort.name}</h1><ChevronDown size={19} /></button><a className="resort-homepage" href={resort.officialUrl ?? resort.sourceUrl} target="_blank" rel="noreferrer">{resort.officialUrl ? 'Resort website' : 'Resort map listing'}<ExternalLink size={11} aria-hidden="true" /></a></div><button className={`icon-button favorite-button ${preferences.favorites.includes(resort.id) ? 'saved' : ''}`} onClick={() => toggleFavorite(resort.id)} aria-label={`${preferences.favorites.includes(resort.id) ? 'Remove from' : 'Add to'} favorites`} aria-pressed={preferences.favorites.includes(resort.id)}><Star size={20} fill={preferences.favorites.includes(resort.id) ? 'currentColor' : 'none'} /></button></div>
        <div className="date-selector" role="group" aria-label="Ski morning">{dates.map((item, index) => <button key={item.id} className={dateIndex === index ? 'active' : ''} aria-pressed={dateIndex === index} onClick={() => setDateIndex(index)}><span>{item.label}</span><small>{item.shortLabel}</small></button>)}<span className="date-timezone">JST</span></div>
        <div className="forecast-layout"><div className="forecast-visual"><Hero snapshot={data.snapshot} resort={resort} elevation={preferences.elevation} loading={data.loading} /></div>
        <div className="forecast-summary">{data.loading ? <div className="loading-card" role="status"><Snowflake size={23} /><h2>Checking three forecasts</h2><p>For {date.shortLabel}, {(preferences.elevation === 'upper' ? resort.upperElevationM : resort.baseElevationM) === null ? 'the resort area' : `${preferences.elevation} mountain`}.</p></div> : data.error ? <div className="error-card" role="alert"><h2>Forecasts couldn’t be loaded.</h2><p>{data.error}</p><div className="error-actions"><button className="primary-button" onClick={reload}>Try again</button><button className="text-button" onClick={() => patch({ mode: preferences.mode === 'demo' ? 'live' : 'demo', ...(!hasDemoScenario(resort) && preferences.mode === 'live' ? { resortId: RESORTS[0].id } : {}) })}>{preferences.mode === 'demo' ? 'Load live forecasts' : 'Explore the demo'}</button></div></div> : data.snapshot && decision ? <>
          <section className="snowfall-card" aria-label="Overnight forecast snowfall"><div><span className="small muted">Forecast fresh snow</span><p className="snowfall-value">{snowRange(data.snapshot)}<small>cm</small></p><p className="window-label"><Snowflake size={12} />Overnight · {data.snapshot.windowLabel}</p></div><div className="snowfall-side"><span>{data.snapshot.elevationM === null ? 'RESORT AREA' : preferences.elevation === 'upper' ? 'UPPER' : 'BASE'}</span><p>{data.snapshot.elevationM === null ? 'Model grid' : `${data.snapshot.elevationM.toLocaleString()} m`}</p><span className="agreement-label">{decision.confidenceLabel}</span></div></section>
          <section className="verdict" aria-label="Trip recommendation"><div className="verdict-line"><h2>{decision.title}.</h2><Status decision={decision} /></div><p>{decision.reason}</p></section>
        </> : null}</div></div>
        <div className="history-entry"><button className="history-button" onClick={() => setHistoryOpen(true)}><ChartNoAxesColumn size={17} aria-hidden="true" /><span>Snowfall history</span><ChevronRight size={15} aria-hidden="true" /></button><span>Past winter seasons</span></div>
        {data.snapshot && decision && <Evidence snapshot={data.snapshot} resort={resort} elevation={preferences.elevation} setElevation={value => patch({ elevation: value })} decision={decision} threshold={preferences.threshold} refresh={reload} />}
        <p className="demo-note">{preferences.mode === 'demo' ? 'Illustrative winter data · for exploring the app' : 'Model forecasts · verify official mountain conditions'}</p>
      </> : view === 'favorites' ? <div className="collection-view"><span className="eyebrow">YOUR MOUNTAINS</span><h1>A personal shortlist.</h1><p className="view-intro">Keep the resorts you return to close by.</p><ResortList items={saved} favorites={preferences.favorites} onSelect={selectResort} onFavorite={toggleFavorite} empty="Your shortlist is waiting. Save a resort using its star." /><button className="primary-button browse-button" onClick={() => explorer.current?.showModal()}><Search size={15} />Find a resort</button><div className="collection-note"><Heart size={17} /><p>Your favorites stay in this browser, ready for your next snow day.</p></div></div> : <div className="plan-view"><span className="eyebrow">MAKE ROOM FOR A SNOW DAY</span><h1>Pick your powder window.</h1><p className="view-intro">Compare the next two ski mornings at <button className="inline-resort" onClick={() => explorer.current?.showModal()}>{resort.name}<ChevronDown size={13} /></button></p><div className="plan-preferences"><span>{(preferences.elevation === 'upper' ? resort.upperElevationM : resort.baseElevationM) === null ? 'Resort area' : preferences.elevation === 'upper' ? 'Upper mountain' : 'Base area'} · {preferences.threshold} cm minimum</span><button className="text-button" onClick={() => settings.current?.showModal()}>Adjust</button></div><div className="plan-grid">{dates.map((item, index) => {
          const itemData = index === dateIndex ? data : alternate;
          return <PlanCard key={item.id} date={item} snapshot={itemData.snapshot} loading={itemData.loading} error={itemData.error} threshold={preferences.threshold} onSelect={() => { setDateIndex(index); navigate('forecast'); }} />;
        })}</div><p className="demo-note">{preferences.mode === 'demo' ? 'Illustrative winter data · actual dates, fictional conditions' : 'Both windows use live forecasts. Access needs checking.'}</p><div className="plan-checklist"><h2>Before you set off</h2><a href={resort.officialReportUrl ?? resort.sourceUrl} target="_blank" rel="noreferrer"><MountainSnow size={17} /><span>Check fresh snow and lift access<small>{resort.officialReportUrl ? 'Official resort report' : 'Resort map listing · confirm with the operator'}</small></span><ExternalLink size={14} /></a><p>These cards compare snowfall potential with your preferences. Travel time and road conditions aren’t included yet.</p></div></div>}
      </main>
      <footer className="app-footer"><span><MountainSnow size={12} />Powder Chaser</span><div className="footer-links"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a><a href="https://github.com/kebin20/powder-chaser/blob/main/docs/resort-catalogue.md" target="_blank" rel="noreferrer">Resort data & credits<ExternalLink size={11} /></a></div></footer>
    </div>
    <div className="mobile-navigation">{nav}</div>
    {historyOpen && <HistoryBoundary onClose={() => setHistoryOpen(false)}><Suspense fallback={<div className="history-chunk-loading" role="status">Opening snowfall history…<button className="text-button" onClick={() => setHistoryOpen(false)}>Cancel</button></div>}><SnowfallHistory resort={resort} elevation={preferences.elevation} onClose={() => setHistoryOpen(false)} /></Suspense></HistoryBoundary>}
    <dialog className="app-dialog explorer-dialog" ref={explorer} onClick={event => { if (event.target === event.currentTarget) explorer.current?.close(); }}><div className="dialog-header"><div><span className="eyebrow">JAPAN</span><h2>Find your mountain.</h2></div><button className="icon-button" onClick={() => explorer.current?.close()} aria-label="Close resort search"><X size={20} /></button></div>{filterControls}<ResortList items={filtered} favorites={preferences.favorites} onSelect={selectResort} onFavorite={toggleFavorite} selectedId={resort.id} empty="No resorts match. Try another name or prefecture." /><p className="catalogue-note">{RESORTS.length} Japan downhill areas · source build {CATALOGUE_METADATA.sourceBuildAt.slice(0, 10)}. Map coverage and operating status can vary; verify with the resort. The winter demo covers eight starter resorts; other areas use live forecasts.</p><p className="catalogue-attribution">Data: <a href="https://openskidata.org/" target="_blank" rel="noreferrer">OpenSkiData</a> / <a href="https://openskimap.org/" target="_blank" rel="noreferrer">OpenSkiMap</a>, <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> (<a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL</a>), <a href="https://skimap.org/" target="_blank" rel="noreferrer">Skimap.org</a>, <a href="https://whosonfirst.org/docs/licenses/" target="_blank" rel="noreferrer">Who's On First</a>, <a href="https://mapterhorn.com/" target="_blank" rel="noreferrer">© Mapterhorn</a>. <a href={CATALOGUE_METADATA.downloadUrl} target="_blank" rel="noreferrer">Download catalogue</a>.</p></dialog>
    <dialog className="app-dialog settings-dialog" ref={settings} onClick={event => { if (event.target === event.currentTarget) settings.current?.close(); }}><div className="dialog-header"><div><span className="eyebrow">MAKE IT YOURS</span><h2>Your snow day.</h2></div><button className="icon-button" onClick={() => settings.current?.close()} aria-label="Close preferences"><X size={20} /></button></div>
      <fieldset className="preference-group"><legend>Forecast source</legend><label className={`source-choice ${preferences.mode === 'demo' ? 'selected' : ''}`}><input type="radio" name="source" value="demo" checked={preferences.mode === 'demo'} onChange={() => patch({ mode: 'demo' })} /><span><strong>Winter demo</strong><small>Fictional snowfall and reports for exploring the design.</small></span></label><label className={`source-choice ${preferences.mode === 'live' ? 'selected' : ''}`}><input type="radio" name="source" value="live" checked={preferences.mode === 'live'} onChange={() => patch({ mode: 'live' })} /><span><strong>Live model forecasts</strong><small>JMA, ECMWF & GFS via Open-Meteo. Official resort reports require checking.</small></span></label><p className="small muted">Yahoo, tenki.jp and Weathernews feeds aren’t connected yet. Live data requires internet access.</p></fieldset>
      <fieldset className="preference-group"><legend>Your worthwhile snowfall</legend><div className="threshold-display"><span>Minimum fresh snow</span><strong>{preferences.threshold}<small> cm</small></strong></div><label className="sr-only" htmlFor="snow-threshold">Minimum worthwhile fresh snowfall in centimeters</label><input id="snow-threshold" className="threshold-slider" type="range" min="5" max="50" step="5" value={preferences.threshold} onChange={event => patch({ threshold: Number(event.target.value) })} /><div className="range-labels"><span>5 cm · a little refresh</span><span>50 cm · deep day</span></div></fieldset>
      <fieldset className="preference-group"><legend>Mountain elevation</legend><div className="elevation-switch" role="group" aria-label="Preferred forecast elevation">{(['upper', 'base'] as const).map(value => <button key={value} aria-pressed={preferences.elevation === value} onClick={() => patch({ elevation: value })}>{value === 'upper' ? 'Upper mountain' : 'Base area'}</button>)}</div></fieldset>
      <button className="primary-button full-width" onClick={() => settings.current?.close()}>Back to the mountains<ChevronRight size={15} /></button><p className="settings-note">Preferences save automatically in this browser.</p>
    </dialog>
  </div>;
}
function PlanCard({ date, snapshot, loading, error, threshold, onSelect }: { date: TripDate; snapshot: WeatherSnapshot | null; loading: boolean; error: string | null; threshold: number; onSelect: () => void }) {
  const decision = snapshot ? evaluatePowder(snapshot, threshold) : null;
  return <button className="plan-card" onClick={onSelect}><div className="plan-card-top"><div><span className="small muted">{date.shortLabel}</span><h2>{date.label}</h2></div>{decision && <Status decision={decision} />}</div>{loading ? <p className="small muted">Checking model forecasts…</p> : error ? <p className="plan-error">Forecast unavailable. Open this date to retry.</p> : snapshot && decision ? <><div className="plan-snow">{snowRange(snapshot)}<small>cm</small><Snowflake size={24} strokeWidth={1.2} /></div><p>{decision.reason}</p></> : <p className="small muted">Select this morning to view forecasts.</p>}<div className="plan-card-footer"><span>Overnight · 18:00–08:00 JST</span><ChevronRight size={15} /></div></button>;
}
