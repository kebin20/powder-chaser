import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, MapPin, RefreshCw, Star } from 'lucide-react';
import { DEMO_SCENARIOS, hasDemoScenario, type DemoScenarioId } from '../data/demo';
import DecisionSignals from './DecisionSignals';
import { COMPARISON_PAGE_SIZE, runComparisonBatch } from '../lib/comparison';
import { evaluatePowder } from '../lib/decision';
import { getWeatherSnapshot, WEATHER_CACHE_TTL_MS } from '../lib/weather';
import type { DataMode, Elevation, Resort, TripDate, WeatherSnapshot } from '../types';
import './FavoritesComparison.css';

interface Props {
  /** Saved order, rather than catalogue or forecast order. */
  resorts: Resort[];
  date: TripDate;
  elevation: Elevation;
  mode: DataMode;
  demoScenario: DemoScenarioId;
  threshold: number;
  onSelect: (id: string) => void;
  onFavorite: (id: string) => void;
  decorateSnapshot?: (snapshot: WeatherSnapshot, resort: Resort) => WeatherSnapshot;
}
type Entry = { status: 'loading' } | { status: 'unavailable' } | { status: 'error'; message: string } | { status: 'ready'; snapshot: WeatherSnapshot };
type Entries = Record<string, Entry>;
const snowNumber = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });

function range(snapshot: WeatherSnapshot) {
  if (snapshot.minCm === null || snapshot.maxCm === null) return 'Unavailable';
  const minimum = snowNumber.format(snapshot.minCm), maximum = snowNumber.format(snapshot.maxCm);
  return `${minimum === maximum ? minimum : `${minimum}–${maximum}`} cm`;
}

