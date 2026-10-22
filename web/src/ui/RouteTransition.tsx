import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const READY_EVENT = "cpp-trap:route-ready";

/** Publish only committed content readiness, scoped to this history entry. */
export function useRouteReady(ready: boolean): void {
  const { key } = useLocation();
  useLayoutEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    if (ready) main.dataset["routeReady"] = key;
    else delete main.dataset["routeReady"];
    document.dispatchEvent(new Event(READY_EVENT));
    return () => {
      if (main.dataset["routeReady"] === key) delete main.dataset["routeReady"];
    };
  }, [key, ready]);
}

type Reading = { readonly y: number; readonly link: string | null };

function linkSelector(element: Element | null): string | null {
  const link = element?.closest("a[href]");
  if (!link) return null;
  const row = link.closest("[data-route-row]");
  const scope = row
    ? `[data-route-row=${CSS.escape(row.getAttribute("data-route-row") ?? "")}] `
    : link.closest("main") ? "main " : link.closest("nav") ? "nav " : "header ";
  return `${scope}a[href=${CSS.escape(link.getAttribute("href") ?? "")}]`;
}

function focus(element: HTMLElement): void {
  // Headings and hash destinations are not normally Tab stops.
  if (!element.hasAttribute("tabindex")) element.tabIndex = -1;
  element.focus({ preventScroll: true });
}

/** One focus decision per navigation; POP waits for the page's explicit ready signal. */
export function RouteTransition(): null {
  const location = useLocation();
  const action = useNavigationType();
  const readings = useRef(new Map<string, Reading>());
  const previous = useRef(location);
  const active = useRef(location.key);
  const pending = useRef(false);

  useLayoutEffect(() => {
    const restoration = history.scrollRestoration;
    history.scrollRestoration = "manual";
    let activated: Element | null = null;
    const save = (element: Element | null = document.activeElement) => {
      // Never replace a pending POP's saved position with its loading/error frame.
      if (pending.current) return;
      readings.current.set(active.current, { y: window.scrollY, link: linkSelector(element) });
    };
    const click = (event: MouseEvent) => {
      if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        activated = event.target instanceof Element ? event.target.closest("a[href]") : null;
        save(activated);
        // Touch and programmatic link activation need not focus the anchor first.
        queueMicrotask(() => { activated = null; });
      }
    };
    // Capture before React removes the old DOM (which can clamp scrollY).
    const push = history.pushState;
    const replace = history.replaceState;
    const pushState: History["pushState"] = function (this: History, ...args) { save(activated ?? document.activeElement); push.apply(this, args); };
    const replaceState: History["replaceState"] = function (this: History, ...args) { save(activated ?? document.activeElement); replace.apply(this, args); };
    const pop = () => save();
    history.pushState = pushState;
    history.replaceState = replaceState;
    window.addEventListener("popstate", pop, true);
    document.addEventListener("click", click, true);
    return () => {
      history.scrollRestoration = restoration;
      history.pushState = push;
      history.replaceState = replace;
      window.removeEventListener("popstate", pop, true);
      document.removeEventListener("click", click, true);
    };
  }, []);

  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = location;
    active.current = location.key;
    pending.current = false;
    // Initial entry keeps native reload/deep-link focus and scroll.
    if (from.key === location.key) return;
    const saved = readings.current.get(location.key);
    const samePage = from.pathname === location.pathname && from.search === location.search;
    pending.current = action === "POP" || Boolean(location.hash);
    const finish = () => {
      const main = document.querySelector<HTMLElement>("main");
      if (!main || active.current !== location.key) return;
      const ready = main.dataset["routeReady"] === location.key;
      if (pending.current && !ready) return;
      if (action === "POP" && saved) {
        const origin = saved.link ? document.querySelector<HTMLElement>(saved.link) : null;
        focus(origin ?? main.querySelector<HTMLElement>("h1") ?? main);
        window.scrollTo({ top: saved.y, behavior: "instant" });
      } else if (location.hash) {
        const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
        if (target) {
          focus(target);
          target.scrollIntoView({ behavior: "instant" });
        }
      } else if (!samePage || action !== "POP") {
        focus((ready ? main.querySelector<HTMLElement>("h1") : null) ?? main);
        window.scrollTo({ top: 0, behavior: "instant" });
      }
      pending.current = false;
      document.removeEventListener(READY_EVENT, finish);
    };
    document.addEventListener(READY_EVENT, finish);
    finish();
    return () => {
      document.removeEventListener(READY_EVENT, finish);
      pending.current = false;
    };
  }, [location, action]);

  return null;
}
