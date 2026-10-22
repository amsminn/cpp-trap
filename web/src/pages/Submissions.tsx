import type { SubmissionView } from "@cpp-trap/shared";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api, errorText } from "../client";
import { useLoad } from "../load";
import { useSession } from "../session";
import { AuthPrompt } from "../ui/AuthPrompt";
import { SessionNotice } from "../ui/SessionNotice";
import { TablePlaceholder, type PlaceholderColumn } from "../ui/Placeholders";
import { StateView } from "../ui/StateView";
import { LoadState } from "../ui/LoadState";
import { PageMain } from "../ui/PageMain";
import { ScrollRegion } from "../ui/ScrollRegion";
import { useTitle } from "../ui/useTitle";
import { useRouteReady } from "../ui/RouteTransition";
import { formatSubmissionTime } from "../ui/formatTime";
import { VERDICT } from "../verdict";
import "../styles/browse.css";
import { Code } from "../ui/highlight";

const COLUMNS: readonly PlaceholderColumn[] = [
  { head: "When", bar: "9em" },
  { head: "Problem", bar: "2ch" },
  { head: "Chars", bar: "2ch", num: true },
  { head: "Verdict", bar: "5em" },
  { head: "Message", bar: "12em" },
];

type StatusCheck = { readonly row: SubmissionView; readonly message: string };

export function SubmissionsPage() {
  useTitle("My submissions");
  const { state, identityKey } = useSession();
  const headingId = useId();
  const location = useLocation();
  useRouteReady(state.state === "anonymous");

  return (
    <PageMain className="single browse-page browse-history">
      <div className="card">
        <h1 id={headingId}>My submissions</h1>
        <p className="muted">Newest submissions first.</p>
        {state.state === "authenticated" ? (
          <SubmissionHistory key={identityKey} headingId={headingId} />
        ) : (
          <div className="state-frame state-frame--table state-frame--history" aria-busy={state.state === "checking"}>
            {state.state === "checking" ? (
              <>
                <TablePlaceholder columns={COLUMNS} />
                <StateView kind="loading" label="Checking your session" />
              </>
            ) : state.state === "error" ? (
              <div className="notice"><SessionNotice /></div>
            ) : (
              <AuthPrompt returnTo={location.pathname + location.search + location.hash} purpose="submissions" className="notice" />
            )}
          </div>
        )}
      </div>
    </PageMain>
  );
}

