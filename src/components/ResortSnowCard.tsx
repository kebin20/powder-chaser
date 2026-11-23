import { ExternalLink, Info } from 'lucide-react';
import { JAPAN_TIMEZONE } from '../lib/dates';
import type { ResortDepth } from '../lib/use-resort-depth';

const reportTime = new Intl.DateTimeFormat('en', {
  timeZone: JAPAN_TIMEZONE, month: 'short', day: 'numeric', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const centimeters = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

export default function ResortSnowCard({ depth, forecast, windowLabel, location, confidence }: {
  depth: ResortDepth;
  forecast: string;
  windowLabel: string;
  location: string;
  confidence?: string;
}) {
  return (
    <section className="snow-summary-card" aria-label="Resort snow depth and overnight forecast">
      <div className="snow-summary-depth">
        <h2>Total snow depth</h2>
        {depth.valueCm === null
          ? <p className="snow-summary-empty">{depth.status === 'checking' ? 'Checking report…' : 'Unavailable'}</p>
          : <p className="snow-summary-depth-value">{centimeters.format(depth.valueCm)}<small> cm</small></p>}
        {depth.status === 'demo' && <p className="snow-summary-meta">Demo reading</p>}
        {depth.sourceUrl && (
          <a className="snow-summary-source" href={depth.sourceUrl} target="_blank" rel="noreferrer">
            {depth.valueCm !== null && depth.station ? depth.station : 'Official resort report'}
            <ExternalLink size={11} aria-hidden="true" />
          </a>
        )}
        {depth.reportedAt && (
          <p className="snow-summary-meta">
            {depth.status === 'past' && <strong className="snow-summary-past">Past report · </strong>}
            <time dateTime={depth.reportedAt}>{reportTime.format(new Date(depth.reportedAt))} JST</time>
          </p>
        )}
      </div>
      <div className="snow-summary-forecast">
        <h2>Forecast fresh snow</h2>
        <p className="snow-summary-forecast-value">{forecast}{forecast !== '—' && <small> cm</small>}</p>
        <p className="snow-summary-meta">{windowLabel}</p>
        <p className="snow-summary-meta">{location}</p>
        {confidence && (
          <details className="confidence-popover">
            <summary><Info size={13} aria-hidden="true" />Confidence</summary>
            <div className="confidence-message"><strong>{confidence}</strong><p>How closely the available forecasts align.</p></div>
          </details>
        )}
      </div>
    </section>
  );
}
