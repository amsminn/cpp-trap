import { useEffect, useRef, useState } from "react";

export type Loaded<T> =
  | { state: "loading" }
  | { state: "ready"; data: T; refreshing: boolean; refreshError?: unknown }
  | { state: "error"; error: unknown };

export function useLoad<T>(
  load: (signal: AbortSignal) => Promise<T>,
  key: string,
  options?: { enabled?: boolean },
): [Loaded<T>, () => void] {
  const enabled = options?.enabled ?? true;
  const [snapshot, setSnapshot] = useState<{ key: string; enabled: boolean; loaded: Loaded<T> }>({
    key, enabled, loaded: { state: "loading" },
  });
  const [generation, setGeneration] = useState(0);
  const pending = useRef(false);
  const current = snapshot.key === key && snapshot.enabled === enabled;
  // Reset during render so even layout effects cannot observe another key's data.
  if (!current) setSnapshot({ key, enabled, loaded: { state: "loading" } });

  useEffect(() => {
    if (!enabled) return;
    pending.current = true;
    const controller = new AbortController();
    setSnapshot((previous) => ({
      key, enabled,
      loaded: previous.key === key && previous.loaded.state === "ready"
        ? { state: "ready", data: previous.loaded.data, refreshing: true }
        : { state: "loading" },
    }));
    Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return load(controller.signal);
    }).then(
      (data) => {
        if (controller.signal.aborted) return;
        pending.current = false;
        setSnapshot({ key, enabled, loaded: { state: "ready", data, refreshing: false } });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        pending.current = false;
        setSnapshot((previous) => ({
          key, enabled,
          loaded: previous.key === key && previous.loaded.state === "ready"
            ? { state: "ready", data: previous.loaded.data, refreshing: false, refreshError: error }
            : { state: "error", error },
        }));
      },
    );
    return () => { controller.abort(); pending.current = false; };
  }, [key, generation, enabled]);

  return [current ? snapshot.loaded : { state: "loading" }, () => {
    if (!enabled || pending.current) return;
    pending.current = true;
    setGeneration((n) => n + 1);
  }];
}
