import { useId } from "react";
import { Link } from "react-router-dom";
import { api } from "../client";
import { useLoad } from "../load";
import { TablePlaceholder, type PlaceholderColumn } from "../ui/Placeholders";
import { StateView } from "../ui/StateView";
import { LoadState } from "../ui/LoadState";
import { PageMain } from "../ui/PageMain";
import { useTitle } from "../ui/useTitle";
import { useRouteReady } from "../ui/RouteTransition";
import "../styles/browse.css";

const COLUMNS: readonly PlaceholderColumn[] = [
  { head: "Rank", bar: "1ch", num: true },
  { head: "User", bar: "7em" },
  { head: "Solved", bar: "2ch", num: true },
];

export function RankingPage() {
  useTitle("Leaderboard");
  const headingId = useId();
  const [loaded, reload] = useLoad((signal) => api.ranking({ signal }), "ranking");
  useRouteReady(loaded.state === "ready");

  return (
    <PageMain className="single browse-page browse-ranking">
      <div className="card">
        <h1 id={headingId}>Leaderboard</h1>
        <p className="muted">Ranked by problems solved. Equal totals share a rank; tied users are listed by login.</p>
        <div className="state-frame state-frame--table" aria-busy={loaded.state === "loading"}>
          {loaded.state !== "ready" ? <TablePlaceholder columns={COLUMNS} /> : null}
          <LoadState loaded={loaded} reload={reload} operation="ranking" label="Loading the leaderboard" />
          {loaded.state !== "ready" ? null : loaded.data.length === 0 ? (
            <StateView kind="empty" label="Loading the leaderboard">
              <p>No problems have been solved yet.</p>
              <p><Link className="inline-link" to="/">Pick a problem</Link></p>
            </StateView>
          ) : (
            <div className="table-wrap ranking-wrap">
              <table className="table ranking-table" aria-labelledby={headingId}>
                <colgroup>
                  <col className="col-rank" />
                  <col className="col-user" />
                  <col className="col-solved" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col" className="num index">Rank</th>
                    <th scope="col" className="user-cell">User</th>
                    <th scope="col" className="num count-cell">Solved</th>
                  </tr>
                </thead>
                <tbody>
                  {loaded.data.map((row) => (
                    <tr key={row.login}>
                      <td className="num index mono">{row.rank}</td>
                      <td className="user-cell">{row.login}</td>
                      <td className="num count-cell">{row.solved}</td>
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
