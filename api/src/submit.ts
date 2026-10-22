import { buildSource, checkInput } from "@cpp-trap/shared";
import type { SubmitRequest } from "@cpp-trap/shared";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import { currentUser } from "./auth";
import { problemSecrets, submissions } from "./db/schema";
import type { Env } from "./env";
import { callJudge } from "./judge";
import { loadProblem } from "./queries";
import { decide } from "./verdict";

function isSubmitRequest(value: unknown): value is SubmitRequest {
  return typeof value === "object" && value !== null &&
    "problem" in value && typeof value.problem === "number" &&
    Number.isInteger(value.problem) && value.problem >= 1 &&
    "code" in value && typeof value.code === "string" &&
    "idempotencyKey" in value && typeof value.idempotencyKey === "string" &&
    value.idempotencyKey.length <= 64 &&
    "turnstileToken" in value && typeof value.turnstileToken === "string" &&
    value.turnstileToken.length <= 2048;
}

type Admission = {
  readonly id: string; readonly userId: number; readonly problem: number; readonly code: string;
  readonly chars: number; readonly idempotencyKey: string; readonly verdict: "queued" | "rejected";
  readonly message: string;
};

// One statement counts the window and inserts, so concurrent requests cannot both take the fifth slot.
async function admit(env: Env, row: Admission): Promise<"inserted" | "duplicate" | "limited"> {
  const inserted = await env.DB.prepare(`
    INSERT INTO submissions (id, user_id, problem_number, code, chars, idempotency_key, verdict, message)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
    WHERE (SELECT count(*) FROM submissions WHERE user_id = ?2 AND created_at > ?9) < 5
    ON CONFLICT (user_id, idempotency_key) DO NOTHING RETURNING id
  `).bind(
    row.id, row.userId, row.problem, row.code, row.chars, row.idempotencyKey, row.verdict,
    row.message, new Date(Date.now() - 60_000).toISOString(),
  ).first<{ id: string }>();
  if (inserted) return "inserted";
  const existing = await env.DB.prepare(
    "SELECT 1 AS found FROM submissions WHERE user_id = ? AND idempotency_key = ?",
  ).bind(row.userId, row.idempotencyKey).first<{ found: number }>();
  return existing ? "duplicate" : "limited";
}

function limited(c: Context<{ Bindings: Env }>): Response {
  c.header("Retry-After", "60");
  return c.json({ error: "rate limit reached", retryAfter: 60 }, 429);
}

async function refund(env: Env, day: string, userId: number): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("UPDATE user_daily SET n = max(0, n-1) WHERE day = ? AND user_id = ?")
      .bind(day, userId),
    env.DB.prepare("UPDATE daily_quota SET n = max(0, n-1) WHERE day = ?").bind(day),
  ]);
}

