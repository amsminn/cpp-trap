import type { PublicProblem } from "./problem";

export function checkInput(problem: PublicProblem, input: string): {
  readonly ok: boolean;
  readonly chars: number;
  readonly semicolons: number;
  readonly bannedFound: readonly string[];
  readonly errors: readonly string[];
} {
  const { max_chars, max_semicolons, single_line, banned } = problem.constraints;
  const chars = input.length;
  const semicolons = input.split(";").length - 1;
  const bannedFound = banned.filter((term) => input.includes(term));
  const errors: string[] = [];

  if (chars === 0) errors.push("Input must not be empty.");
  if (chars > max_chars) errors.push(`Input exceeds ${max_chars} characters.`);
  if (max_semicolons !== null && semicolons > max_semicolons) {
    errors.push(`Input exceeds ${max_semicolons} semicolons.`);
  }
  const invalidCharacters = single_line ? /[^\x20-\x7e]/ : /[^\x20-\x7e\n]/;
  if (invalidCharacters.test(input)) {
    errors.push(single_line
      ? "Input must contain printable ASCII only, without newlines."
      : "Input must contain printable ASCII or newlines only.");
  }
  for (const term of bannedFound) errors.push(`Input contains banned substring: ${term}`);

  return { ok: errors.length === 0, chars, semicolons, bannedFound, errors };
}
