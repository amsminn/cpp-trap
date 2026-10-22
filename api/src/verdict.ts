import type {
  JudgeResponse,
  Problem,
  Verdict,
} from "@cpp-trap/shared";

export type Decision = {
  readonly verdict: Verdict;
  readonly message: string;
  readonly compilerOutput: string | null;
};

export function decide(
  goal: Problem["goal"],
  hasHiddenSource: boolean,
  res: JudgeResponse,
): Decision {
  if (!res.compile.ok) {
    return {
      verdict: "compile_error",
      message: "Compilation failed.",
      compilerOutput: hasHiddenSource ? null : res.compile.stderr,
    };
  }

  const run = res.run;
  if (run === undefined) {
    return wrong();
  }

  switch (goal.type) {
    case "victory":
      if (run.victory) {
        return accepted();
      }
      break;
    case "stdout_prefix":
      if (run.stdout.startsWith(goal.expected)) {
        return accepted();
      }
      break;
    default: {
      const unreachable: never = goal;
      return unreachable;
    }
  }

  if (run.timedOut) {
    return {
      verdict: "timeout",
      message: "Execution timed out.",
      compilerOutput: null,
    };
  }

  if (run.signal !== null) {
    return {
      verdict: "runtime_error",
      message: "Runtime error.",
      compilerOutput: null,
    };
  }

  return wrong();
}

function accepted(): Decision {
  return {
    verdict: "accepted",
    message: "Nice :)",
    compilerOutput: null,
  };
}

function wrong(): Decision {
  return {
    verdict: "wrong",
    message: "Unfortunately not ;(",
    compilerOutput: null,
  };
}
