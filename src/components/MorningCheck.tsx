import { useEffect, useState } from 'react';
import { ExternalLink, MountainSnow } from 'lucide-react';
import { getResortReportView, loadResortReports, RESORT_REPORT_CACHE_TTL_MS, type ResortReports } from '../lib/resort-reports';
import { RESORT_WEBCAMS } from '../data/resort-webcams';
import type { DataMode, Resort, WeatherSnapshot } from '../types';
import './MorningCheck.css';

function reportTime(value: string | null) {
  return value ? `${new Intl.DateTimeFormat('en', { timeZone: 'Asia/Tokyo', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))} JST` : 'Time not published';
}
function snow(value: number | null) { return value === null ? 'Unavailable' : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} cm`; }
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
  const status = fictional ? snapshot.operations.status : view.operations.freshness === 'unavailable' ? 'unknown' : view.operations.status;
  const reportUrl = report?.sourceUrl ?? resort.officialReportUrl ?? resort.officialUrl ?? resort.sourceUrl;
  const webcamUrl = report?.webcamUrl ?? RESORT_WEBCAMS[resort.id];
  const hasOfficialLink = Boolean(report || resort.officialReportUrl || resort.officialUrl);
  const hasValues = fresh !== null || depth !== null;
  return <section className="morning-check" aria-labelledby="morning-check-title">
    <div className="morning-check-heading"><h3 id="morning-check-title"><MountainSnow size={16} aria-hidden="true" />Morning resort check</h3><span className={`report-state ${stale ? 'past' : ''}`}>{fictional ? 'DEMO' : stale ? 'PAST REPORT' : hasValues ? 'RESORT REPORT' : 'CHECK RESORT'}</span></div>
    <p className="morning-check-location">{fictional ? 'Example reporting station · fictional' : report?.station ?? 'Resort observations · separate from model forecasts'}</p>
    {loading && !data && <p className="small muted" role="status">Checking the latest collected report…</p>}
    <div className="morning-check-facts"><div><span>Reported fresh · last 24 h</span><strong>{snow(fresh)}</strong>{!fictional && view.snowfall24h.status === 'stale' && <small>Past report</small>}</div><div><span>Total reported depth</span><strong>{snow(depth)}</strong>{!fictional && view.depth.status === 'stale' && <small>Past report</small>}</div></div>
    <div className="morning-check-operations"><span>Lift status{!fictional && view.operations.freshness === 'stale' ? ' · past report' : ''}</span><strong>{operationLabels[status]}</strong><p>{fictional ? 'Fictional open-lift scenario for exploring the app.' : (view.operations.freshness !== 'unavailable' ? view.operations.details : null) ?? 'A current lift report is not available. Confirm directly with the resort.'}</p>{!fictional && view.operations.freshness !== 'unavailable' && view.operations.reportedAt && <small>{reportTime(view.operations.reportedAt)}</small>}</div>
    {fictional ? <p className="morning-check-note">Illustrative snow and operations; these are not current mountain conditions.</p> : <>
      {report?.reportedAt && <p className="morning-check-note">Snow report: {reportTime(report.reportedAt)}{stale ? ' · no current snow report' : ''}.</p>}
      {error && data && !loading && <p className="morning-check-note">The report could not be refreshed. Showing the last collected readings; check the official page.<button className="text-button" onClick={() => setRefresh(value => value + 1)}>Try again</button></p>}
      {!hasValues && !loading && !(error && data) && <p className="morning-check-note">{error ? 'The collected report could not be loaded. Official links are still available.' : 'No dated snowfall readings are available here yet. Missing values stay unknown.'}{error && <button className="text-button" onClick={() => setRefresh(value => value + 1)}>Try again</button>}</p>}
      {!view.operations.appliesToTripDate && <p className="morning-check-note">Access for {new Intl.DateTimeFormat('en', { timeZone: 'Asia/Tokyo', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00+09:00`))} is unconfirmed. A current-day report does not confirm your ski morning.</p>}
      {hasValues && <p className="morning-check-note">Reported 24-hour snow uses a different window from the overnight forecast.</p>}
    </>}
    <div className="morning-check-links"><a className="text-link" href={reportUrl} target="_blank" rel="noreferrer">{hasOfficialLink ? 'Official resort report' : 'Resort map listing'}<ExternalLink size={12} aria-hidden="true" /></a>{webcamUrl && <a className="text-link" href={webcamUrl} target="_blank" rel="noreferrer">Official webcam<ExternalLink size={12} aria-hidden="true" /></a>}</div>
  </section>;
}
