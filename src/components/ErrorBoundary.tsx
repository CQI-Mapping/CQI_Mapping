// Top-level crash guard. A rendering error anywhere under the app shell used
// to unmount React and leave the tab blank; this boundary swaps in a readable
// fallback instead — the real error text (honest, never fabricated), a way to
// reload, and the full stack tucked into a <details> for whoever is debugging.
//
// What boundaries cover: render-time errors, lifecycle methods, constructors.
// Event handlers and async Supabase calls are not covered — those are caught
// in their own try/catch blocks the way every service call in this app
// already handles them.

import { Component, ErrorInfo, ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  /** React calls this first for a thrown render error — turn it into state. */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  /** Side-effect hook: keep the full diagnosis in the console for debugging. */
  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Render crash caught by the app boundary:', error, info.componentStack)
  }

  handleReload = (): void => {
    // A hard reload restarts the whole SPA — a soft route reset is pointless
    // here, since the error state lives inside the crashed tree.
    window.location.assign(window.location.origin + '/')
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    // Generic-humanoid headline + real detail: the message is the user's
    // diagnostic to read, not a leak — it went through render() in their own
    // browser, so it already belongs to them.
    return (
      <div className="app-crash">
        <div className="app-crash__card">
          <h1>Something went wrong</h1>
          <p>
            The dashboard hit an unexpected error and had to stop this view.
            Reloading usually fixes it — if it keeps happening, screenshot the
            detail below and send it to the administrator.
          </p>
          <div className="app-crash__message">Error: {error.message || String(error)}</div>
          {error.stack && (
            <details className="app-crash__details">
              <summary>Technical detail</summary>
              <pre>{error.stack}</pre>
            </details>
          )}
          <button type="button" className="app-crash__reload" onClick={this.handleReload}>
            Reload the app
          </button>
        </div>
      </div>
    )
  }
}
