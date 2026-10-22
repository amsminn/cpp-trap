import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProblems } from "./validate-problems";

type Query = {
  readonly sql: string;
  readonly params: readonly string[];
};

type QueryResult = {
  readonly success?: boolean;
  readonly results?: readonly { readonly number: number }[];
};

function isQueryResults(value: unknown): value is readonly QueryResult[] {
  return Array.isArray(value) && value.every((item: unknown) =>
    typeof item === "object" && item !== null && "success" in item && typeof item.success === "boolean"
    && (!("results" in item) || (Array.isArray(item.results) && item.results.every((row: unknown) =>
      typeof row === "object" && row !== null && "number" in row && typeof row.number === "number"))));
}

const appDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main(): Promise<void> {
  const [directory, flag, ...extra] = process.argv.slice(2);
  if (!directory || (flag !== undefined && flag !== "--local") || extra.length > 0) {
    console.error("Usage: sync-problems.ts <problemsDir> [--local]");
    process.exitCode = 1;
    return;
  }
  const problems = await loadProblems(directory);
  if (process.exitCode) return;
  const batch: Query[] = [{ sql: "SELECT number FROM problems", params: [] }];
  for (const problem of problems) {
    // Explicit allowlist: neither solutions, author notes nor unknown YAML keys can be uploaded.
    batch.push({
      sql: `INSERT INTO problems
        (number, slug, title, statement, skeleton, constraints_json, goal_json, credit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(number) DO UPDATE SET slug=excluded.slug, title=excluded.title,
        statement=excluded.statement, skeleton=excluded.skeleton,
        constraints_json=excluded.constraints_json, goal_json=excluded.goal_json,
        credit=excluded.credit, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      params: [
        String(problem.number), problem.slug, problem.title, problem.statement, problem.skeleton,
        JSON.stringify(problem.constraints), JSON.stringify(problem.goal), problem.credit,
      ],
    });
    batch.push(problem.source !== undefined || problem.flags !== undefined ? {
      sql: `INSERT INTO problem_secrets (number, source, flags_json) VALUES (?, ?, ?)
        ON CONFLICT(number) DO UPDATE SET source=excluded.source, flags_json=excluded.flags_json`,
      params: [String(problem.number), problem.source ?? problem.skeleton, JSON.stringify(problem.flags ?? [])],
    } : {
      sql: "DELETE FROM problem_secrets WHERE number = ?",
      params: [String(problem.number)],
    });
  }

  let results: readonly QueryResult[];
  if (flag === "--local") {
    const temporary = await mkdtemp(join(tmpdir(), "cpp-trap-sync-"));
    try {
      // Wrangler's SQL-file interface has no params option. Encode bound text as UTF-8 hex
      // literals for this local-only transport; the HTTP batch keeps every value in params.
      const sql = batch.map((query) => {
        let index = 0;
        return query.sql.replace(/\?/g, () => {
          const value = query.params[index++];
          if (value === undefined) throw new RangeError("Missing SQL parameter");
          return `CAST(X'${Buffer.from(value, "utf8").toString("hex")}' AS TEXT)`;
        }) + ";";
      }).join("\n");
      const file = join(temporary, "problems.sql");
      await writeFile(file, sql, { mode: 0o600 });
      const output = execFileSync("npx", [
        "wrangler", "d1", "execute", "cpp-trap", "--local", "--file", file, "--json",
      ], { cwd: appDirectory, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
      const parsed: unknown = JSON.parse(output);
      if (!isQueryResults(parsed)) throw new TypeError("Invalid local D1 response");
      results = parsed;
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  } else {
    const token = process.env["CLOUDFLARE_API_TOKEN"];
    const account = process.env["CLOUDFLARE_ACCOUNT_ID"];
    const database = process.env["D1_DATABASE_ID"];
    if (!token || !account || !database) {
      console.error("Set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and D1_DATABASE_ID.");
      process.exitCode = 1;
      return;
    }
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/d1/database/${encodeURIComponent(database)}/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ batch }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!response.ok) {
      console.error(`D1 HTTP query failed (${response.status}).`);
      process.exitCode = 1;
      return;
    }
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || !("success" in body) || body.success !== true
      || !("result" in body) || !isQueryResults(body.result)) {
      console.error("D1 query batch failed.");
      process.exitCode = 1;
      return;
    }
    results = body.result;
  }
  if (results.length !== batch.length || results.some((result) => !result.success)) {
    console.error("D1 query batch failed.");
    process.exitCode = 1;
    return;
  }
  const present = new Set(problems.map((problem) => problem.number));
  for (const row of results[0]?.results ?? []) {
    if (!present.has(row.number)) console.warn(`Warning: problem ${row.number} has no folder; database rows retained.`);
  }
  console.log(`Synced ${problems.length} problems (${problems.filter((problem) =>
    problem.source !== undefined || problem.flags !== undefined).length} secret rows).`);
}

try {
  await main();
} catch (error) {
  // Do not print subprocess SQL, response bodies, source, or reference solutions.
  console.error(error instanceof Error ? `Sync failed: ${error.name}` : "Sync failed.");
  process.exitCode = 1;
}
