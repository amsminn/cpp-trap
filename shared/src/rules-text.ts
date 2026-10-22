import type { PublicProblem } from "./problem";

/** The validator's rules in plain words (V027), shared so the SPA and the server-rendered page say the same thing. */
export function ruleLines(constraints: PublicProblem["constraints"]): string[] {
  const { max_chars, max_semicolons, single_line } = constraints;
  return [
    `At most ${max_chars} characters; spaces count`,
    single_line ? "One line only; no newlines" : "Multiple lines allowed; each newline counts as 1 character",
    "Printable ASCII only: plain letters, digits, punctuation and spaces",
    max_semicolons === null ? null : `At most ${max_semicolons} semicolon${max_semicolons === 1 ? "" : "s"}`,
  ].filter((rule) => rule !== null);
}
