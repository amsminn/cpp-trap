import type { MeView } from "@cpp-trap/shared";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation, useMatch, useNavigate } from "react-router-dom";
import { api, errorText, RequestError, subscribeUnauthorized } from "./client";
import { AboutPage } from "./pages/About";
import { ProblemPage } from "./pages/Problem";
import { ProblemListPage } from "./pages/ProblemList";
import { RankingPage } from "./pages/Ranking";
import { SolutionsPage } from "./pages/Solutions";
import { SubmissionsPage } from "./pages/Submissions";
import { SessionContext, type SessionState } from "./session";
import { consumeReturn } from "./ui/auth";
import { AuthPrompt, PRIVACY_PATH } from "./ui/AuthPrompt";
import { DeletionCompletionNotice } from "./ui/DeletionCompletionNotice";
import { MissingProblem } from "./ui/MissingProblem";
import { SessionNotice } from "./ui/SessionNotice";
import { StateView } from "./ui/StateView";
import { useTitle } from "./ui/useTitle";
import { RouteTransition, useRouteReady } from "./ui/RouteTransition";
import { RouteErrorBoundary } from "./ui/RouteErrorBoundary";

function NotFoundPage() {
  useTitle("Page not found");
  useRouteReady(true);
  return <MissingProblem kind="page" />;
}

export function App() {
  const [session, setSession] = useState<{ state: SessionState; identityKey: string }>({
    state: { state: "checking" }, identityKey: "unknown",
  });
  const [generation, setGeneration] = useState(0);
  const request = useRef<AbortController | null>(null);
  const returned = useRef(false);
  const logoutInFlight = useRef(false);
  const focusLogin = useRef(false);
  const account = useRef<HTMLDivElement>(null);
  const [logoutState, setLogoutState] = useState<"idle" | "pending" | "error">("idle");
  const [logoutError, setLogoutError] = useState<RequestError | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { state, identityKey } = session;
  const me = state.state === "authenticated" ? state.user : state.state === "anonymous" ? null : undefined;
  // Problems stays the current section on its own child routes (V034): the list and a valid /p/:number with or without
  // /solutions. The wildcard route and a non-numeric problem segment belong to no section.
  const problemRoute = useMatch("/p/:number");
  const solutionsRoute = useMatch("/p/:number/solutions");
  const problemNumber = (problemRoute ?? solutionsRoute)?.params.number ?? "";
  const problemsCurrent = location.pathname === "/" || /^\d+$/.test(problemNumber);

  function setMe(view: MeView) {
    request.current?.abort();
    setSession(view === null
      ? { state: { state: "anonymous" }, identityKey: "anonymous" }
      : { state: { state: "authenticated", user: view }, identityKey: `user:${view.login}` });
  }

  function signOut(reason: "expired" | "logout" | "deleted") {
    request.current?.abort();
    setSession({ state: { state: "anonymous", reason }, identityKey: "anonymous" });
  }

  useEffect(() => subscribeUnauthorized(() => signOut("expired")), []);

  function retry() {
    request.current?.abort();
    setSession((previous) => ({ ...previous, state: { state: "checking" } }));
    setGeneration((n) => n + 1);
  }

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    api.me({ signal: controller.signal }).then(
      (view) => { if (!controller.signal.aborted) setMe(view); },
      (error: unknown) => {
        if (!controller.signal.aborted) setSession((previous) => ({ ...previous, state: { state: "error", error } }));
      },
    );
    return () => controller.abort();
  }, [generation]);

  useEffect(() => {
    if (state.state !== "authenticated" || returned.current) return;
    returned.current = true;
    if (location.pathname === "/") {
      const path = consumeReturn();
      if (path !== null) navigate(path, { replace: true });
    }
  }, [state.state, location.pathname, navigate]);

  async function logout() {
    if (logoutInFlight.current) return;
    logoutInFlight.current = true;
    setLogoutState("pending");
    try {
      await api.logout();
      focusLogin.current = true;
      signOut("logout");
      setLogoutState("idle");
    } catch (error: unknown) {
      if (!(error instanceof RequestError)) throw error;
      setLogoutError(error);
      setLogoutState("error");
    } finally {
      logoutInFlight.current = false;
    }
  }

  useLayoutEffect(() => {
    if (me !== null || !focusLogin.current) return;
    focusLogin.current = false;
    account.current?.querySelector<HTMLAnchorElement>("a[href='/auth/github']")?.focus({ preventScroll: true });
  }, [me]);

  return (
    <SessionContext value={{ state, me, identityKey, setMe, signOut, retry }}>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="nav">
        <Link to="/" className="logo">C++<span>trap</span></Link>
        <nav className="nav-links" aria-label="Site">
          <Link to="/" className={problemsCurrent ? "active" : undefined} aria-current={problemsCurrent ? "page" : undefined}>Problems</Link>
          <NavLink to="/ranking">Leaderboard</NavLink>
          <NavLink to="/submissions">My submissions</NavLink>
          <NavLink to="/about">About</NavLink>
        </nav>
        <div className="nav-user" ref={account}>
          <SessionNotice />
          {me ? (
            <>
              <Link to={PRIVACY_PATH} className="nav-identity">
                <img className="avatar" src={me.avatarUrl} alt="" width={28} height={28} />
                <span className="sr-only">Account and privacy for </span>
                <span className="nav-login">{me.login}</span>
              </Link>
              <button type="button" className="link-btn nav-logout" aria-disabled={logoutState === "pending"} onClick={logout}>
                {logoutState === "pending" ? "Logging out…" : "Log out"}
              </button>
              {logoutState !== "idle" ? (
                <div className={logoutState === "pending" && logoutError === null ? "sr-only" : "account-status"}>
                  <StateView kind={logoutState === "pending" ? "loading" : "error"} label="Logging out" onRetry={logout}>
                    {logoutState === "error" ? errorText(logoutError, "logout") : null}
                  </StateView>
                </div>
              ) : null}
            </>
          ) : me === null ? (
            <AuthPrompt returnTo={location.pathname + location.search + location.hash} purpose="account" />
          ) : null}
          <span className="sr-only" role="status">{state.state === "anonymous" && state.reason === "logout" ? "Logged out." : null}</span>
        </div>
      </header>
      <DeletionCompletionNotice />
      <RouteErrorBoundary resetKey={location.key}>
        <Routes>
          <Route path="/" element={<ProblemListPage />} />
          <Route path="/p/:number" element={<ProblemPage />} />
          <Route path="/p/:number/solutions" element={<SolutionsPage />} />
          <Route path="/ranking" element={<RankingPage />} />
          <Route path="/submissions" element={<SubmissionsPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </RouteErrorBoundary>
      <RouteTransition />
    </SessionContext>
  );
}
