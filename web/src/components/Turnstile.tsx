import { useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";

type TurnstileApi = {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      theme: "light" | "dark" | "auto";
      size: "normal" | "compact" | "flexible";
      language: "en";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export type TurnstileHandle = { reset(): void };

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TEST_SITEKEY = "1x00000000000000000000AA";

let loading: Promise<TurnstileApi> | undefined;
let loadingScript: HTMLScriptElement | undefined;

function loadTurnstile(): Promise<TurnstileApi> {
  loading ??= new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const script = document.createElement("script");
    loadingScript = script;
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      loadingScript = undefined;
      if (window.turnstile) resolve(window.turnstile);
      else {
        loading = undefined;
        script.remove();
        reject(new Error("turnstile did not initialise"));
      }
    };
    script.onerror = () => {
      loading = undefined;
      loadingScript = undefined;
      script.remove();
      reject(new Error("turnstile script failed to load"));
    };
    document.head.append(script);
  });
  return loading;
}

type Lifecycle = "loading" | "ready" | "expired" | "script-error" | "render-error" | "widget-error";

const LIFECYCLE_TEXT: Readonly<Record<Lifecycle, string>> = {
  loading: "Loading human check…",
  ready: "Human check ready.",
  expired: "Human check expired. Retry to continue.",
  "script-error": "Human check script failed to load. Retry to continue.",
  "render-error": "Human check could not start. Retry to continue.",
  "widget-error": "Human check reported an error. Retry to continue.",
};

export function Turnstile({ ref, onToken, enabled = true }: {
  ref: Ref<TurnstileHandle>;
  onToken: (token: string | null) => void;
  enabled?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<{ api: TurnstileApi; id: string } | null>(null);
  const emit = useRef(onToken);
  const statusId = useId();
  const [size, setSize] = useState<"compact" | "flexible" | null>(null);
  const [lifecycle, setLifecycle] = useState<Lifecycle>("loading");
  const [attempt, setAttempt] = useState(0);
  emit.current = onToken;

  useImperativeHandle(ref, () => ({
    reset() {
      emit.current(null);
      setLifecycle("loading");
      if (widget.current) widget.current.api.reset(widget.current.id);
    },
  }), []);

  useLayoutEffect(() => {
    const frame = container.current?.parentElement;
    if (!frame) return;
    const measure = () => setSize(frame.getBoundingClientRect().width < 300 ? "compact" : "flexible");
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    emit.current(null);
    setLifecycle("loading");
    if (!enabled || size === null) return;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !container.current) return;
        try {
          const id = api.render(container.current, {
            sitekey: import.meta.env.VITE_TURNSTILE_SITEKEY ?? TEST_SITEKEY,
            theme: "dark",
            size,
            language: "en",
            callback: (token) => {
              emit.current(token);
              setLifecycle("ready");
              if (container.current?.contains(document.activeElement)) {
                container.current.closest(".ed")?.querySelector<HTMLElement>(".slot")?.focus({ preventScroll: true });
              }
            },
            "expired-callback": () => {
              emit.current(null);
              setLifecycle("expired");
            },
            "error-callback": () => {
              emit.current(null);
              setLifecycle("widget-error");
            },
          });
          widget.current = { api, id };
        } catch {
          emit.current(null);
          setLifecycle("render-error");
        }
      })
      .catch(() => {
        emit.current(null);
        setLifecycle("script-error");
      });
    return () => {
      cancelled = true;
      if (widget.current) widget.current.api.remove(widget.current.id);
      widget.current = null;
    };
  }, [attempt, enabled, size]);

  const failed = lifecycle !== "loading" && lifecycle !== "ready";
  return (
    <>
      <div ref={container} className="turnstile" />
      <div className="human-check-status">
        <span id={statusId} role="status" aria-live="polite">{enabled ? LIFECYCLE_TEXT[lifecycle] : "Checking your session…"}</span>
        {enabled && failed ? (
          <button
            type="button"
            className="human-check-retry"
            aria-label="Retry"
            aria-describedby={statusId}
            onClick={() => {
              emit.current(null);
              if (widget.current) widget.current.api.remove(widget.current.id);
              widget.current = null;
              if (lifecycle === "script-error") {
                loading = undefined;
                loadingScript?.remove();
                loadingScript = undefined;
              }
              setAttempt((value) => value + 1);
            }}
          >
            Retry
          </button>
        ) : null}
      </div>
    </>
  );
}