/** Only mounted on the Favorites screen; the current six resorts share the provider cache. */
export default function FavoritesComparison({ resorts, date, elevation, mode, demoScenario, threshold, onSelect, onFavorite, decorateSnapshot }: Props) {
  const savedIds = resorts.map(resort => resort.id).join(':');
  const [paging, setPaging] = useState({ key: '', page: 0 });
  const page = paging.key === savedIds ? Math.min(paging.page, Math.max(0, Math.ceil(resorts.length / COMPARISON_PAGE_SIZE) - 1)) : 0;
  // Catalogue metadata is immutable; keep this page stable when only callbacks change.
  const visible = useMemo(() => resorts.slice(page * COMPARISON_PAGE_SIZE, (page + 1) * COMPARISON_PAGE_SIZE), [savedIds, page]);
  const key = `${date.date}:${elevation}:${mode}:${mode === 'demo' ? demoScenario : ''}:${visible.map(resort => resort.id).join(':')}`;
  const [attempt, setAttempt] = useState({ id: 0, errorsOnly: false });
  const [state, setState] = useState<{ key: string; entries: Entries }>({ key: '', entries: {} });
  const latest = useRef(state);
  const reconnectGeneration = useRef(0);
  const generationAtAttemptStart = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    generationAtAttemptStart.current = reconnectGeneration.current;
    const previous = latest.current.key === key ? latest.current.entries : {};
    const entries: Entries = Object.fromEntries(visible.map(resort => [resort.id,
      mode === 'demo' && !hasDemoScenario(resort, demoScenario) ? { status: 'unavailable' }
        : attempt.errorsOnly && previous[resort.id]?.status === 'ready' ? previous[resort.id] : { status: 'loading' },
    ]));
    latest.current = { key, entries };
    setState(latest.current);
    const pending = visible.filter(resort => entries[resort.id].status === 'loading');
    void runComparisonBatch(pending,
      (resort, signal) => getWeatherSnapshot(resort, date.date, elevation, mode, signal, demoScenario),
      (resort, result) => {
        if (controller.signal.aborted) return;
        const entry: Entry = result.data ? { status: 'ready', snapshot: result.data }
          : { status: 'error', message: result.error instanceof Error ? result.error.message : 'Forecasts could not be loaded. Check your connection and retry.' };
        latest.current = { key, entries: { ...latest.current.entries, [resort.id]: entry } };
        setState(latest.current);
      }, controller.signal);
    return () => controller.abort();
  }, [key, attempt, visible, date.date, elevation, mode, demoScenario]);

  useEffect(() => {
    if (mode !== 'live') return;
    let requested = false;
    const check = () => {
      if (requested || state.key !== key || document.visibilityState === 'hidden' || !navigator.onLine) return;
      const entries = Object.values(state.entries);
      // Finish the visible batch before retrying failures, preserving siblings
      // that were already downloading when the connection returned.
      const recovered = !entries.some(entry => entry.status === 'loading') && entries.some(entry => entry.status === 'error')
        && reconnectGeneration.current > generationAtAttemptStart.current;
      const stale = entries.some(entry => entry.status === 'ready' && Date.now() - new Date(entry.snapshot.updatedAt).getTime() >= WEATHER_CACHE_TTL_MS);
      if (recovered || stale) {
        requested = true;
        setAttempt(current => ({ id: current.id + 1, errorsOnly: !stale }));
      }
    };
    const reconnect = () => { reconnectGeneration.current += 1; check(); };
    check();
    const timer = window.setInterval(check, 60_000);
    window.addEventListener('online', reconnect);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', reconnect);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [key, mode, state]);

  if (!resorts.length) return <p className="comparison-empty">Save a mountain to compare its next snow window here.</p>;
  const entries = state.key === key ? state.entries : {};
  const loading = visible.some(resort => !entries[resort.id] || entries[resort.id].status === 'loading');
  const first = page * COMPARISON_PAGE_SIZE + 1, last = Math.min((page + 1) * COMPARISON_PAGE_SIZE, resorts.length);
  const retry = () => setAttempt(current => ({ id: current.id + 1, errorsOnly: true }));
  const setPage = (next: number) => { setPaging({ key: savedIds, page: next }); };

  return <div className="favorites-comparison">
    <p className="comparison-context">{mode === 'demo' ? `Fictional test · ${DEMO_SCENARIOS.find(scenario => scenario.id === demoScenario)?.label}` : 'Live model forecasts'} · {elevation === 'upper' ? 'Upper mountain' : 'Base area'} · {threshold} cm minimum</p>
    <p className="sr-only" role="status">{loading ? `Checking forecasts for ${visible.length} saved resorts.` : `Forecast comparison ready for ${date.shortLabel}.`}</p>
    <div className="comparison-grid" aria-label={`Saved resort forecasts for ${date.shortLabel}`}>
      {visible.map(resort => {
        const entry = entries[resort.id] ?? { status: 'loading' };
        const snapshot = entry.status === 'ready' ? decorateSnapshot?.(entry.snapshot, resort) ?? entry.snapshot : null;
        const decision = snapshot ? evaluatePowder(snapshot, threshold) : null;
        const height = elevation === 'upper' ? resort.upperElevationM : resort.baseElevationM;
        return <article className="comparison-card" key={resort.id} aria-label={resort.name}>
          <div className="comparison-card-heading">
            <button className="comparison-resort" onClick={() => onSelect(resort.id)} aria-label={`View forecast for ${resort.name}`}><span>{resort.name}</span><small><MapPin size={11} aria-hidden="true" />{resort.region} · {height === null ? 'Resort area' : `${height.toLocaleString()} m`}</small></button>
            <button className="comparison-remove icon-button favorite-button saved" onClick={() => onFavorite(resort.id)} aria-label={`Remove ${resort.name} from favorites`}><Star size={17} fill="currentColor" aria-hidden="true" /></button>
          </div>
          {snapshot && decision ? <>
            <div className="comparison-summary"><p className="comparison-snow">{range(snapshot)}</p><span className={`comparison-verdict ${decision.status}`}>{decision.status === 'go' && <Check size={12} aria-hidden="true" />}{decision.status.toUpperCase()}</span></div>
            <p className="comparison-window">Overnight · 18:00–08:00 JST</p>
            <DecisionSignals decision={decision} compact />
          </> : entry.status === 'unavailable' ? <div className="comparison-message"><p>No resort example for this mountain.</p><small>Choose a Winter Demo test scenario or live forecasts in Preferences.</small></div>
            : entry.status === 'error' ? <div className="comparison-message comparison-error"><p>Forecast unavailable.</p><small>{entry.message}</small><button className="comparison-retry text-button" onClick={retry} aria-label={`Retry forecasts for ${resort.name}`}><RefreshCw size={12} aria-hidden="true" />Retry failed forecasts</button></div>
              : <div className="comparison-message"><p>Checking three forecasts…</p><small>For {date.shortLabel}, {height === null ? 'the resort area' : `${elevation} mountain`}.</small></div>}
        </article>;
      })}
    </div>
    {resorts.length > COMPARISON_PAGE_SIZE && <nav className="comparison-pagination" aria-label="Saved resort comparison pages"><button className="comparison-page-button" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous saved resorts"><ChevronLeft size={16} aria-hidden="true" /></button><span>{first}–{last} of {resorts.length} saved resorts</span><button className="comparison-page-button" disabled={last === resorts.length} onClick={() => setPage(page + 1)} aria-label="Next saved resorts"><ChevronRight size={16} aria-hidden="true" /></button></nav>}
  </div>;
}
