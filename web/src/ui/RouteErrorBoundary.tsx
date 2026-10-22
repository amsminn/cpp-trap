import { Component, type ReactElement, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { PageMain } from "./PageMain";
import { useRouteReady } from "./RouteTransition";
import { useTitle } from "./useTitle";

type Props = { readonly children: ReactNode; readonly resetKey: string };
type State = { readonly failed: boolean; readonly resetKey: string };

function RouteError({ onRetry }: { readonly onRetry: () => void }): ReactElement {
  useTitle("Page error");
  useRouteReady(true);
  return (
    <PageMain className="single">
      <div className="card">
        <h1>Page could not be displayed</h1>
        <p role="alert">Something went wrong displaying this page. Try again or return to the problems.</p>
        <div className="recovery-actions">
          <button type="button" className="btn" onClick={onRetry}>Try again</button>
          <Link className="inline-link" to="/">Back to problems</Link>
        </div>
      </div>
    </PageMain>
  );
}

/** Keep the header and session alive when a route's render fails. Never display exception details. */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): State | null {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey };
  }

  render(): ReactElement {
    return this.state.failed
      ? <RouteError onRetry={() => this.setState({ failed: false })} />
      : <>{this.props.children}</>;
  }
}
