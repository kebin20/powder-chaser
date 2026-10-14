import { Component, createRef, type ReactNode } from 'react';

/** A failed optional chunk must leave the forecast usable. */
export default class HistoryBoundary extends Component<{ children: ReactNode; onClose: () => void }, { failed: boolean }> {
  state = { failed: false };
  private closeButton = createRef<HTMLButtonElement>();
  private opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.closeButton.current?.focus(); }
  componentWillUnmount() { if (this.state.failed) this.opener?.focus(); }

  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="history-chunk-loading" role="alert">
      <p>Snowfall history couldn’t open. Check your connection and reload to try again.</p>
      <button ref={this.closeButton} className="text-button" onClick={this.props.onClose}>Close</button>
      <button className="text-button" onClick={() => window.location.reload()}>Reload app</button>
    </div>;
  }
}
