import { Component, type ReactNode } from 'react';

/** Optional feature chunks must not take down the forecast when loading fails. */
export default class FeatureBoundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="error-card feature-load-error" role="alert"><p>{this.props.name} could not be opened. Reload the app to try again.</p><button className="text-button" onClick={() => window.location.reload()}>Reload app</button></div>;
    return this.props.children;
  }
}
