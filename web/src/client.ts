import type {
  ApiError,
  MeView,
  ProblemListItem,
  PublicProblem,
  RankingRow,
  ShortestRow,
  SolutionRow,
  SubmissionView,
  SubmitAccepted,
  SubmitRequest,
} from "@cpp-trap/shared";

export class RequestError extends Error {
  readonly name = "RequestError";
  readonly kind: "http" | "network" | "timeout" | "aborted";
  readonly retryAfter: number | undefined;
  readonly submissionId: string | undefined;

  constructor(
    readonly status: number,
    readonly body: ApiError,
    context?: { kind?: RequestError["kind"]; submissionId?: string },
  ) {
    super(body.error);
    this.kind = context?.kind ?? "http";
    this.retryAfter = cooldown(body.retryAfter);
    this.submissionId = context?.submissionId;
  }

  get hint(): string {
    return errorText(this);
  }
}

export type RequestOptions = { readonly signal?: AbortSignal; readonly timeoutMs?: number };
export const REQUEST_TIMEOUT_MS = 15_000;
export const POLL_INTERVAL_MS = 1000;
export const POLL_LIMIT_MS = 45_000;
export type ErrorOperation = "problems" | "problem" | "ranking" | "submissions" | "solutions" | "submit" | "session" | "logout" | "delete";

const OPERATIONS = {
  problems: "loading problems",
  problem: "loading this problem",
  ranking: "loading the leaderboard",
  submissions: "loading your submissions",
  solutions: "loading solutions",
  submit: "sending your submission",
  session: "checking your session",
  logout: "logging out",
  delete: "deleting your account",
} as const;

export function isSessionExpiry(error: unknown): boolean {
  return error instanceof RequestError && error.kind === "http" && error.status === 401;
}

const unauthorizedListeners = new Set<() => void>();

export function subscribeUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => { unauthorizedListeners.delete(listener); };
}

export function errorText(error: unknown, operation?: ErrorOperation): string {
  const action = operation === undefined ? "completing your request" : OPERATIONS[operation];
  if (isSessionExpiry(error)) return `Your session expired while ${action}. Log in with GitHub and try again.`;
  if (error instanceof RequestError) {
    if (error.submissionId !== undefined) {
      return "We couldn't check the result of your submission. Check the same submission in My submissions; do not submit it again.";
    }
    if (error.kind === "http" && (operation === "submit" || operation === undefined)) {
      const code = error.body.error;
      if (error.status === 400 && code === "input rejected") {
        return "Your submission was rejected. Review the problem constraints, correct your code, and submit again.";
      }
      if (error.status === 400 && code === "invalid submission") {
        return "Your submission could not be read. Reload the problem, review your code, and try again.";
      }
      if (error.status === 400 && code === "invalid problem") {
        return "The submission refers to an unavailable problem. Choose a problem from Problems and try again.";
      }
      if (error.status === 403 && code === "Turnstile verification failed") {
        return "Your submission's human check failed. Complete a new human check and submit again.";
      }
      if (error.status === 503 && code === "submissions paused") {
        return "Submission is temporarily paused. Keep your code and try submitting again later.";
      }
      if (error.status === 429 && code === "rate limit reached") {
        return error.retryAfter === undefined
          ? "Your submission must wait. Try submitting again later."
          : `Your submission must wait. Wait ${Math.ceil(error.retryAfter)} seconds before submitting again.`;
      }
      if ((error.status === 429 && code === "daily limit for you reached") ||
          (error.status === 503 && code === "daily limit reached")) {
        // submit.ts keys both quotas by the current UTC day, not the reader's local day.
        const reset = new Date();
        reset.setUTCHours(24, 0, 0, 0);
        const scope = error.status === 429 ? "Your daily submission limit" : "The site's daily submission limit";
        return `${scope} has been reached. It resets at ${reset.toISOString().slice(0, 10)} 00:00 UTC. Keep your code and browse other problems until then.`;
      }
    }
  }
  if (operation === "submit") {
    return "We couldn't confirm your submission. Check My submissions before you retry.";
  }
  return `We had trouble ${action}. Please retry.`;
}

function cooldown(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function retryAfterHeader(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  if (/^\d+(?:\.\d+)?$/.test(value.trim())) return cooldown(Number(value));
  const date = value.includes("GMT") ? Date.parse(value) : NaN;
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1000)) : undefined;
}

function errorBody(value: unknown, header: string | null): ApiError {
  const object = typeof value === "object" && value !== null ? value : {};
  const error = "error" in object && typeof object.error === "string" ? object.error : "invalid error response";
  const details = "details" in object && Array.isArray(object.details) &&
    object.details.every((part: unknown) => typeof part === "string") ? object.details : undefined;
  const retryAfter = cooldown("retryAfter" in object ? object.retryAfter : undefined) ?? retryAfterHeader(header);
  return { error, ...(details === undefined ? {} : { details }), ...(retryAfter === undefined ? {} : { retryAfter }) };
}

type Transport = (url: string, init: RequestInit) => Promise<Response>;

