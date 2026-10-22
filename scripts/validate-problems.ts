import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";
import { validateProblem } from "@cpp-trap/shared";
import type { Problem } from "@cpp-trap/shared";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === "string");
}

function isProblem(value: unknown): value is Problem {
  if (!isRecord(value)) return false;
  const constraints = value["constraints"];
  const goal = value["goal"];
  return Number.isSafeInteger(value["number"]) && Number(value["number"]) > 0
    && ["slug", "title", "statement", "skeleton", "credit"].every((key) => typeof value[key] === "string")
    && (value["source"] === undefined || typeof value["source"] === "string")
    && (value["notes"] === undefined || typeof value["notes"] === "string")
    && (value["flags"] === undefined || isStrings(value["flags"]))
    && isRecord(constraints)
    && Number.isSafeInteger(constraints["max_chars"]) && Number(constraints["max_chars"]) >= 0
    && (constraints["max_semicolons"] === null
      || (Number.isSafeInteger(constraints["max_semicolons"]) && Number(constraints["max_semicolons"]) >= 0))
    && typeof constraints["single_line"] === "boolean" && isStrings(constraints["banned"])
    && isRecord(goal) && (goal["type"] === "victory"
      || (goal["type"] === "stdout_prefix" && typeof goal["expected"] === "string"));
}

export async function loadProblems(directory: string): Promise<readonly Problem[]> {
  const problems: Problem[] = [];
  const errors: string[] = [];
  const numbers = new Map<number, string>();
  const folders = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const folder of folders) {
    let problem: Problem | undefined;
    let solution: string | undefined;
    try {
      const value: unknown = parse(await readFile(resolve(directory, folder.name, "problem.yaml"), "utf8"));
      if (isProblem(value)) problem = value;
      else errors.push(`${folder.name}: invalid problem.yaml shape`);
    } catch (error) {
      errors.push(`${folder.name}/problem.yaml: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      solution = await readFile(resolve(directory, folder.name, "solution.txt"), "utf8");
    } catch (error) {
      errors.push(`${folder.name}/solution.txt: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!problem) continue;
    const previous = numbers.get(problem.number);
    if (previous) errors.push(`${folder.name}: duplicate number ${problem.number} (also ${previous})`);
    numbers.set(problem.number, folder.name);
    problems.push(problem);
    if (solution !== undefined) {
      for (const error of validateProblem(problem, solution)) errors.push(`${folder.name}: ${error}`);
    }
  }
  if (folders.length === 0) errors.push("No problems found.");
  for (let number = 1; number <= folders.length; number++) {
    if (!numbers.has(number)) errors.push(`Missing problem number ${number}; numbers must be contiguous from 1.`);
  }
  for (const number of numbers.keys()) {
    if (number > folders.length) errors.push(`Problem number ${number} is outside 1..${folders.length}.`);
  }
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
    return [];
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory = process.argv[2];
  if (!directory || process.argv.length !== 3) {
    console.error("Usage: validate-problems.ts <problemsDir>");
    process.exitCode = 1;
  } else {
    try {
      const problems = await loadProblems(directory);
      if (!process.exitCode) console.log(`${problems.length} OK`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
