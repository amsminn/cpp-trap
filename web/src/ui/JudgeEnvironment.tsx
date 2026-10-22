import type { ReactElement } from "react";
import {
  BASE_FLAGS,
  COMPILE_WALL_SECONDS,
  JUDGE_COMPILER,
  JUDGE_CONCURRENCY,
  LANGUAGE_FLAG,
  OUTPUT_LIMIT_BYTES,
  RUN_CPU_SECONDS,
  RUN_MEMORY_MIB,
  RUN_WALL_SECONDS,
} from "./judgeContract";
import { ScrollRegion } from "./ScrollRegion";

export type JudgeEnvironmentProps = {
  /** Rendered as the labeled "Back to your code" control inside the disclosure; the problem editor focuses its code slot. */
  readonly onReturnToCode?: () => void;
};

/** `-std=c++11` reads as "C++11" and `-std=gnu++11` as "C++11 with GNU extensions"; any other spelling is shown as the flag itself. */
const STANDARD_FLAG = /^-std=(gnu|c)\+\+(\w+)$/;

function describeStandard(flag: string): string {
  const match = STANDARD_FLAG.exec(flag);
  const version = match?.[2];
  if (match === null || version === undefined) return flag;
  return `C++${version}${match[1] === "gnu" ? " with GNU extensions" : ""}`;
}

/**
 * The judge environment as one native disclosure (V031): the problem editor head and About both mount it, so the
 * compiler, flags and limits a solver reads come from ui/judgeContract in both places and cannot drift. Opening it
 * moves nothing: focus stays on the summary, and the flags keep their exact one-line form inside a named scroller
 * (a code line, not a pre block: the editor's pre elements are its skeleton and diagnostics).
 */
export function JudgeEnvironment({ onReturnToCode }: JudgeEnvironmentProps = {}): ReactElement {
  return (
    <details className="env">
      <summary>Environment</summary>
      <dl className="env-facts">
        <dt>Compiler</dt>
        <dd>{JUDGE_COMPILER}</dd>
        <dt>Language</dt>
        <dd>{describeStandard(LANGUAGE_FLAG)} (<code>{LANGUAGE_FLAG}</code>)</dd>
        <dt>Flags</dt>
        <dd>
          <ScrollRegion label="Compiler flags" className="env-flags"><code>{BASE_FLAGS.join(" ")}</code></ScrollRegion>
        </dd>
        <dt>Compile</dt>
        <dd>up to {COMPILE_WALL_SECONDS} s of elapsed time</dd>
        <dt>Run</dt>
        <dd>up to {RUN_WALL_SECONDS} s of elapsed time and {RUN_CPU_SECONDS} s of CPU time</dd>
        <dt>Memory</dt>
        <dd>up to {RUN_MEMORY_MIB} MiB</dd>
        <dt>Output</dt>
        <dd>stdout and stderr are shown up to {OUTPUT_LIMIT_BYTES / 1024} KiB ({OUTPUT_LIMIT_BYTES} bytes) each</dd>
        <dt>Concurrency</dt>
        <dd>one judge runs {JUDGE_CONCURRENCY} submission at a time; a queued submission waits for the one before it to finish</dd>
      </dl>
      {onReturnToCode === undefined ? null : (
        <p className="env-actions">
          <button type="button" className="link-btn env-return" onClick={onReturnToCode}>Back to your code</button>
        </p>
      )}
    </details>
  );
}
