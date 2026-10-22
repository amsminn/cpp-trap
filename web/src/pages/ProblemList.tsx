import { HOME_LEAD, HOME_LEAD_KO, HOME_TITLE } from "@cpp-trap/shared";
import { useId } from "react";
import { Link } from "react-router-dom";
import { api } from "../client";
import { useLoad } from "../load";
import { useSession } from "../session";
import { TablePlaceholder, type PlaceholderColumn } from "../ui/Placeholders";
import { StateView } from "../ui/StateView";
import { LoadState } from "../ui/LoadState";
import { PageMain } from "../ui/PageMain";
import { useTitle } from "../ui/useTitle";
import { useRouteReady } from "../ui/RouteTransition";
import "../styles/browse.css";

const COLUMNS: readonly PlaceholderColumn[] = [
  { head: "#", bar: "1ch", num: true },
  { head: "Title", bar: "7em" },
  { head: "Limit", bar: "5em" },
  { head: "Solved by", bar: "2ch", num: true },
];
const STATUS_COLUMN: PlaceholderColumn = { head: "Your status", bar: "4em" };

export function ProblemListPage() {
  useTitle(HOME_TITLE, true);
  const { identityKey, me } = useSession();
  const headingId = useId();
  const [loaded, reload] = useLoad((signal) => api.problems({ signal }), `problems-${identityKey}`);
  useRouteReady(loaded.state === "ready");
  // The personal column exists only for a resolved signed-in session (V019): while the session is unknown, failed or
  // anonymous, the header and every status cell are omitted together, so no row carries a cell under a blank header.
  const personal = Boolean(me);
  const columns = personal ? [...COLUMNS, STATUS_COLUMN] : COLUMNS;

  return (
    <PageMain className="single browse-page browse-catalog">
      <div className="card">
        <h1 id={headingId}>Problems</h1>
        <p className="muted">{HOME_LEAD}</p>
        <p className="muted" lang="ko">{HOME_LEAD_KO}</p>
        <div className={`state-frame state-frame--table state-frame--catalog${personal ? " state-frame--catalog-personal" : ""}`} aria-busy={loaded.state === "loading"}>
          {loaded.state !== "ready" ? <TablePlaceholder columns={columns} /> : null}
          <LoadState loaded={loaded} reload={reload} operation="problems" label="Loading problems" />
          {loaded.state !== "ready" ? null : loaded.data.length === 0 ? (
            <StateView kind="empty" label="Loading problems">
              <p>No problems are available yet.</p>
              <p><Link className="inline-link" to="/about">About C++ Trap</Link></p>
            </StateView>
          ) : (
            <div className="table-wrap catalog-wrap">
              <table className="table catalog-table" role="table" aria-labelledby={headingId}>
                <colgroup>
                  <col className="col-index" />
                  <col className="col-title" />
                  <col className="col-limit" />
                  <col className="col-count" />
                  {personal ? <col className="col-status" /> : null}
                </colgroup>
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader" scope="col" className="num index">#</th>
                    <th role="columnheader" scope="col" className="title-cell">Title</th>
                    <th role="columnheader" scope="col" className="limit-cell">Limit</th>
                    <th role="columnheader" scope="col" className="num count-cell">Solved by</th>
                    {personal ? <th role="columnheader" scope="col" className="status-cell">Your status</th> : null}
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {loaded.data.map((problem) => (
                    <tr key={problem.number} role="row" data-route-row={`problem-${problem.number}`}>
                      <td role="cell" className="num index mono">{problem.number}</td>
                      <td role="cell" className="title-cell"><Link className="cell-link" to={`/p/${problem.number}`}>{problem.title}</Link></td>
                      <td role="cell" className="limit-cell">≤ {problem.maxChars} chars</td>
                      <td role="cell" className="num count-cell">
                        <span className="cell-label" aria-hidden="true">Solved by</span> <span className="numeric">{problem.solvedCount}</span>
                      </td>
                      {personal ? (
                        <td role="cell" className="status-cell">
                          <span className="cell-label" aria-hidden="true">Your status:</span>{" "}
                          {problem.solvedByMe ? <span className="tag solved">Solved</span> : <span className="muted">Not solved</span>}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </PageMain>
  );
}
