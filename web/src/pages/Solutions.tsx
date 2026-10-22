import { Link, useLocation } from "react-router-dom";
import { api, RequestError } from "../client";
import { useLoad, type Loaded } from "../load";
import { useSession } from "../session";
import { AuthPrompt } from "../ui/AuthPrompt";
import { MissingProblem } from "../ui/MissingProblem";
import { SolutionsPlaceholder } from "../ui/Placeholders";
import { StateView } from "../ui/StateView";
import { LoadState } from "../ui/LoadState";
import { PageMain } from "../ui/PageMain";
import { useTitle } from "../ui/useTitle";
import { useRouteReady } from "../ui/RouteTransition";
import { useProblemNumber } from "../ui/useProblemNumber";
import "../styles/browse.css";
import { Code } from "../ui/highlight";

const notFound = (loaded: Loaded<unknown>): boolean =>
  loaded.state === "error" && loaded.error instanceof RequestError && loaded.error.status === 404;

export function SolutionsPage() {
  const number = useProblemNumber();
  const { identityKey, state } = useSession();
  const location = useLocation();
  const [loaded, reload] = useLoad(
    (signal) => (number === null ? Promise.reject(new Error("No such problem.")) : api.solutions(number, { signal })),
    `solutions-${number}-${identityKey}`,
    { enabled: number !== null && state.state === "authenticated" },
  );
  const [problem, reloadProblem] = useLoad(
    (signal) => (number === null ? Promise.reject(new Error("No such problem.")) : api.problem(number, { signal })),
    `solution-problem-${number}`,
    { enabled: number !== null },
  );
  const missing = number === null || notFound(problem) || notFound(loaded);
  const context = problem.state === "ready" ? `${problem.data.title} · #${number}` : `#${number}`;
  useTitle(missing ? "Problem not found" : `Accepted solutions for ${context}`);
  useRouteReady(missing || (problem.state !== "loading" && (state.state === "anonymous" ||
    (loaded.state === "ready" || (loaded.state === "error" && loaded.error instanceof RequestError &&
      (loaded.error.status === 401 || loaded.error.status === 403))))));

  if (missing) return <MissingProblem kind="problem" />;
  return (
    <PageMain className="single browse-page browse-solutions">
      <div className="card">
        <h1>Accepted solutions for {context}</h1>
        <p className="back-link-line"><Link className="inline-link back-link" to={`/p/${number}`}>Back to the problem</Link></p>
        <LoadState loaded={problem} reload={reloadProblem} operation="problem" label="Loading problem details" />
        <div className="state-frame state-frame--solutions" aria-busy={state.state !== "anonymous" && loaded.state === "loading"}>
          {state.state !== "anonymous" && loaded.state !== "ready" ? <SolutionsPlaceholder /> : null}
          <LoadState
            loaded={state.state === "anonymous" ? { state: "error", error: new RequestError(401, { error: "Authentication required" }) } : loaded}
            reload={reload} operation="solutions" label="Loading accepted solutions"
            denialContent={state.state === "anonymous"
              ? <AuthPrompt returnTo={location.pathname + location.search + location.hash} purpose="solutions" />
              : undefined}
          />
          {state.state === "anonymous" || loaded.state !== "ready" ? null : loaded.data.length === 0 ? (
            <StateView kind="empty" label="Loading accepted solutions">
              <p>No accepted solutions are available yet.</p>
              <p><Link className="inline-link" to={`/p/${number}`}>Back to the problem</Link></p>
            </StateView>
          ) : (
            <div>
              {loaded.data.map((row, index) => (
                <section key={index}>
                  <h2 className="solution-heading">
                    <span className="solution-login">{row.login}</span>{" "}
                    <span className="solution-chars">· <span className="mono">{row.chars}</span> chars</span>
                  </h2>
                  <pre className="code-light"><Code text={row.code} /></pre>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageMain>
  );
}
