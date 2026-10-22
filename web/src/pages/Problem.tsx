import { ruleLines } from "@cpp-trap/shared";
import type { PublicProblem } from "@cpp-trap/shared";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api, errorText, RequestError, waitForVerdict } from "../client";
import { Turnstile, type TurnstileHandle } from "../components/Turnstile";
import { Decorative } from "../ui/Decorative";
import { Editor, type Result } from "../ui/Editor";
import { HumanCheck } from "../ui/HumanCheck";
import { HelpLink } from "../ui/HelpLink";
import { useLoad, type Loaded as LoadResult } from "../load";
import { useSession } from "../session";
import { Bar, EditorPlaceholder, ProblemPlaceholder, RulesPlaceholder } from "../ui/Placeholders";
import { LoadState } from "../ui/LoadState";
import { PageMain } from "../ui/PageMain";
import { StateView } from "../ui/StateView";
import { useTitle } from "../ui/useTitle";
import { useRouteReady } from "../ui/RouteTransition";
import { useProblemNumber } from "../ui/useProblemNumber";
import "../styles/editor.css";

const MEDALS = ["🥇", "🥈", "🥉"];

function verificationWasNotConsumed(error: unknown): boolean {
  if (!(error instanceof RequestError) || error.kind !== "http") return false;
  const code = error.body.error;
  return (error.status === 400 && ["invalid submission", "invalid problem", "input rejected"].includes(code)) ||
    (error.status === 401 && code === "Authentication required") ||
    (error.status === 429 && code === "rate limit reached") ||
    (error.status === 503 && code === "submissions paused");
}

