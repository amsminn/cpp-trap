import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { PageMain } from "./PageMain";

const COPY = {
  problem: {
    heading: "Problem not found",
    description: "No problem exists at this address. It may have been removed, or the link may be wrong.",
  },
  page: {
    heading: "Page not found",
    description: "Nothing exists at this address. Check the link, or start again from the problem list.",
  },
} as const;

/**
 * The missing-destination shell (V026 enabler, V095): the normal card surface with one h1 naming what is missing, an
 * explanation, and the problem list as the only recovery link. The route that renders it owns its title and ready signal.
 */
export function MissingProblem({ kind }: { readonly kind: "problem" | "page" }): ReactElement {
  const copy = COPY[kind];
  return (
    <PageMain className="single">
      <div className="card">
        <h1>{copy.heading}</h1>
        <p>{copy.description}</p>
        <p><Link className="inline-link" to="/">Back to problems</Link></p>
      </div>
    </PageMain>
  );
}
