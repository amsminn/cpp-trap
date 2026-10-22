import { toPublic } from "@cpp-trap/shared";
import type {
  HealthView, Problem, ProblemListItem, RankingRow, ShortestRow,
  SolutionRow, SubmissionView,
} from "@cpp-trap/shared";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import { currentUser } from "./auth";
import { problems, submissions } from "./db/schema";
import type { Env } from "./env";
import { judgeHealth } from "./judge";

type ApiContext = Context<{ Bindings: Env }>;

export async function loadProblem(env: Env, number: number): Promise<Problem | null> {
  if (!Number.isInteger(number) || number < 1) return null;
  const row = await drizzle(env.DB).select().from(problems).where(eq(problems.number, number)).get();
  if (!row) return null;
  // These JSON columns are validated by the problem-sync authoring boundary.
  const constraints: Problem["constraints"] = JSON.parse(row.constraintsJson);
  const goal: Problem["goal"] = JSON.parse(row.goalJson);
  return {
    number: row.number, slug: row.slug, title: row.title, statement: row.statement,
    skeleton: row.skeleton, constraints, goal, credit: row.credit,
  };
}

export async function problemList(c: ApiContext): Promise<Response> {
  const user = await currentUser(c);
  const rows = await c.env.DB.prepare(`
    SELECT p.number, p.title,
      json_extract(p.constraints_json, '$.max_chars') AS maxChars,
      (SELECT count(DISTINCT user_id) FROM submissions
        WHERE problem_number = p.number AND verdict = 'accepted') AS solvedCount,
      EXISTS(SELECT 1 FROM submissions WHERE problem_number = p.number
        AND verdict = 'accepted' AND user_id = ?) AS solvedByMe
    FROM problems p ORDER BY p.number
  `).bind(user?.id ?? null).all<Omit<ProblemListItem, "solvedByMe"> & { solvedByMe: number }>();
  return c.json(rows.results.map((row) => ({ ...row, solvedByMe: row.solvedByMe === 1 })));
}

export async function problem(c: ApiContext): Promise<Response> {
  const value = await loadProblem(c.env, Number(c.req.param("n")));
  return value ? c.json(toPublic(value)) : c.json({ error: "not found" }, 404);
}

export async function me(c: ApiContext): Promise<Response> {
  const user = await currentUser(c);
  return c.json(user ? { login: user.login, avatarUrl: user.avatarUrl ?? "" } : null);
}

export async function ranking(c: ApiContext): Promise<Response> {
  const rows = await c.env.DB.prepare(`
    SELECT rank() OVER (ORDER BY count(DISTINCT s.problem_number) DESC) AS rank,
      u.login, count(DISTINCT s.problem_number) AS solved
    FROM users u JOIN submissions s ON s.user_id = u.id AND s.verdict = 'accepted'
    GROUP BY u.id ORDER BY solved DESC, u.login, u.id
  `).all<RankingRow>();
  return c.json(rows.results);
}

export async function shortest(c: ApiContext): Promise<Response> {
  const number = Number(c.req.param("n"));
  if (!await loadProblem(c.env, number)) return c.json({ error: "not found" }, 404);
  const rows = await c.env.DB.prepare(`
    SELECT rank() OVER (ORDER BY min(s.chars)) AS rank, u.login, min(s.chars) AS chars
    FROM submissions s JOIN users u ON u.id = s.user_id
    WHERE s.problem_number = ? AND s.verdict = 'accepted'
    GROUP BY u.id ORDER BY chars, u.login, u.id
  `).bind(number).all<ShortestRow>();
  return c.json(rows.results);
}

export async function solutions(c: ApiContext): Promise<Response> {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "Authentication required" }, 401);
  const number = Number(c.req.param("n"));
  if (!await loadProblem(c.env, number)) return c.json({ error: "not found" }, 404);
  const solved = await drizzle(c.env.DB).select({ userId: submissions.userId }).from(submissions)
    .where(and(eq(submissions.userId, user.id), eq(submissions.problemNumber, number),
      eq(submissions.verdict, "accepted"))).get();
  if (!solved || solved.userId !== user.id) return c.json({ error: "solve this problem first" }, 403);
  const rows = await c.env.DB.prepare(`
    SELECT login, chars, code FROM (
      SELECT u.login, s.chars, s.code,
        row_number() OVER (PARTITION BY s.user_id ORDER BY s.chars, s.created_at, s.id) AS choice
      FROM submissions s JOIN users u ON u.id = s.user_id
      WHERE s.problem_number = ? AND s.verdict = 'accepted' AND s.user_id != ?
    ) WHERE choice = 1 ORDER BY chars, login
  `).bind(number, user.id).all<SolutionRow>();
  return c.json(rows.results);
}

function submissionView(row: typeof submissions.$inferSelect): SubmissionView {
  return {
    id: row.id, problem: row.problemNumber, code: row.code, chars: row.chars, verdict: row.verdict,
    message: row.message, compilerOutput: row.compilerOutput, createdAt: row.createdAt,
  };
}

export async function mySubmissions(c: ApiContext): Promise<Response> {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "Authentication required" }, 401);
  const rows = await drizzle(c.env.DB).select().from(submissions)
    .where(eq(submissions.userId, user.id)).orderBy(desc(submissions.createdAt), desc(submissions.id));
  return c.json(rows.filter((row) => row.userId === user.id).map(submissionView));
}

export async function submission(c: ApiContext): Promise<Response> {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "not found" }, 404);
  const row = await drizzle(c.env.DB).select().from(submissions)
    .where(eq(submissions.id, c.req.param("id") ?? "")).get();
  if (!row || row.userId !== user.id) return c.json({ error: "not found" }, 404);
  return c.json(submissionView(row));
}

export async function health(c: ApiContext): Promise<Response> {
  let judge: HealthView["judge"];
  try {
    judge = await judgeHealth(c.env);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    judge = "unreachable";
  }
  const row = await c.env.DB.prepare("SELECT n FROM daily_quota WHERE day = ?")
    .bind(new Date().toISOString().slice(0, 10)).first<{ n: number }>();
  return c.json({
    ok: judge !== "unreachable" && judge.ok,
    judge, today: { used: row?.n ?? 0, limit: Number(c.env.DAILY_LIMIT) },
  } satisfies HealthView);
}
