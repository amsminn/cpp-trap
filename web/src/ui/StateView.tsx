import { useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react";

export type StateViewProps = {
  kind: "loading" | "error" | "empty";
  /** Sentence-case wait phrase such as "Loading problems": the status text and the Retry accessible name. */
  label: string;
  children?: ReactNode;
  onRetry?: () => void;
  startedAt?: number;
};

const ELAPSED_AFTER_MS = 3000;
const TICK_MS = 1000;

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

export function StateView({ kind, label, children, onRetry, startedAt }: StateViewProps): ReactElement {
  // Screen readers announce only changes made after a live region exists, so the first text lands one commit after mount.
  const [live, setLive] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [retryStarted, setRetryStarted] = useState(false);
  const retryControl = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => () => {
    if (document.activeElement !== retryControl.current) return;
    queueMicrotask(() => {
      const heading = document.querySelector("main h1");
      if (document.activeElement === document.body && heading instanceof HTMLElement) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    });
  }, []);

  useEffect(() => {
    setLive(true);
  }, []);

  useEffect(() => {
    if (kind !== "loading") return;
    const started = startedAt ?? Date.now();
    const tick = () => setElapsedMs(Date.now() - started);
    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [kind, label, startedAt]);

  const elapsed = kind === "loading" && elapsedMs > ELAPSED_AFTER_MS ? ` · ${Math.floor(elapsedMs / 1000)} s` : "";
  const status = live && kind === "loading" ? `${label}…${elapsed}` : null;
  const alert = live && kind === "error" ? (
    <>
      {children ?? `We had trouble ${lowerFirst(label)}. Please retry.`}
    </>
  ) : null;

  return (
    <div className={kind === "error" ? "state-view bad" : "state-view"}>
      <div>
        <div role="status" aria-live="polite" aria-atomic="true">{status}</div>
        <div role="alert" aria-atomic="true">{alert}</div>
      </div>
      {onRetry && (kind === "error" || retryStarted) ? (
        <button ref={retryControl} type="button" className="link-btn"
          aria-disabled={kind === "loading"}
          aria-label={`Retry ${lowerFirst(label).replace(/\b(the|your|accepted) /g, "").replace(/ #\d+$/, "")}`}
          onClick={() => {
            if (kind !== "error") return;
            setRetryStarted(true);
            onRetry();
          }}>
          Retry<span className="sr-only"> {lowerFirst(label)}</span>
        </button>
      ) : null}
      {kind === "error" ? null : children}
    </div>
  );
}