function SubmissionHistory({ headingId }: { readonly headingId: string }) {
  const [checks, setChecks] = useState<Record<string, StatusCheck>>({});
  const generation = useRef(0);
  const requests = useRef(new Map<string, "pending" | "terminal">());
  const controllers = useRef(new Set<AbortController>());
  useLayoutEffect(() => {
    const activeGeneration = ++generation.current;
    return () => {
      if (generation.current === activeGeneration) generation.current++;
      for (const controller of controllers.current) controller.abort();
      controllers.current.clear();
      requests.current.clear();
    };
  }, []);
  function checkStatus(row: SubmissionView) {
    if (row.verdict !== "queued" || requests.current.has(row.id)) return;
    const activeGeneration = generation.current;
    const controller = new AbortController();
    controllers.current.add(controller);
    requests.current.set(row.id, "pending");
    setChecks((previous) => ({ ...previous, [row.id]: { row, message: "Checking status..." } }));
    api.submission(row.id, { signal: controller.signal }).then(
      (result) => {
        controllers.current.delete(controller);
        if (generation.current !== activeGeneration) return;
        if (result.verdict === "queued") requests.current.delete(row.id);
        else requests.current.set(row.id, "terminal");
        setChecks((previous) => ({
          ...previous,
          [row.id]: {
            row: { ...row, ...result },
            message: result.verdict === "queued" ? "Still queued. Check status again when you're ready." : "Status up to date.",
          },
        }));
      },
      () => {
        controllers.current.delete(controller);
        if (generation.current !== activeGeneration) return;
        requests.current.delete(row.id);
        setChecks((previous) => ({
          ...previous,
          [row.id]: { row, message: "Couldn't check this attempt's status. Use Check status to retry." },
        }));
      },
    );
  }
  const [loaded, reload] = useLoad((signal) => api.mySubmissions({ signal }), "submissions");
  // The submission API carries only a problem number (V080). One catalog lookup per signed-in mount, independent of the
  // history request, maps numbers to titles; while it is pending or failed the rows keep their number links.
  const [titles, reloadTitles] = useLoad((signal) => api.problems({ signal }), "problem-titles");
  const titleOf = titles.state === "ready" ? new Map(titles.data.map((problem) => [problem.number, problem.title])) : null;
  useRouteReady(loaded.state === "ready");

  return (
    <>
        <div className="state-frame state-frame--table state-frame--history" aria-busy={loaded.state === "loading"}>
          {loaded.state !== "ready" ? <TablePlaceholder columns={COLUMNS} /> : null}
          {loaded.state !== "ready" ? (
            <LoadState loaded={loaded} reload={reload} operation="submissions" label="Loading your submissions" />
          ) : loaded.data.length === 0 ? (
            <StateView kind="empty" label="Loading your submissions">
              <p>Nothing yet. <Link className="inline-link" to="/">Pick a problem</Link>.</p>
            </StateView>
          ) : (
            <>
              {titles.state === "error" ? (
                <StateView kind="error" label="Loading problems" onRetry={reloadTitles}>
                  Problem titles are unavailable. {errorText(titles.error, "problems")} Your attempts are still listed below.
                </StateView>
              ) : null}
              <ScrollRegion label="Submission history" className="table-wrap history-wrap">
                <table className="table history-table" role="table" aria-labelledby={headingId}>
                  <colgroup>
                    <col className="col-when" />
                    <col className="col-problem" />
                    <col className="col-chars" />
                    <col className="col-verdict" />
                    <col className="col-message" />
                  </colgroup>
                  <thead role="rowgroup">
                    <tr role="row">
                      <th role="columnheader" scope="col" className="when-cell">When</th>
                      <th role="columnheader" scope="col" className="title-cell">Problem</th>
                      <th role="columnheader" scope="col" className="num chars-cell">Chars</th>
                      <th role="columnheader" scope="col" className="verdict-cell">Verdict</th>
                      <th role="columnheader" scope="col" className="message-cell">Message</th>
                    </tr>
                  </thead>
                  <tbody role="rowgroup">
                    {loaded.data.map((original) => {
                      const check = checks[original.id];
                      const row = check?.row ?? original;
                      const checkable = original.verdict === "queued" || check !== undefined;
                      const checking = requests.current.get(row.id) === "pending";
                      const terminal = row.verdict !== "queued";
                      const when = formatSubmissionTime(row.createdAt);
                      const title = titleOf?.get(row.problem);
                      return (
                        <tr key={row.id} role="row" data-route-row={`submission-${row.id}`}>
                          <td role="cell" className="when-cell">
                            <span className="cell-label" aria-hidden="true">When</span>
                            <time className="mono" dateTime={when.dateTime}>
                              <span className="when-part">{when.label.slice(0, 10)}</span> <span className="when-part">{when.label.slice(11)}</span>
                              <span className="sr-only">, {when.full}</span>
                            </time>
                          </td>
                          <td role="cell" className="title-cell">
                            <span className="cell-label" aria-hidden="true">Problem</span>
                            <Link className="cell-link" to={`/p/${row.problem}`}>#{row.problem}{title === undefined ? null : ` ${title}`}</Link>
                            {titles.state === "loading" ? (
                              <span className="muted title-status">Loading title</span>
                            ) : title === undefined ? (
                              <span className="muted title-status"><span aria-hidden="true">— </span>Title unavailable</span>
                            ) : null}
                          </td>
                          <td role="cell" className="num chars-cell">
                            <span className="cell-label" aria-hidden="true">Chars</span>
                            <span className="numeric">{row.chars}</span>
                          </td>
                          <td role="cell" className={`verdict-cell ${VERDICT[row.verdict].tone}`}>
                            <span className="cell-label" aria-hidden="true">Verdict</span>
                            <span>{VERDICT[row.verdict].label}</span>
                            {checkable ? (
                              <div className="attempt-status">
                                <button
                                  type="button"
                                  className="btn"
                                  aria-label={`${terminal ? "Status up to date" : "Check status"} for problem #${row.problem}`}
                                  aria-disabled={checking || terminal}
                                  onClick={() => checkStatus(row)}
                                >{terminal ? "Status up to date" : "Check status"}</button>
                                <span className="muted" role="status" aria-live="polite" aria-atomic="true">{check?.message ?? ""}</span>
                              </div>
                            ) : null}
                          </td>
                          <td role="cell" className="message-cell">
                            <span className="cell-label" aria-hidden="true">Message</span>
                            <span className="muted attempt-summary">{row.message}</span>
                            <details className="attempt-details" onToggle={(event) => {
                              if (event.currentTarget.open) event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
                            }} onFocus={(event) => {
                              if (event.currentTarget.open) event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
                            }}>
                              <summary className="disclosure-summary">View attempt {row.id}</summary>
                              <div className="attempt-body">
                                <p>Attempt <code>{row.id}</code> / Problem #{row.problem} / <span className={VERDICT[row.verdict].tone}>{VERDICT[row.verdict].label}</span></p>
                                <ScrollRegion as="pre" label={`Submitted code for attempt ${row.id}`} className="code-light"><Code text={row.code} /></ScrollRegion>
                                <p className="attempt-message">{row.message}</p>
                                {row.compilerOutput === null ? (
                                  <p className="muted">Compiler output is unavailable for this attempt.</p>
                                ) : (
                                  <details className="attempt-output">
                                    <summary className="disclosure-summary">Show compiler output</summary>
                                    <ScrollRegion as="pre" label={`Compiler output for attempt ${row.id}`} className="code-light">{row.compilerOutput}</ScrollRegion>
                                  </details>
                                )}
                              </div>
                            </details>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollRegion>
            </>
          )}
        </div>
        {loaded.state === "ready"
          ? <LoadState loaded={loaded} reload={reload} operation="submissions" label="Loading your submissions" /> : null}
    </>
  );
}
