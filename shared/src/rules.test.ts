import { describe, expect, it } from "vitest";
import type { PublicProblem } from "./problem";
import { checkInput } from "./rules";

const problem: PublicProblem = {
  number: 1,
  slug: "fixture",
  title: "Fixture",
  statement: "Fixture",
  skeleton: "/*INPUT*/",
  constraints: {
    max_chars: 4,
    max_semicolons: 0,
    single_line: true,
    banned: ["victory", "#"],
  },
  goal: { type: "victory" },
  credit: "Fixture",
};

describe("checkInput", () => {
  it("accepts the character limit and rejects limit plus one", () => {
    // Given
    const inputs = ["abcd", "abcde"];
    // When
    const results = inputs.map((input) => checkInput(problem, input));
    // Then
    expect(results.map(({ ok, chars }) => ({ ok, chars }))).toEqual([
      { ok: true, chars: 4 },
      { ok: false, chars: 5 },
    ]);
  });

  it("finds a banned substring inside a longer token", () => {
    // Given
    const fixture = { ...problem, constraints: { ...problem.constraints, max_chars: 30 } };
    // When
    const result = checkInput(fixture, "myvictorytoken");
    // Then
    expect(result.bannedFound).toEqual(["victory"]);
    expect(result.ok).toBe(false);
  });

  it("accepts %:define when only # is banned", () => {
    // Given
    const fixture = {
      ...problem,
      constraints: { ...problem.constraints, max_chars: 30, banned: ["#"] },
    };
    // When
    const result = checkInput(fixture, "%:define");
    // Then
    expect(result.ok).toBe(true);
    expect(result.bannedFound).toEqual([]);
  });

  it("rejects semicolons over the limit", () => {
    // Given
    const input = "a;";
    // When
    const result = checkInput(problem, input);
    // Then
    expect(result.semicolons).toBe(1);
    expect(result.ok).toBe(false);
  });

  it("rejects a newline when single_line is enabled", () => {
    // Given
    const input = "a\n";
    // When
    const result = checkInput(problem, input);
    // Then
    expect(result.ok).toBe(false);
  });

  it("rejects non-ASCII input", () => {
    // Given
    const input = "\u00e9";
    // When
    const result = checkInput(problem, input);
    // Then
    expect(result.ok).toBe(false);
  });
});
