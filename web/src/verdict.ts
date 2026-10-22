import type { Verdict } from "@cpp-trap/shared";

export type Tone = "ok" | "bad" | "warn" | "muted";

export const VERDICT: Record<Verdict, { label: string; tone: Tone }> = {
  queued: { label: "Queued", tone: "muted" },
  accepted: { label: "Accepted", tone: "ok" },
  wrong: { label: "Wrong answer", tone: "bad" },
  compile_error: { label: "Compile error", tone: "bad" },
  runtime_error: { label: "Runtime error", tone: "bad" },
  timeout: { label: "Time limit exceeded", tone: "bad" },
  judge_error: { label: "Judge error", tone: "warn" },
  rejected: { label: "Rejected", tone: "bad" },
};
