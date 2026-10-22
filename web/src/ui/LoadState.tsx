import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { errorText, RequestError, type ErrorOperation } from "../client";
import type { Loaded } from "../load";
import { Decorative } from "./Decorative";
import { StateView } from "./StateView";

export function LoadState<T>({ loaded, reload, operation, label, denialContent }: {
  readonly loaded: Loaded<T>;
  readonly reload: () => void;
  readonly operation: ErrorOperation;
  readonly label: string;
  readonly denialContent?: ReactNode;
}) {
  const error = loaded.state === "error" ? loaded.error
    : loaded.state === "ready" ? loaded.refreshError : undefined;
  if (error instanceof RequestError && (error.status === 401 || error.status === 403)) {
    return (
      <StateView kind="error" label={label}>
        {denialContent ?? <>
        {operation === "solutions" ? <Decorative>{"\u{1F512} "}</Decorative> : null}
        {error.status === 401
          ? <><a href="/auth/github">Log in with GitHub</a> {operation === "solutions" ? "and solve this problem to see how others did it." : "and try again."}</>
          : operation === "solutions"
            ? <>Solve this problem first. Accepted solutions are only visible to people who solved it.</>
            : <>Access is restricted. Check your account or <Link to="/">choose another problem</Link>.</>}
        </>}
      </StateView>
    );
  }
  if (loaded.state === "ready" && !loaded.refreshing && error === undefined) return null;
  return (
    <StateView kind={error === undefined ? "loading" : "error"} label={label} onRetry={reload}>
      {error === undefined ? null : errorText(error, operation)}
    </StateView>
  );
}