export function ProblemPage() {
  const number = useProblemNumber();
  const { me } = useSession();
  const [loaded, reload] = useLoad(
    async (signal) => {
      if (number === null) throw new Error("No such problem.");
      return api.problem(number, { signal });
    },
    `problem-${number}`,
    { enabled: number !== null },
  );
  const missing = number === null || (loaded.state === "error" && loaded.error instanceof RequestError && loaded.error.status === 404);
  useTitle(missing
    ? "Problem not found"
    : loaded.state === "ready"
      ? `${loaded.data.title} · #${number}`
      : `Problem #${number}`);
  useRouteReady(loaded.state !== "loading" || missing);

  if (missing) {
    return (
      <PageMain className="single">
        <div className="card">
          <h1>Problem not found</h1>
          <StateView kind="empty" label="Problem not found">
            <p>No problem exists at this address. It may have been removed, or the link may be wrong.</p>
            <p><Link className="inline-link" to="/">Back to problems</Link></p>
          </StateView>
        </div>
      </PageMain>
    );
  }

  // Composition first (V035): the statement card, then the editor, then the comparison card, in DOM order at every width;
  // .editor-layout keeps the W3 two-column composition above 800px with the editor spanning the right column.
  if (loaded.state !== "ready") {
    return (
      <PageMain className="editor-layout">
        <div className="card editor-primary">
          <div className="state-frame state-frame--problem" aria-busy={loaded.state === "loading"}>
            <div>
              {number === null ? null : <span className="tag">#{number}</span>}
              <h1>{number === null ? "Problem" : `Problem #${number}`}</h1>
              <div className="statement-slot">
                <p className="statement placeholder" aria-hidden="true"><Bar width="14em" /> <Bar width="14em" /> <Bar width="14em" /></p>
                <LoadState loaded={loaded} reload={reload} operation="problem" label={number === null ? "Loading problem" : `Loading problem #${number}`} />
              </div>
              <RulesPlaceholder />
            </div>
          </div>
        </div>
        <EditorPlaceholder me={me} />
        <div className="card editor-secondary"><ProblemPlaceholder /></div>
      </PageMain>
    );
  }
  return <PageMain className="editor-layout"><Loaded key={loaded.data.number} problem={loaded.data} reload={reload} loaded={loaded} /></PageMain>;
}

function Loaded({ problem, reload, loaded }: { problem: PublicProblem; reload: () => void; loaded: LoadResult<unknown> }) {
  const { me, identityKey, state } = useSession();
  const location = useLocation();
  const [shortest, reloadShortest] = useLoad(
    (signal) => api.shortest(problem.number, { signal }),
    `problem-shortest-${problem.number}`,
  );
  const [personal, reloadPersonal] = useLoad(
    (signal) => api.problems({ signal }),
    `problem-status-${problem.number}-${identityKey}`,
    { enabled: Boolean(me) },
  );
  const solved = Boolean(me) && personal.state === "ready" &&
    personal.data.some((item) => item.number === problem.number && item.solvedByMe);
  const statusKnown = Boolean(me) && personal.state === "ready" && personal.refreshError === undefined;
  const draftKey = `cpp-trap:draft:${problem.number}`;
  const [value, setValue] = useState(() => localStorage.getItem(draftKey) ?? "");
  function changeDraft(next: string) {
    // Persist in the input handler, before navigation or login can interrupt this render.
    localStorage.setItem(draftKey, next);
    setValue(next);
  }
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>({ state: "idle" });
  const [accepted, setAccepted] = useState(false);
  const submitting = useRef(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [owner, setOwner] = useState(identityKey);
  // Reset only identity-owned state; the public problem and code slot stay mounted.
  if (owner !== identityKey) {
    setOwner(identityKey);
    setToken(null);
    setBusy(false);
    setResult({ state: "idle" });
    setAccepted(false);
  }
  const turnstile = useRef<TurnstileHandle>(null);
  const observation = useRef<AbortController | null>(null);
  const submissionKey = `cpp-trap:submission:${problem.number}`;
  const card = useRef<HTMLDivElement>(null);
  // The code slot belongs to the editor beside this card; both live in the route's main landmark.
  const focusSlot = () => {
    const slot = card.current?.closest("main")?.querySelector<HTMLElement>(".ed .slot");
    slot?.focus({ preventScroll: true });
    slot?.scrollIntoView({ block: "center", inline: "nearest" });
  };
  useLayoutEffect(() => () => observation.current?.abort(), [identityKey]);
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setClockNow(now);
      if (now >= cooldownUntil) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [cooldownUntil]);
  useEffect(() => {
    if (!me) return;
    const requested = new URLSearchParams(location.search).get("submission");
    let saved: { id: string; code: string; startedAt: number; owner: string } | undefined;
    try {
      const raw = sessionStorage.getItem(submissionKey);
      saved = raw === null ? undefined : JSON.parse(raw) as typeof saved;
    } catch {
      sessionStorage.removeItem(submissionKey);
    }
    const id = requested ?? (saved?.owner === identityKey ? saved.id : null);
    if (id === null) return;
    const own = saved?.id === id ? saved : undefined;
    void observeSubmission(id, own?.code ?? value, own?.startedAt ?? Date.now());
    // Resume only when the route, identity or problem changes; draft edits must not restart observation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityKey, location.search, me, problem.number]);
  const { banned } = problem.constraints;
  const rulesId = useId();
  const rules = ruleLines(problem.constraints);

  async function submit() {
    if (!me || busy || submitting.current || cooldownUntil > Date.now()) return;
    if (token === null) {
      setResult({ state: "error", text: "Human check is not ready yet, try again in a moment." });
      return;
    }
    submitting.current = true;
    setBusy(true);
    const submittedCode = value;
    setResult({ state: "submitting", code: submittedCode });
    observation.current?.abort();
    const controller = new AbortController();
    observation.current = controller;
    try {
      let id: string;
      let resetVerification = true;
      try {
        ({ id } = await api.submit({ problem: problem.number, code: value, turnstileToken: token, idempotencyKey: crypto.randomUUID() }, { signal: controller.signal }));
      } catch (error) {
        resetVerification = !verificationWasNotConsumed(error);
        throw error;
      } finally {
        if (!controller.signal.aborted && resetVerification) turnstile.current?.reset();
      }
      const startedAt = Date.now();
      sessionStorage.setItem(submissionKey, JSON.stringify({ id, code: submittedCode, startedAt, owner: identityKey }));
      await observeSubmission(id, submittedCode, startedAt, controller);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof RequestError && error.status === 429 && error.body.error === "rate limit reached" && error.retryAfter !== undefined) {
        const until = Date.now() + error.retryAfter * 1000;
        setCooldownUntil(until);
        setClockNow(Date.now());
      }
      setResult({
        state: "error", text: error instanceof RequestError && error.status === 400 && error.body.error === "input rejected"
          ? `Rejected. ${errorText(error, "submit")}`
          : errorText(error, "submit"),
        ...(error instanceof RequestError && error.submissionId !== undefined ? { submissionId: error.submissionId } : {}),
      });
    } finally {
      submitting.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  async function observeSubmission(id: string, submittedCode: string, startedAt: number, existing?: AbortController) {
    if (observation.current && observation.current !== existing) observation.current.abort();
    const controller = existing ?? new AbortController();
    observation.current = controller;
    setBusy(true);
    setResult({ state: "queued", id, code: submittedCode, startedAt, elapsedMs: Math.max(0, Date.now() - startedAt) });
    const deadline = setTimeout(() => {
      if (controller.signal.aborted) return;
      controller.abort();
      if (observation.current === controller) observation.current = null;
      setBusy(false);
      setResult({ state: "stopped", id, code: submittedCode, text: "Stopped waiting after 45 seconds. The server may still be judging this submission." });
    }, Math.max(0, 45_000 - (Date.now() - startedAt)));
    try {
      const view = await waitForVerdict(id, {
        signal: controller.signal,
        deadlineMs: 45_000,
        onQueued: (queued, elapsedMs) => {
          if (!controller.signal.aborted) setResult({ state: "queued", id, code: queued.code, startedAt, elapsedMs });
        },
      });
      if (controller.signal.aborted) return;
      sessionStorage.removeItem(submissionKey);
      setResult({ state: "done", view, code: view.code });
      if (view.verdict === "accepted") {
        setAccepted(true);
        reloadPersonal();
        reloadShortest();
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof RequestError && error.submissionId === id) {
        setResult({ state: "stopped", id, code: submittedCode, text: errorText(error, "submit") });
      } else {
        setResult({ state: "error", text: errorText(error, "submit") });
      }
    } finally {
      clearTimeout(deadline);
      if (observation.current === controller) observation.current = null;
      if (!controller.signal.aborted) setBusy(false);
      submitting.current = false;
    }
  }

  function checkAgain() {
    if (result.state !== "stopped" && result.state !== "queued") return;
    void observeSubmission(result.id, result.code, Date.now());
  }

  function stopWaiting() {
    if (result.state !== "queued") return;
    observation.current?.abort();
    setBusy(false);
    setResult({ state: "stopped", id: result.id, code: result.code, text: "Stopped waiting here. The server may still be judging this submission." });
  }

  return (
    <>
      <div className="card editor-primary" ref={card}>
        <span className="tag">#{problem.number}</span>
        {solved || accepted ? <span className="tag solved">Solved</span> : null}
        <h1>{problem.title}</h1>
        <LoadState loaded={loaded} reload={reload} operation="problem" label="Loading problem" />
        <p className="statement">{problem.statement}</p>
        <ul className="rules" id={rulesId} aria-label="Input rules">
          {rules.map((rule) => <li key={rule}>{rule}</li>)}
          {banned.length ? (
            <li className="rules-banned">
              <span>Must not contain</span>
              {banned.map((term) => <code key={term}>{term}</code>)}
            </li>
          ) : null}
        </ul>
      </div>
      <Editor
        problem={problem}
        value={value}
        onChange={changeDraft}
        me={me}
        busy={busy}
        verificationReady={token !== null}
        cooldownRemaining={Math.max(0, Math.ceil((cooldownUntil - clockNow) / 1000))}
        onSubmit={submit}
        describedBy={rulesId}
        result={state.state === "anonymous" && state.reason === "expired"
          ? { state: "error", text: "Your session expired. Log in with GitHub to continue." }
          : result}
        onCheckAgain={checkAgain}
        onStopWaiting={stopWaiting}
        turnstile={<HumanCheck>
          <Turnstile key={identityKey} ref={turnstile} onToken={setToken} enabled={me !== undefined} />
          <p className="help-action"><HelpLink problem={problem.number} /></p>
        </HumanCheck>}
      />
      <div className="card editor-secondary">
        <h2>Shortest solutions</h2>
        <p className="muted">Ranked by shortest accepted code. Equal character counts share a rank; tied users are listed by login.</p>
        <section className="problem-secondary" aria-label="Shortest solutions">
          {shortest.state !== "ready" || shortest.refreshing || shortest.refreshError !== undefined ? (
            <StateView
              kind={shortest.state === "error" || (shortest.state === "ready" && shortest.refreshError !== undefined) ? "error" : "loading"}
              label="Loading shortest solutions"
              onRetry={reloadShortest}
            />
          ) : null}
          {shortest.state !== "ready" ? null : shortest.data.length === 0 ? (
            <StateView kind="empty" label="Loading shortest solutions">
              <p>Nobody has solved this problem yet. Be the first.</p>
              <p><button type="button" className="inline-link" onClick={focusSlot}>Focus your code</button></p>
            </StateView>
          ) : (
            <ol className="lb shortest-list" aria-label="Shortest accepted solutions ranked by character count">
              {shortest.data.map((row) => {
                const medal = MEDALS[row.rank - 1];
                return (
                  <li key={`${row.rank}-${row.login}`}>
                    <span className="who">
                      {medal === undefined ? null : <Decorative>{medal} </Decorative>}
                      <span>{row.rank}. </span>
                      <span className="shortest-login">{row.login}</span>
                    </span>
                    <span className="mono">{row.chars} characters</span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
        <section className="problem-secondary" aria-label="Your solved status">
          {me ? <LoadState loaded={personal} reload={reloadPersonal} operation="problems" label="Loading problems" /> : null}
          {me && !statusKnown && !accepted ? <p className="muted">Your solved status is unknown. You can keep working on your code.</p> : null}
          <p>
            {solved || accepted
              ? <Link className="inline-link" to={`/p/${problem.number}/solutions`}>See accepted solutions</Link>
              : me !== null && !statusKnown ? null
                : <span className="muted"><Decorative>🔒 </Decorative>Solutions unlock after you solve it</span>}
          </p>
        </section>
        <p className="credit">{problem.credit}</p>
      </div>
    </>
  );
}