const transport: Promise<Transport> =
  import.meta.env.DEV && import.meta.env.VITE_MOCK
    ? import("./mock").then((mock) => mock.mockFetch)
    : Promise.resolve<Transport>((url, init) => fetch(url, init));

async function request<T>(
  method: string, url: string, body: unknown, options?: RequestOptions,
  context?: { readonly gated?: boolean; readonly submissionId?: string; readonly successStatus?: number },
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  let timedOut = false;
  let response: Response | undefined;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options?.timeoutMs ?? REQUEST_TIMEOUT_MS);
  let rejectAbort: () => void = () => undefined;
  const interrupted = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener("abort", rejectAbort, { once: true });
  });
  options?.signal?.addEventListener("abort", abort, { once: true });
  if (options?.signal?.aborted) controller.abort();
  try {
    return await Promise.race([interrupted, (async () => {
      controller.signal.throwIfAborted();
      const send = await transport;
      controller.signal.throwIfAborted();
      const init: RequestInit = { method, signal: controller.signal };
      if (body !== undefined) {
        init.headers = { "content-type": "application/json" };
        init.body = JSON.stringify(body);
      }
      response = await send(url, init);
      controller.signal.throwIfAborted();
      if (!response.ok) {
        if (response.status === 401 && context?.gated) {
          for (const listener of unauthorizedListeners) listener();
        }
        const parsed: unknown = await response.json().catch((error: unknown) => {
          if (error instanceof SyntaxError) return null;
          throw error;
        });
        throw new RequestError(response.status, errorBody(parsed, response.headers.get("Retry-After")), context);
      }
      if (context?.successStatus !== undefined && response.status !== context.successStatus) {
        throw new RequestError(response.status, { error: "unexpected response status" }, context);
      }
      if (response.status === 204) return undefined as T;
      return await response.json() as T;
    })()]);
  } catch (error) {
    if (error instanceof RequestError) throw error;
    const kind = timedOut ? "timeout" : controller.signal.aborted ? "aborted" : "network";
    throw new RequestError(response?.status ?? 0, { error: kind }, { ...context, kind });
  } finally {
    clearTimeout(timer);
    options?.signal?.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", rejectAbort);
  }
}

export const api = {
  problems: (options?: RequestOptions) => request<ProblemListItem[]>("GET", "/api/problems", undefined, options),
  problem: (number: number, options?: RequestOptions) => request<PublicProblem>("GET", `/api/problems/${number}`, undefined, options),
  shortest: (number: number, options?: RequestOptions) => request<ShortestRow[]>("GET", `/api/problems/${number}/shortest`, undefined, options),
  solutions: (number: number, options?: RequestOptions) => request<SolutionRow[]>("GET", `/api/problems/${number}/solutions`, undefined, options, { gated: true }),
  me: (options?: RequestOptions) => request<MeView>("GET", "/api/me", undefined, options, { gated: true }),
  mySubmissions: (options?: RequestOptions) => request<SubmissionView[]>("GET", "/api/me/submissions", undefined, options, { gated: true }),
  ranking: (options?: RequestOptions) => request<RankingRow[]>("GET", "/api/ranking", undefined, options),
  submit: (body: SubmitRequest, options?: RequestOptions) => request<SubmitAccepted>("POST", "/api/submit", body, options, { gated: true }),
  submission: (id: string, options?: RequestOptions) => request<SubmissionView>("GET", `/api/submissions/${id}`, undefined, options, { gated: true, submissionId: id }),
  deleteAccount: (options?: RequestOptions) => request<void>("DELETE", "/api/me", undefined, options, { gated: true }),
  logout: (options?: RequestOptions) => request<void>("POST", "/auth/logout", undefined, options, { gated: true, successStatus: 204 }),
};

export async function waitForVerdict(
  id: string,
  options?: { signal?: AbortSignal; onQueued?: (view: SubmissionView, elapsedMs: number) => void; deadlineMs?: number },
): Promise<SubmissionView> {
  const started = Date.now();
  const deadline = started + Math.min(options?.deadlineMs ?? POLL_LIMIT_MS, POLL_LIMIT_MS);
  const aborted = () => new RequestError(0, { error: "observation aborted" }, { kind: "aborted", submissionId: id });
  while (Date.now() < deadline) {
    if (options?.signal?.aborted) throw aborted();
    const view = await api.submission(id, {
      ...(options?.signal === undefined ? {} : { signal: options.signal }),
      timeoutMs: Math.min(REQUEST_TIMEOUT_MS, deadline - Date.now()),
    });
    if (view.verdict !== "queued") return view;
    options?.onQueued?.(view, Date.now() - started);
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        options?.signal?.removeEventListener("abort", abort);
        reject(aborted());
      };
      const timer = setTimeout(() => {
        options?.signal?.removeEventListener("abort", abort);
        resolve();
      }, Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())));
      options?.signal?.addEventListener("abort", abort, { once: true });
      if (options?.signal?.aborted) abort();
    });
  }
  if (options?.signal?.aborted) throw aborted();
  throw new RequestError(504, { error: "observation deadline reached" }, { kind: "timeout", submissionId: id });
}