export async function submit(c: Context<{ Bindings: Env }>): Promise<Response> {
  if (c.env.SUBMISSIONS_ENABLED !== "true") return c.json({ error: "submissions paused" }, 503);
  const user = await currentUser(c);
  if (!user) return c.json({ error: "Authentication required" }, 401);
  let input: unknown;
  try {
    input = await c.req.json<unknown>();
  } catch (error) {
    if (error instanceof SyntaxError) return c.json({ error: "invalid submission" }, 400);
    throw error;
  }
  if (!isSubmitRequest(input)) return c.json({ error: "invalid submission" }, 400);
  const problem = await loadProblem(c.env, input.problem);
  if (!problem) return c.json({ error: "invalid problem" }, 400);
  const rate = await c.env.RATE_LIMIT.limit({ key: "u:" + user.id });
  // The binding is per-location and eventually consistent, so D1 enforces the exact window.
  const recent = await c.env.DB.prepare(
    "SELECT count(*) AS n FROM submissions WHERE user_id = ? AND created_at > ?",
  ).bind(user.id, new Date(Date.now() - 60_000).toISOString()).first<{ n: number }>();
  if (!rate.success || (recent?.n ?? 0) >= 5) return limited(c);
  const db = drizzle(c.env.DB);
  const checked = checkInput(problem, input.code);
  if (!checked.ok) {
    const admitted = await admit(c.env, {
      id: crypto.randomUUID(), userId: user.id, problem: input.problem, code: input.code,
      chars: checked.chars, idempotencyKey: input.idempotencyKey, verdict: "rejected",
      message: checked.errors.join(" "),
    });
    if (admitted === "limited") return limited(c);
    return c.json({ error: "input rejected", details: checked.errors }, 400);
  }
  const body = new URLSearchParams({ secret: c.env.TURNSTILE_SECRET, response: input.turnstileToken });
  const remoteip = c.req.header("CF-Connecting-IP");
  if (remoteip) body.set("remoteip", remoteip);
  let verification: unknown;
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", body, signal: AbortSignal.timeout(10_000),
    });
    verification = response.ok ? await response.json<unknown>() : null;
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return c.json({ error: "Turnstile verification failed" }, 403);
  }
  const hostname = new URL(c.req.url).hostname;
  const testingKey = typeof verification === "object" && verification !== null &&
    "metadata" in verification && typeof verification.metadata === "object" &&
    verification.metadata !== null && "result_with_testing_key" in verification.metadata &&
    verification.metadata.result_with_testing_key === true;
  if (typeof verification !== "object" || verification === null ||
      !("success" in verification) || verification.success !== true ||
      (!((hostname === "localhost" || hostname === "127.0.0.1") && testingKey) &&
        (!("hostname" in verification) || verification.hostname !== hostname))) {
    return c.json({ error: "Turnstile verification failed" }, 403);
  }
  const day = new Date().toISOString().slice(0, 10);
  const [, personal] = await c.env.DB.batch<{ n: number }>([
    c.env.DB.prepare("INSERT OR IGNORE INTO user_daily (day, user_id, n) VALUES (?, ?, 0)")
      .bind(day, user.id),
    c.env.DB.prepare("UPDATE user_daily SET n=n+1 WHERE day=? AND user_id=? AND n < ? RETURNING n")
      .bind(day, user.id, Number(c.env.USER_DAILY_LIMIT)),
  ]);
  if (!personal?.results.length) return c.json({ error: "daily limit for you reached" }, 429);
  const [, global] = await c.env.DB.batch<{ n: number }>([
    c.env.DB.prepare("INSERT OR IGNORE INTO daily_quota (day, n) VALUES (?, 0)").bind(day),
    c.env.DB.prepare("UPDATE daily_quota SET n=n+1 WHERE day=? AND n < ? RETURNING n")
      .bind(day, Number(c.env.DAILY_LIMIT)),
  ]);
  if (!global?.results.length) {
    await c.env.DB.prepare("UPDATE user_daily SET n=n-1 WHERE day=? AND user_id=?")
      .bind(day, user.id).run();
    return c.json({ error: "daily limit reached" }, 503);
  }
  const id = crypto.randomUUID();
  let admitted: Awaited<ReturnType<typeof admit>>;
  try {
    admitted = await admit(c.env, {
      id, userId: user.id, problem: input.problem, code: input.code, chars: checked.chars,
      idempotencyKey: input.idempotencyKey, verdict: "queued", message: "",
    });
  } catch (error) {
    await refund(c.env, day, user.id);
    throw error;
  }
  if (admitted === "limited") {
    await refund(c.env, day, user.id);
    return limited(c);
  }
  if (admitted === "duplicate") {
    await refund(c.env, day, user.id);
    const existing = await db.select().from(submissions).where(and(
      eq(submissions.userId, user.id), eq(submissions.idempotencyKey, input.idempotencyKey),
    )).get();
    if (!existing || existing.userId !== user.id) return c.json({ error: "not found" }, 404);
    return c.json({ id: existing.id }, 202);
  }
  const code = input.code;
  c.executionCtx.waitUntil((async () => {
    // This background boundary must leave no submission queued on an infrastructure failure.
    try {
      const secret = await db.select().from(problemSecrets)
        .where(eq(problemSecrets.number, problem.number)).get();
      const flags: readonly string[] = secret ? JSON.parse(secret.flagsJson) : [];
      const result = await callJudge(c.env, {
        source: buildSource(secret?.source ?? problem.skeleton, code), flags,
      });
      if ("unavailable" in result) {
        await db.update(submissions).set({
          verdict: "judge_error", message: "Judge unavailable.", judgedAt: new Date().toISOString(),
        }).where(eq(submissions.id, id));
        await refund(c.env, day, user.id);
        return;
      }
      await db.update(submissions).set({
        ...decide(problem.goal, secret !== undefined, result), judgedAt: new Date().toISOString(),
      }).where(eq(submissions.id, id));
    } catch (error) {
      console.error(crypto.randomUUID(), error instanceof Error ? error.name : "UnknownError");
      await db.update(submissions).set({
        verdict: "judge_error", message: "Judge unavailable.", compilerOutput: null,
        judgedAt: new Date().toISOString(),
      }).where(eq(submissions.id, id));
      await refund(c.env, day, user.id);
    }
  })());
  return c.json({ id }, 202);
}
