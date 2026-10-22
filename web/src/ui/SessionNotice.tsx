import type { ReactElement } from "react";
import { useSession } from "../session";

export function SessionNotice(): ReactElement | null {
  const { state, retry } = useSession();
  switch (state.state) {
    case "checking":
      return <span role="status" aria-busy="true">Checking your session</span>;
    case "error":
      return (
        <span role="status">
          We couldn't check your session.{" "}
          <button type="button" className="link-btn" onClick={retry}>Retry</button>
        </span>
      );
    case "anonymous":
      return state.reason === "expired" ? <span role="status">Your session expired.</span> : null;
    case "authenticated":
      return null;
  }
}
