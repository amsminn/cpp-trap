// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { buildSource } from "@cpp-trap/shared";
import type { JudgeRequest, JudgeResponse, Problem } from "@cpp-trap/shared";
import { describe, expect, test } from "vitest";
import { parse } from "yaml";

const problemsDir = resolve(process.env["PROBLEMS_DIR"] ?? "../../problems");
const judgeUrl = process.env["JUDGE_URL"] ?? "http://localhost:8080";
const problems = readdirSync(problemsDir, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && existsSync(resolve(problemsDir, entry.name, "problem.yaml")))
  .sort((left, right) => left.name.localeCompare(right.name))
  .map(entry => {
    const directory = resolve(problemsDir, entry.name);
    const problem: Problem = parse(readFileSync(resolve(directory, "problem.yaml"), "utf8"));
    const solution = readFileSync(resolve(directory, "solution.txt"), "utf8");
    const alternativesFile = resolve(directory, "alternatives.yaml");
    const alternatives: readonly Alternative[] = existsSync(alternativesFile)
      ? parse(readFileSync(alternativesFile, "utf8")) ?? []
      : [];
    return { problem, solution, alternatives };
  });

if (problems.length === 0) throw new Error("no problems found");

// Solutions known from the original site, with the outcome recorded for the pinned judge (problems repo alternatives.yaml).
type Alternative = { readonly code: string; readonly source: string; readonly expected: "accepted" | "rejected"; readonly reason?: string };

async function judge(request: JudgeRequest): Promise<JudgeResponse> {
  const response = await fetch(`${judgeUrl.replace(/\/$/, "")}/judge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(40_000),
  });
  expect(response.status).toBe(200);
  return response.json();
}

function accepted(problem: Problem, result: JudgeResponse): boolean {
  switch (problem.goal.type) {
    case "victory":
      return result.run?.victory === true;
    case "stdout_prefix":
      return result.run?.stdout.startsWith(problem.goal.expected) === true;
  }
}

// The judge is single-flight, so every request must finish before the next starts.
describe("references", { concurrent: false }, () => {
  for (const { problem, solution } of problems) {
    test(problem.slug, async () => {
      const source = buildSource(problem.source ?? problem.skeleton, solution);
      const result = await judge({ source, ...(problem.flags ? { flags: problem.flags } : {}) });
      expect(accepted(problem, result)).toBe(true);
    }, 45_000);
  }
});

const alternatives = problems.flatMap(({ problem, alternatives: list }) => list.map((alternative, index) => ({ problem, alternative, index })));
if (alternatives.length > 0) {
  describe("alternatives", { concurrent: false }, () => {
    for (const { problem, alternative, index } of alternatives) {
      test(`${problem.slug} #${index + 1} ${alternative.expected}`, async () => {
        const source = buildSource(problem.source ?? problem.skeleton, alternative.code);
        const result = await judge({ source, ...(problem.flags ? { flags: problem.flags } : {}) });
        expect(accepted(problem, result)).toBe(alternative.expected === "accepted");
      }, 45_000);
    }
  });
}

describe("probes", { concurrent: false }, () => {
  test("wrong-answer", async () => {
    const first = problems.find(({ problem }) => problem.number === 1);
    if (!first) throw new Error("problem 1 not found");
    const { problem } = first;
    const source = buildSource(problem.source ?? problem.skeleton, "int z=1;");
    const result = await judge({ source, ...(problem.flags ? { flags: problem.flags } : {}) });
    expect(result.compile.ok).toBe(true);
    expect(accepted(problem, result)).toBe(false);
  }, 45_000);

  test("timeout", async () => {
    const result = await judge({ source: "int main(){while(1);}" });
    expect(result.run?.timedOut).toBe(true);
  }, 45_000);

  test("compile-error", async () => {
    const result = await judge({ source: "int main(){ syntax error" });
    expect(result.compile.ok).toBe(false);
    expect(result.compile.stderr.length > 0).toBe(true);
  }, 45_000);

  test("segmentation-fault", async () => {
    const result = await judge({ source: "int main(){*(volatile int*)0=1;}" });
    expect(result.run?.signal === "SIGSEGV").toBe(true);
  }, 45_000);

  test("stdout-forgery", async () => {
    const result = await judge({ source: '#include <cstdio>\nint main(){puts("victory");}' });
    expect(result.run?.victory).toBe(false);
  }, 45_000);

  test("token-forgery", async () => {
    const result = await judge({
      source: '#include <unistd.h>\nint main(){write(3,"0123456789abcdef0123456789abcdef",32);}',
    });
    expect(result.run?.victory).toBe(false);
  }, 45_000);
});
