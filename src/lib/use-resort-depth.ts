import { useEffect, useState } from 'react';
import type { DataMode, Resort, WeatherSnapshot } from '../types';
import { getResortReportView, loadResortReports, RESORT_REPORT_CACHE_TTL_MS, type ResortReports } from './resort-reports';

export interface ResortDepth {
  valueCm: number | null;
  station: string | null;
  reportedAt: string | null;
  sourceUrl: string | null;
  status: 'checking' | 'unavailable' | 'reported' | 'past' | 'demo';
}

export function useResortDepth(
  resort: Resort, tripDate: string, mode: DataMode, snapshot: WeatherSnapshot | null,
  forecastView: boolean, refresh: number,
): ResortDepth {
  const enabled = forecastView && mode === 'live';
  const [state, setState] = useState<{ payload: ResortReports | null; checked: boolean }>({
    payload: null, checked: false,
  });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let pending = false;
    const update = async () => {
      if (pending || document.visibilityState === 'hidden' || !navigator.onLine) return;
      pending = true;
      try {
        const payload = await loadResortReports({ signal: controller.signal });
        if (!controller.signal.aborted) setState({ payload, checked: true });
      } catch {
        if (!controller.signal.aborted) setState(previous => ({ ...previous, checked: true }));
      } finally {
        pending = false;
      }
    };

    void update();
    const timer = window.setInterval(update, RESORT_REPORT_CACHE_TTL_MS);
    window.addEventListener('focus', update);
    window.addEventListener('online', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
      window.removeEventListener('online', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [enabled, refresh]);

  if (mode === 'demo') {
    const report = snapshot?.report.fictional ? snapshot.report : null;
    return {
      valueCm: report?.depthCm ?? null,
      station: report?.location ?? null, reportedAt: null, sourceUrl: null, status: 'demo',
    };
  }

  const { report, depth } = getResortReportView(state.payload, resort.id, tripDate);
  const status = depth.status === 'fresh' ? 'reported' : depth.status === 'stale' ? 'past'
    : !state.checked && navigator.onLine ? 'checking' : 'unavailable';
  return {
    valueCm: depth.valueCm,
    station: report?.station ?? null,
    reportedAt: depth.valueCm === null ? null : report?.reportedAt ?? null,
    sourceUrl: report?.sourceUrl ?? resort.officialReportUrl ?? resort.officialUrl,
    status,
  };
}
