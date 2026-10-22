export type Problem = {
  readonly number: number;
  readonly slug: string;
  readonly title: string;
  readonly statement: string;
  readonly skeleton: string;
  readonly source?: string;
  readonly constraints: {
    readonly max_chars: number;
    readonly max_semicolons: number | null;
    readonly single_line: boolean;
    readonly banned: readonly string[];
  };
  readonly goal:
    | { readonly type: "victory" }
    | { readonly type: "stdout_prefix"; readonly expected: string };
  readonly flags?: readonly string[];
  readonly credit: string;
  readonly notes?: string;
};

export type PublicProblem = Omit<Problem, "source" | "flags" | "notes">;

export function toPublic(problem: Problem): PublicProblem {
  const { source, flags, notes, ...publicProblem } = problem;
  return publicProblem;
}
