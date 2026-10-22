import { ALLOWED_FLAGS } from "./contract";
import type { Problem } from "./problem";
import { checkInput } from "./rules";

export function validateProblem(problem: Problem, solution: string): string[] {
  const errors: string[] = [];
  if (problem.skeleton.split("/*INPUT*/").length !== 2) {
    errors.push("Skeleton must contain exactly one /*INPUT*/.");
  }
  if (problem.source !== undefined) {
    if (problem.source.split("/*INPUT*/").length !== 2) {
      errors.push("Source must contain exactly one /*INPUT*/.");
    }
    for (const header of ["unistd.h", "sys/syscall.h"]) {
      if (problem.source.includes(header)) {
        errors.push(`Hidden source must not contain ${header}.`);
      }
    }
  }
  errors.push(...checkInput(problem, solution).errors);
  const { banned } = problem.constraints;
  if (problem.goal.type === "victory" && !banned.includes("victory")) {
    errors.push("Victory goal must ban victory.");
  }
  for (const term of ["popen", "system", "exec"]) {
    if (!banned.includes(term)) errors.push(`Every problem must ban ${term}.`);
  }
  for (const term of banned) {
    if (/[^\x20-\x7e]/.test(term)) {
      errors.push(`Banned substring must be printable ASCII: ${term}`);
    }
  }
  for (const flag of problem.flags ?? []) {
    if (!ALLOWED_FLAGS.some((allowed) => allowed === flag)) {
      errors.push(`Flag is not allowed: ${flag}`);
    }
  }
  return errors;
}
