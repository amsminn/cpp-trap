/**
 * POST /judge: 200 for every judged run, including compile errors and timeouts;
 * 400 for a bad flag/body, 503 when busy, 500 for a judge bug.
 * GET /health: JudgeHealth {ok, version, gcc, sandbox, oomProtected}.
 */
export type JudgeRequest = {
  readonly source: string;
  readonly flags?: readonly string[];
};

export type JudgeResponse = {
  readonly judge: { readonly version: string; readonly gcc: string };
  readonly compile: {
    readonly ok: boolean;
    readonly ms: number;
    readonly stderr: string;
  };
  readonly run?: {
    readonly exitCode: number | null;
    readonly signal: string | null;
    readonly timedOut: boolean;
    readonly ms: number;
    readonly stdout: string;
    readonly stderr: string;
    readonly victory: boolean;
  };
};

export type JudgeHealth = {
  readonly ok: boolean;
  readonly version: string;
  readonly gcc: string;
  readonly sandbox: "B" | "C";
  readonly oomProtected: boolean;
};

export const ALLOWED_FLAGS = [
  "-O0", "-O1", "-O2", "-O3", "-Os",
  "-std=c++11", "-std=gnu++11", "-std=c++14", "-std=gnu++14",
  "-trigraphs", "-fno-stack-protector", "-fpermissive", "-w",
] as const;

// The inferred original environment: GCC 4.9 (non-PIE, no CET by default), strict C++11 so trigraphs are
// translated as on the original site, -O0, and no stack protector for the stack and return-address puzzles.
export const BASE_FLAGS = [
  "-std=c++11",
  "-O0",
  "-fno-stack-protector",
  "-w",
  "-fmax-errors=5",
] as const;
