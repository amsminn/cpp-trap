/**
 * GET /api/problems -> ProblemListItem[]
 * GET /api/problems/:n -> PublicProblem
 * GET /api/me -> MeView
 * POST /api/submit -> 202 SubmitAccepted | ApiError (400/403/429/503)
 * GET /api/submissions/:id -> SubmissionView (owner only, authenticated cookie)
 * DELETE /api/me -> 204 (account deletion)
 * GET /api/health -> HealthView
 * GET /api/me/submissions -> SubmissionView[]
 * GET /api/ranking -> RankingRow[]
 * GET /api/problems/:n/shortest -> ShortestRow[]
 * GET /api/problems/:n/solutions -> SolutionRow[] (401 logged out, 403 not solved)
 * GET /auth/github, GET /auth/github/callback, POST /auth/logout
 */
export type Verdict =
  | "queued"
  | "accepted"
  | "wrong"
  | "compile_error"
  | "runtime_error"
  | "timeout"
  | "judge_error"
  | "rejected";

export type ProblemListItem = {
  readonly number: number;
  readonly title: string;
  readonly maxChars: number;
  readonly solvedCount: number;
  readonly solvedByMe: boolean;
};

export type MeView = {
  readonly login: string;
  readonly avatarUrl: string;
} | null;

// Submitting requires login (D17); only the owner may poll with their cookie.
export type SubmitRequest = {
  readonly problem: number;
  readonly code: string;
  readonly turnstileToken: string;
  readonly idempotencyKey: string;
};

export type SubmitAccepted = { readonly id: string };

export type HealthView = {
  readonly ok: boolean;
  readonly judge: {
    readonly ok: boolean;
    readonly gcc: string;
    readonly version: string;
    readonly sandbox: "B" | "C";
  } | "unreachable";
  readonly today: { readonly used: number; readonly limit: number };
};

export type SubmissionView = {
  readonly id: string;
  readonly problem: number;
  readonly code: string;
  readonly chars: number;
  readonly verdict: Verdict;
  readonly message: string;
  readonly compilerOutput: string | null;
  readonly createdAt: string;
};

export type RankingRow = {
  readonly rank: number;
  readonly login: string;
  readonly solved: number;
};

export type ShortestRow = {
  readonly rank: number;
  readonly login: string;
  readonly chars: number;
};

export type SolutionRow = {
  readonly login: string;
  readonly chars: number;
  readonly code: string;
};

export type ApiError = {
  readonly error: string;
  readonly details?: readonly string[];
  readonly retryAfter?: number;
};
