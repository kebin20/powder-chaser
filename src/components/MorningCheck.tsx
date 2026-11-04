import { useEffect, useState } from 'react';
import { ChevronDown, ExternalLink, MountainSnow } from 'lucide-react';
import { getResortReportView, loadResortReports, RESORT_REPORT_CACHE_TTL_MS, type ResortReports } from '../lib/resort-reports';
import { RESORT_WEBCAMS } from '../data/resort-webcams';
import type { DataMode, Resort, WeatherSnapshot } from '../types';
import './MorningCheck.css';

function reportTime(value: string | null) {
  return value ? `${new Intl.DateTimeFormat('en', { timeZone: 'Asia/Tokyo', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))} JST` : 'Time not published';
}
function snow(value: number | null) { return value === null ? 'Not reported' : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} cm`; }
const operationLabels = { open: 'Operating', partial: 'Partly operating', hold: 'On hold', closed: 'Closed', unknown: 'Unverified' };

export default function MorningCheck({ resort, date, mode, snapshot }: { resort: Resort; date: string; mode: DataMode; snapshot: WeatherSnapshot | null }) {
  const [data, setData] = useState<ResortReports | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(mode === 'live');
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (mode !== 'live') return;
    const controller = new AbortController();
    setLoading(true); setError(false);
    loadResortReports({ signal: controller.signal }).then(payload => {
      if (!controller.signal.aborted) setData(payload);
    }).catch(() => { if (!controller.signal.aborted) setError(true); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [mode, refresh]);
  useEffect(() => {
    const update = () => { if (document.visibilityState !== 'hidden') setNow(new Date()); };
    const resume = () => { if (document.visibilityState !== 'hidden') { update(); if (mode === 'live') setRefresh(value => value + 1); } };
    const timer = window.setInterval(update, 60_000);
    const reportTimer = mode === 'live' ? window.setInterval(resume, RESORT_REPORT_CACHE_TTL_MS) : null;
    window.addEventListener('online', resume); window.addEventListener('focus', resume); document.addEventListener('visibilitychange', resume);
    return () => { window.clearInterval(timer); if (reportTimer !== null) window.clearInterval(reportTimer); window.removeEventListener('online', resume); window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', resume); };
  }, [mode]);
  const view = getResortReportView(data, resort.id, date, now);
  const fictional = mode === 'demo' && snapshot?.report.fictional;
  const report = view.report;
  const fresh = fictional ? snapshot.reportedFreshCm : view.snowfall24h.valueCm;
  const depth = fictional ? snapshot.snowDepthCm : view.depth.valueCm;
  const stale = !fictional && (view.snowfall24h.status === 'stale' || view.depth.status === 'stale');
  const fictionalStale = Boolean(fictional && snapshot.report.updatedAt && now.getTime() - new Date(snapshot.report.updatedAt).getTime() >= 24 * 3_600_000);
  const status = fictional ? snapshot.operations.status : view.operations.freshness === 'unavailable' ? 'unknown' : view.operations.status;
  const reportUrl = report?.sourceUrl ?? resort.officialReportUrl ?? resort.officialUrl ?? resort.sourceUrl;
  const webcamUrl = report?.webcamUrl ?? RESORT_WEBCAMS[resort.id];
  const hasOfficialLink = Boolean(report || resort.officialReportUrl || resort.officialUrl);
  const hasValues = fresh !== null || depth !== null;
  const hasOperations = Boolean(fictional || view.operations.freshness !== 'unavailable');
  const reportState = fictional ? 'DEMO · FICTIONAL' : stale ? 'PAST REPORT' : hasValues ? 'RESORT REPORT' : loading ? 'CHECKING' : 'NO READING';

  return <section className="morning-check" aria-label={`${resort.name} snow measurements`}>
    <div className="morning-check-heading">
      <p className="morning-check-location"><MountainSnow size={15} aria-hidden="true" />{fictional ? 'Example station' : report?.station ?? 'Station not specified'}</p>
      <span className={`report-state ${stale ? 'past' : ''}`}>{reportState}</span>
    </div>
    {report?.reportedAt && <p className="morning-check-time">Reported {reportTime(report.reportedAt)}{stale ? ' · past reading' : ''}</p>}
    {loading && !data && <p className="small muted" role="status">Checking the latest resort reading…</p>}
    <div className="morning-check-facts">
      <div><span>Fresh snow · last 24 h</span><strong>{snow(fresh)}</strong>{!fictional && view.snowfall24h.status === 'stale' && <small>Past report</small>}</div>
      <div><span>Total snow depth</span><strong>{snow(depth)}</strong>{!fictional && view.depth.status === 'stale' && <small>Past report</small>}</div>
    </div>
    {fictional ? <p className="morning-check-note">{fictionalStale ? 'Simulated older reading. ' : ''}Demo values are fictional, not current mountain conditions.</p> : <>
      {hasValues && <p className="morning-check-note">The resort’s reporting window may differ from the overnight forecast.</p>}
      {error && data && !loading && <p className="morning-check-note" role="status">Showing the last collected reading. <button className="text-button" onClick={() => setRefresh(value => value + 1)}>Try again</button></p>}
      {!hasValues && !loading && <p className="morning-check-note" role={error ? 'alert' : undefined}>{error ? 'The collected reading could not be loaded.' : 'No dated snow reading is available in the app yet.'} <button className="text-button" onClick={() => setRefresh(value => value + 1)}>{error ? 'Try again' : 'Refresh'}</button></p>}
    </>}
    {hasOperations && <details className="report-operations">
      <summary><span>Lift status · {operationLabels[status]}</span><ChevronDown size={14} aria-hidden="true" /></summary>
      <div>
        <p>{fictional ? snapshot.operations.details : view.operations.details ?? 'No lift update is available. Confirm directly with the resort.'}</p>
        {!fictional && view.operations.reportedAt && <small>Reported {reportTime(view.operations.reportedAt)}{view.operations.freshness === 'stale' ? ' · past report' : ''}</small>}
        {!view.operations.appliesToTripDate && <small>Access for {new Intl.DateTimeFormat('en', { timeZone: 'Asia/Tokyo', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00+09:00`))} is not confirmed by this report.</small>}
      </div>
    </details>}
    <div className="morning-check-links">
      <a className="text-link" href={reportUrl} target="_blank" rel="noreferrer">{hasOfficialLink ? 'Official resort report' : 'Resort map listing'}<ExternalLink size={12} aria-hidden="true" /></a>
      {webcamUrl && <a className="text-link" href={webcamUrl} target="_blank" rel="noreferrer">Official webcam<ExternalLink size={12} aria-hidden="true" /></a>}
    </div>
  </section>;
}
