import type { PowderDecision } from '../types';

/** Keep weather potential visible even while trip-date access is unconfirmed. */
export default function DecisionSignals({ decision, compact = false }: { decision: PowderDecision; compact?: boolean }) {
  return <div className={`decision-signals${compact ? ' compact' : ''}`}>
    <p className="powder-signal"><span>Powder outlook</span><strong className={`outlook-label ${decision.outlook.status}`}>{decision.outlook.label}</strong></p>
    <p className="outlook-reason">{decision.outlook.reason}</p>
    <p className="access-signal"><span>Trip-date access</span><strong className={decision.access.status}>{decision.access.label}</strong></p>
  </div>;
}
