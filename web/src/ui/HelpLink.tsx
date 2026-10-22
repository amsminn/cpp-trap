import type { ReactElement } from "react";
import { Link } from "react-router-dom";

type HelpContext = { readonly problem?: number; readonly submissionId?: string };

/** Allowlist navigation context at both ends; never forward a result, exception, token or draft. */
export function helpContext(value: unknown): HelpContext {
  if (typeof value !== "object" || value === null) return {};
  const problem = "problem" in value ? value.problem : undefined;
  const submissionId = "submissionId" in value ? value.submissionId : undefined;
  return {
    ...(typeof problem === "number" && Number.isSafeInteger(problem) && problem > 0 ? { problem } : {}),
    ...(typeof submissionId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionId)
      ? { submissionId } : {}),
  };
}

export function HelpLink(props: { problem?: number; submissionId?: string }): ReactElement {
  return <Link className="inline-link" to="/about#technical-help" state={helpContext(props)}>Help</Link>;
}
