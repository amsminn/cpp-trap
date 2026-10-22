import type { MeView } from "@cpp-trap/shared";
import { Fragment, type CSSProperties, type ReactElement } from "react";
import { HUMAN_CHECK_EXPLANATION, HUMAN_CHECK_NAME } from "./HumanCheck";
import { ScrollRegion } from "./ScrollRegion";

export const PLACEHOLDER_ROWS = 5;

/** A text-shaped block; `width` is a CSS length in the host font's ch or em so the silhouette follows the type scale. */
export function Bar({ width }: { width: string }): ReactElement {
  return <span className="bar" style={{ "--bar-w": width } as CSSProperties} />;
}

function Bars({ widths, separator = " " }: { widths: readonly string[]; separator?: string }): ReactElement {
  return (
    <>
      {widths.map((width, index) => (
        <Fragment key={index}>
          {index === 0 ? null : separator}
          <Bar width={width} />
        </Fragment>
      ))}
    </>
  );
}

export type PlaceholderColumn = { readonly head: string; readonly bar: string | null; readonly num?: boolean };

/** Five fixed-height rows in the shared table frame. The first row stays empty: the route status overlays it.
    tabIndex -1 keeps Chrome from turning the overflowing phone wrapper into a keyboard stop. */
export function TablePlaceholder({ columns, rows = PLACEHOLDER_ROWS }: { columns: readonly PlaceholderColumn[]; rows?: number }): ReactElement {
  return (
    <div className="placeholder placeholder-table table-wrap" aria-hidden="true" tabIndex={-1}>
      <table className="table">
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th key={index} className={column.num ? "num" : undefined}>{column.head}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, row) => (
            <tr key={row}>
              {columns.map((column, index) => (
                <td key={index} className={column.num ? "num" : undefined}>
                  {row === 0 || column.bar === null ? null : <Bar width={column.bar} />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SOLUTION_CODE_WIDTHS = ["11ch", "16ch", "18ch", "15ch", "13ch"] as const;

/** Five solution blocks (heading plus code). The first heading stays empty: the route status overlays it. */
export function SolutionsPlaceholder({ rows = PLACEHOLDER_ROWS }: { rows?: number }): ReactElement {
  return (
    <div className="placeholder" aria-hidden="true">
      {Array.from({ length: rows }, (_, row) => (
        <section key={row}>
          <h2 className={row === 0 ? "placeholder-slot" : undefined}>{row === 0 ? null : <Bar width="9em" />}</h2>
          <pre className="code-light"><Bar width={SOLUTION_CODE_WIDTHS[row % SOLUTION_CODE_WIDTHS.length] ?? SOLUTION_CODE_WIDTHS[0]} /></pre>
        </section>
      ))}
    </div>
  );
}

const BANNED_TOKEN_WIDTHS = ["3.5em", "3.5em", "1.5em", ".5em", ".5em", ".5em", ".5em", "2.5em", "3em", "2em"] as const;
const CREDIT_WORD_WIDTHS = ["4em", "3.5em", "1em", "3em", "9em", "4em", "2em", "5em", "2.5em"] as const;
const SHORTEST_ROWS = 3;

/** A normal single-line problem's rule chips, using the ready chip and literal metrics. */
export function RulesPlaceholder(): ReactElement {
  return (
    <ul className="rules placeholder" aria-hidden="true">
      <li><span className="placeholder-text">At most 00 characters; spaces count</span></li>
      <li><span className="placeholder-text">One line only; no newlines</span></li>
      <li><span className="placeholder-text">Printable ASCII only: plain letters, digits, punctuation and spaces</span></li>
      <li><span className="placeholder-text">At most 1 semicolon</span></li>
      <li className="rules-banned">
        <span className="placeholder-text">Must not contain</span>
        {[4, 7, 3, 1, 1, 1, 1, 5, 6, 4].map((length, index) => <code key={index}><span className="placeholder-text">{"x".repeat(length)}</span></code>)}
      </li>
    </ul>
  );
}

/** The problem card below its statement: constraint chips, the shortest-solutions list, the unlock line and the credit. */
export function ProblemPlaceholder(): ReactElement {
  return (
    <div className="placeholder" aria-hidden="true">
      <div className="chips">
        <span><Bar width="4.5em" /></span>
        <span><Bar width="5.5em" /></span>
        <span><Bars widths={BANNED_TOKEN_WIDTHS} separator=" · " /></span>
      </div>
      <h2><Bar width="9em" /></h2>
      <p className="muted placeholder-text">Ranked by shortest accepted code. Equal character counts share a rank; tied users are listed by login.</p>
      <div className="lb">
        {Array.from({ length: SHORTEST_ROWS }, (_, row) => (
          <div key={row}>
            <span className="who"><Bar width="7em" /></span>
            <span className="mono"><Bar width="2ch" /></span>
          </div>
        ))}
      </div>
      <p><Bar width="16em" /></p>
      <p className="credit"><Bars widths={CREDIT_WORD_WIDTHS} /></p>
    </div>
  );
}

const SLOT_PLACEHOLDER = "/*INPUT*/";
/** The normal fixture skeleton silhouette: eight lines with the code slot on the fifth (app/web/src/ui/Editor.tsx); the
    sixth line is exactly as wide as /p/3's longest line, so the silhouette overflows when the real skeleton does. */
const SKELETON_LINES: readonly { indent: string; width: string | null }[] = [
  { indent: "", width: "10ch" },
  { indent: "", width: "1ch" },
  { indent: "  ", width: "28ch" },
  { indent: "  ", width: "28ch" },
  { indent: "  ", width: null },
  { indent: "  ", width: "44ch" },
  { indent: "  ", width: "11ch" },
  { indent: "", width: "1ch" },
];

/** The editor panel with the same grid, padding and font metrics as the real one; the slot and action are not controls. */
export function EditorPlaceholder({ me }: { me: MeView | undefined }): ReactElement {
  return (
    <section className="ed placeholder" aria-hidden="true">
      <div className="ed-head">
        <span><Bar width="14ch" /></span>
        <span><Bar width="6ch" /></span>
      </div>
      <div className="ed-label">
        <span className="placeholder-text">Your code</span>
        <span className="placeholder-text">Required to submit</span>
      </div>
      <ScrollRegion as="pre" label="Program skeleton">
        {SKELETON_LINES.map((line, index) => (
          <Fragment key={index}>
            {line.indent}
            {line.width === null ? (
              <span className="slot-box" data-value={SLOT_PLACEHOLDER}><span className="slot"><span className="placeholder-text">{SLOT_PLACEHOLDER}</span></span></span>
            ) : (
              <Bar width={line.width} />
            )}
            {"\n"}
          </Fragment>
        ))}
      </ScrollRegion>
      {me !== null ? (
        <div className="ed-row">
          <div className="verification-frame">
            <p className="human-check-caption placeholder-text"><strong>{HUMAN_CHECK_NAME}</strong> · <span>{HUMAN_CHECK_EXPLANATION}</span></p>
            <div className="turnstile" />
            <div className="human-check-status"><span className="placeholder-text">Loading human check…</span></div>
            <p className="help-action"><span className="inline-link placeholder-text">Help</span></p>
          </div>
        </div>
      ) : null}
      <div className="ed-foot">
        <div className="ed-checks"><span className="ed-checks-text"><Bar width="18em" /></span></div>
        {me === null ? (
          <span className="auth-prompt">
            <span className="btn"><span className="placeholder-text">Log in with GitHub to submit</span></span>
            <span><span className="inline-link placeholder-text">Privacy</span></span>
          </span>
        ) : (
          <span className="btn"><span className="placeholder-text">Submit code</span></span>
        )}
      </div>
      <p className="ed-row muted ed-submit-reason"><span className="placeholder-text">{me === null ? "Log in with GitHub to submit code." : "Enter code before submitting."}</span></p>
      <p className="ed-row muted"><span className="placeholder-text">Drafts are saved per problem in this browser on this device, including after submission. They are not synced to your account.</span></p>
      <div className="ed-con"><span className="placeholder-text">{me === null ? "Log in with GitHub to submit code for compilation and judging." : "Submit code to compile and run"}</span></div>
    </section>
  );
}
