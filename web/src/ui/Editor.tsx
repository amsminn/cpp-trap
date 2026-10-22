import { checkInput, type MeView, type PublicProblem, type SubmissionView } from "@cpp-trap/shared";
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link, useLocation } from "react-router-dom";
import { VERDICT } from "../verdict";
import { AuthPrompt } from "./AuthPrompt";
import { Decorative } from "./Decorative";
import { HelpLink } from "./HelpLink";
import { JudgeEnvironment } from "./JudgeEnvironment";
import { RUN_WALL_SECONDS } from "./judgeContract";
import { ScrollRegion } from "./ScrollRegion";
import { Code } from "./highlight";

export type Result =
  | { state: "idle" }
  | { state: "submitting"; code: string }
  | { state: "queued"; id: string; code: string; startedAt: number; elapsedMs: number }
  | { state: "stopped"; id: string; code: string; text: string }
  | { state: "done"; view: SubmissionView; code: string }
  | { state: "error"; text: string; submissionId?: string };

type EditorProps = {
  problem: PublicProblem;
  value: string;
  onChange: (value: string) => void;
  me: MeView | undefined;
  busy: boolean;
  verificationReady: boolean;
  cooldownRemaining: number;
  onSubmit: () => void;
  result: Result;
  onCheckAgain: () => void;
  onStopWaiting: () => void;
  turnstile: ReactNode;
  /** Space-separated ids of the problem's visible input rules; the slot reads them as its description with its live checks. */
  describedBy?: string;
};

const PLACEHOLDER = "/*INPUT*/";

/** The shared validator's alphabet: printable ASCII (space through tilde); multiline problems also accept "\n". */
const PRINTABLE = /^[\x20-\x7e]+$/;
/** Characters that render as nothing or as plain space, named so the diagnostic can point at them. */
const INVISIBLE_NAMES: Readonly<Record<string, string>> = {
  "\t": "tab", "\r": "carriage return", "\n": "newline", "\u00a0": "no-break space", "\u200b": "zero-width space", "\ufeff": "byte order mark",
};
/** Typographic punctuation that compatibility decomposition leaves alone, with its plain ASCII counterpart. */
const TYPOGRAPHIC: Readonly<Record<string, string>> = {
  "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"', "\u2013": "-", "\u2014": "-", "\u00d7": "*", "\u2026": "...",
};

type Offender = { readonly glyph: string; readonly codePoint: string; readonly name: string | null; readonly replacement: string | null; readonly line: number; readonly column: number };

/**
 * Characters the shared validator rejects (the same class as checkInput's test, so validity stays its call),
 * identified by glyph and code point, with a printable replacement when one is known: compatibility decomposition
 * ("²" -> "2", "é" -> "e"), a plain space for any other whitespace, or a typographic counterpart.
 */
function findOffenders(value: string, singleLine: boolean): Offender[] {
  const offenders: Offender[] = [];
  let line = 1;
  let column = 1;
  for (const glyph of value) {
    if (!PRINTABLE.test(glyph) && (singleLine || glyph !== "\n")) {
      const code = glyph.codePointAt(0) ?? 0;
      const decomposed = glyph.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
      const replacement = PRINTABLE.test(decomposed) ? decomposed : /\s/u.test(glyph) ? " " : TYPOGRAPHIC[glyph] ?? null;
      const name = INVISIBLE_NAMES[glyph] ?? (/[\p{Cc}\p{Cf}\p{Z}]/u.test(glyph) ? "invisible character" : null);
      offenders.push({ glyph, codePoint: `U+${code.toString(16).toUpperCase().padStart(4, "0")}`, name, replacement, line, column });
    }
    if (glyph === "\n") { line++; column = 1; }
    else column++;
  }
  return offenders;
}

function OffenderNotice({ offender }: { offender: Offender }) {
  const what = offender.name === null
    ? <>Unsupported character <code className="glyph">{offender.glyph}</code> ({offender.codePoint})</>
    : <>Unsupported character: {offender.name} ({offender.codePoint})</>;
  const position = <> at line {offender.line}, column {offender.column}</>;
  if (offender.glyph === "\n") return <>{what}{position}. Keep your code on one line.</>;
  const guidance = offender.replacement === null
    ? "Replace it with printable ASCII: plain letters, digits, punctuation or spaces."
    : offender.replacement === " "
      ? "Replace it with a plain space."
      : <>Replace it with printable ASCII, for example <code className="glyph">{offender.replacement}</code>.</>;
  return <>{what}{position}. {guidance}</>;
}

/** A visual viewport at least this much shorter than the layout viewport means a virtual keyboard (or an equivalent) covers the page. */
const OBSCURED_MIN = 100;
/** Breathing room kept between the caret line and the edges of the unobscured area when the page is scrolled to reveal it. */
const REVEAL_MARGIN = 8;

/** The caret's line box in viewport coordinates: the whole field for an input, the current line of a textarea (its lines never wrap). */
function caretBox(field: HTMLInputElement | HTMLTextAreaElement): { top: number; bottom: number } {
  const rect = field.getBoundingClientRect();
  if (!(field instanceof HTMLTextAreaElement)) return { top: rect.top, bottom: rect.bottom };
  const style = getComputedStyle(field);
  const lineHeight = parseFloat(style.lineHeight) || rect.height;
  const line = field.value.slice(0, field.selectionStart ?? 0).split("\n").length - 1;
  const top = rect.top + field.clientTop + parseFloat(style.paddingTop) + line * lineHeight - field.scrollTop;
  return { top: Math.max(rect.top, top), bottom: Math.min(rect.bottom, top + lineHeight) };
}

/**
 * Keeps the composition usable while a virtual keyboard covers the page (V035, U07): whenever the slot has focus and the
 * visual viewport is shorter than the layout viewport, the footer (checks and primary action) is docked to the bottom
 * of the unobscured area and the page is scrolled so the caret line sits above it; the footer's place in the panel is
 * held by its anchor, so nothing below it moves. Every visual viewport resize or scroll re-evaluates from the natural
 * layout, so a keyboard that closes undocks; blur alone does not, because the tap that moves focus to the docked action
 * must land on it before the keyboard's own resize undocks. Unmount undocks and removes the listeners. The panel also
 * publishes the visual viewport height as --visual-height, which bounds the multiline field to half of it (V041).
 */
function useVisualViewport(
  panel: RefObject<HTMLElement | null>,
  anchor: RefObject<HTMLDivElement | null>,
  footer: RefObject<HTMLDivElement | null>,
  slot: RefObject<HTMLInputElement | HTMLTextAreaElement | null>,
): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    const section = panel.current;
    const holder = anchor.current;
    const foot = footer.current;
    if (!viewport || !section || !holder || !foot) return;
    let frame = 0;
    let reveal = false;
    const undock = () => {
      foot.classList.remove("ed-foot--docked");
      foot.style.removeProperty("left");
      foot.style.removeProperty("width");
      foot.style.removeProperty("top");
      holder.style.removeProperty("block-size");
    };
    const layout = () => {
      frame = 0;
      const wantReveal = reveal;
      reveal = false;
      section.style.setProperty("--visual-height", `${viewport.height}px`);
      const field = slot.current;
      undock();
      if (!field || document.activeElement !== field) return;
      const obscured = window.innerHeight - viewport.height;
      if (obscured < OBSCURED_MIN || Math.abs(viewport.scale - 1) > 0.01) return;
      const top = viewport.offsetTop;
      const bottom = top + viewport.height;
      const natural = foot.getBoundingClientRect();
      let limit = bottom;
      if (natural.bottom > bottom || natural.top < top) {
        holder.style.blockSize = `${natural.height}px`;
        foot.classList.add("ed-foot--docked");
        foot.style.left = `${section.getBoundingClientRect().left + section.clientLeft}px`;
        foot.style.width = `${section.clientWidth}px`;
        foot.style.top = `${bottom - natural.height}px`;
        limit = bottom - natural.height;
      }
      if (!wantReveal) return;
      // Reveal the whole skeleton when the unobscured area has room for it, otherwise the caret line.
      const code = field.closest("pre")?.getBoundingClientRect();
      const target = code && code.height <= limit - top - 2 * REVEAL_MARGIN ? code : caretBox(field);
      const delta = target.bottom > limit - REVEAL_MARGIN
        ? target.bottom - (limit - REVEAL_MARGIN)
        : target.top < top + REVEAL_MARGIN ? target.top - (top + REVEAL_MARGIN) : 0;
      if (delta !== 0) window.scrollBy({ top: delta, behavior: "instant" });
    };
    const schedule = (withReveal: boolean) => {
      reveal ||= withReveal;
      if (frame === 0) frame = requestAnimationFrame(layout);
    };
    const onResize = () => schedule(true);
    const onScroll = () => schedule(false);
    const onFocus = (event: FocusEvent) => { if (event.target === slot.current) schedule(true); };
    viewport.addEventListener("resize", onResize);
    viewport.addEventListener("scroll", onScroll);
    section.addEventListener("focusin", onFocus);
    schedule(false);
    return () => {
      viewport.removeEventListener("resize", onResize);
      viewport.removeEventListener("scroll", onScroll);
      section.removeEventListener("focusin", onFocus);
      if (frame !== 0) cancelAnimationFrame(frame);
      undock();
      section.style.removeProperty("--visual-height");
    };
  }, [panel, anchor, footer, slot]);
}

export function Editor({ problem, value, onChange, me, busy, verificationReady, cooldownRemaining, onSubmit, result, onCheckAgain, onStopWaiting, turnstile, describedBy }: EditorProps) {
  const [before, after] = problem.skeleton.split(PLACEHOLDER);
  const slotId = useId();
  const checksId = useId();
  const draftHelpId = useId();
  const description = `${describedBy === undefined ? checksId : `${describedBy} ${checksId}`} ${draftHelpId}`;
  const location = useLocation();
  const returnTo = location.pathname + location.search + location.hash;
  const check = checkInput(problem, value);
  const { max_chars, max_semicolons, single_line } = problem.constraints;
  // Presentation only: validity and numeric counts always come from checkInput.
  const offenders = findOffenders(value, single_line);
  const banned = [...new Set(check.bannedFound)];
  const classification = value === "" ? "empty" : check.ok ? "valid" : "invalid";
  const invalid = classification === "invalid";
  const unavailableReason = me === undefined
    ? "Checking your session before submission."
    : !check.ok
      ? value === "" ? "Enter code before submitting." : "Fix the input checks before submitting."
      : busy
        ? "Judging is already in progress."
        : cooldownRemaining > 0
          ? `Wait ${cooldownRemaining} second${cooldownRemaining === 1 ? "" : "s"} before submitting again.`
        : !verificationReady
          ? "Complete the human check before submitting."
          : undefined;
  const submitReady = unavailableReason === undefined;
  const submitReasonId = useId();
  const shortcut = single_line ? "Press Enter to submit." : "Press Ctrl+Enter or Command+Enter to submit; Enter adds a new line.";
  const activateSubmit = () => {
    if (submitReady) onSubmit();
  };
  const keySubmit = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.key !== "Enter") return;
    const wantsSubmit = single_line || event.ctrlKey || event.metaKey;
    if (!wantsSubmit) return;
    event.preventDefault();
    activateSubmit();
  };
  const previousClass = useRef(classification);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (previousClass.current === classification) return;
    previousClass.current = classification;
    setAnnouncement(classification === "empty" ? "Code is empty. Enter your code."
      : classification === "valid" ? "Code meets the input rules."
        : "Code is invalid. Review the checks beside Submit.");
  }, [classification]);
  const lines = value.split("\n");
  const slot = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const setSlot = useCallback((node: HTMLInputElement | HTMLTextAreaElement | null) => { slot.current = node; }, []);
  const focusSlot = useCallback(() => slot.current?.focus(), []);
  const panel = useRef<HTMLElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const foot = useRef<HTMLDivElement>(null);
  useVisualViewport(panel, anchor, foot, slot);
  // The validation area is a bounded box (V041): diagnostics longer than it scroll locally inside a named region that
  // joins the Tab order only while it overflows, like the skeleton's scroller; the text itself stays the slot's description.
  // A finished verdict is brought into view (without moving focus, V091) so it cannot pass unnoticed below the fold.
  const resultArea = useRef<HTMLDivElement>(null);
  const finishedId = result.state === "done" ? result.view.id : null;
  useEffect(() => {
    if (finishedId !== null) resultArea.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [finishedId]);
  const checksBox = useRef<HTMLDivElement>(null);
  const checksText = useRef<HTMLSpanElement>(null);
  const [checksOverflow, setChecksOverflow] = useState(false);
  useLayoutEffect(() => {
    const box = checksBox.current;
    const text = checksText.current;
    if (box === null || text === null) return;
    const measure = () => setChecksOverflow(box.scrollHeight - box.clientHeight > 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(text);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="ed" aria-label="editor" ref={panel}>
      <div className="ed-head">
        <JudgeEnvironment onReturnToCode={focusSlot} />
        <span className={check.ok ? "ok" : "muted"} data-testid="counter">
          {check.chars}/{max_chars} characters
        </span>
      </div>
      <div className="ed-label">
        <label htmlFor={slotId}>Your code</label>
        <span className="ed-required">Required to submit</span>
      </div>
      <ScrollRegion as="pre" label="Program skeleton">
        <Code text={before ?? ""} />
        {/* The box sizes the native field from the text it shows (styles/editor.css replicates data-value in its ::after), so
            spacing overrides widen the field instead of hiding glyphs (V038) and the field itself is the touch target (V039). */}
        <span className={single_line ? "slot-box" : "slot-box slot-box--multiline"} data-value={value === "" ? PLACEHOLDER : value}>
          {single_line ? (
            <input
              ref={setSlot}
              id={slotId}
              className="slot"
              value={value}
              placeholder={PLACEHOLDER}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={keySubmit}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              aria-label="your code"
              aria-required="true"
              aria-describedby={description}
              aria-errormessage={invalid ? checksId : undefined}
              aria-invalid={invalid ? true : undefined}
              aria-keyshortcuts="Enter"
            />
          ) : (
            <textarea
              ref={setSlot}
              id={slotId}
              className="slot slot-multiline"
              rows={lines.length}
              value={value}
              placeholder={PLACEHOLDER}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={keySubmit}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              aria-label="your code"
              aria-required="true"
              aria-describedby={description}
              aria-errormessage={invalid ? checksId : undefined}
              aria-invalid={invalid ? true : undefined}
              aria-keyshortcuts="Control+Enter Meta+Enter"
            />
          )}
        </span>
        <Code text={after ?? ""} />
      </ScrollRegion>
      {me !== null ? <div className="ed-row">{turnstile}</div> : null}
      <div className="ed-foot-anchor" ref={anchor}>
        <div className="ed-foot" ref={foot}>
          <div
            ref={checksBox}
            className="ed-checks"
            tabIndex={checksOverflow ? 0 : undefined}
            role={checksOverflow ? "region" : undefined}
            aria-label={checksOverflow ? "Checks" : undefined}
          >
            <span ref={checksText} id={checksId} className={`ed-checks-text ${check.ok ? "ok" : value ? "bad" : "muted"}`} data-testid="checks">
              {value === ""
                ? "Type your code into the highlighted slot"
                : check.ok
                  ? <><Decorative>✓ </Decorative>Valid input · {max_semicolons === null ? "" : `${check.semicolons}/${max_semicolons} semicolon${max_semicolons === 1 ? "" : "s"} · `}no banned substrings</>
                  : <>
                    <Decorative>✗ </Decorative>Invalid input · {check.chars}/{max_chars} characters
                    {max_semicolons === null ? null : ` · ${check.semicolons}/${max_semicolons} semicolon${max_semicolons === 1 ? "" : "s"}`}
                    {banned.length === 0 ? null : <> · Remove banned substrings: {banned.map((term, index) => <Fragment key={term}>{index > 0 ? ", " : null}<code className="glyph">{term}</code></Fragment>)}</>}
                    {offenders.map((offender, index) => <Fragment key={index}> · <OffenderNotice offender={offender} /></Fragment>)}
                  </>}
            </span>
          </div>
          {me === null ? (
            <div className="ed-login">
              <AuthPrompt returnTo={returnTo} purpose="submit" />
            </div>
          ) : (
            <button
              className="btn"
              type="button"
              aria-disabled={!submitReady}
              aria-describedby={submitReasonId}
              onClick={activateSubmit}
            >
              {busy ? "Judging…" : "Submit code"}
            </button>
          )}
        </div>
      </div>
      <p className="ed-row muted ed-submit-reason" id={submitReasonId}>
        {me === null ? "Log in with GitHub to submit code." : unavailableReason ?? shortcut}
      </p>
      <div className="ed-con" aria-live="polite" ref={resultArea}>
        <Console result={result} problem={problem.number} currentCode={value} me={me} onCheckAgain={onCheckAgain} onStopWaiting={onStopWaiting} />
      </div>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="validation-status">{announcement}</div>
      <p className="ed-row muted" id={draftHelpId}>Drafts are saved per problem in this browser on this device, including after submission. They are not synced to your account.</p>
    </section>
  );
}

function verdictMessage(label: string, message: string): string | null {
  const normalized = (value: string) => value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
  if (normalized(message) === normalized(label) || /^(nice|unfortunately not)\b/i.test(message.trim())) return null;
  return message;
}

function Console({ result, problem, currentCode, me, onCheckAgain, onStopWaiting }: {
  result: Result;
  problem: number;
  currentCode: string;
  me: MeView | undefined;
  onCheckAgain: () => void;
  onStopWaiting: () => void;
}) {
  switch (result.state) {
    case "idle":
      return <span className="muted">{me === null ? "Log in with GitHub to submit code for compilation and judging." : "Submit code to compile and run"}</span>;
    case "submitting":
      return <span className="muted"><Decorative>● </Decorative>Sending submission…</span>;
    case "queued":
      return <>
        <span className="muted"><Decorative>● </Decorative>Queued · compiling and running{result.elapsedMs >= 3000 ? ` · ${Math.floor(result.elapsedMs / 1000)}s elapsed` : "…"}</span>
        <p className="help-action">
          <Link className="inline-link" to={`/p/${problem}?submission=${encodeURIComponent(result.id)}`}>Link to this submission</Link>
          {" · "}<Link className="inline-link" to="/submissions">My submissions</Link>
          {" · "}<button type="button" className="inline-link" onClick={onCheckAgain}>Check again</button>
          {" · "}<button type="button" className="inline-link" onClick={onStopWaiting}>Stop waiting</button>
        </p>
      </>;
    case "stopped":
      return <>
        <span className="warn">{result.text}</span>
        <p className="help-action">
          <button type="button" className="inline-link" onClick={onCheckAgain}>Check again</button>
          {" · "}<Link className="inline-link" to="/submissions">My submissions</Link>
        </p>
      </>;
    case "error":
      return <>
        <span className="bad"><Decorative>● </Decorative>{result.text}</span>
        <p className="help-action"><HelpLink problem={problem} {...(result.submissionId === undefined ? {} : { submissionId: result.submissionId })} /></p>
        {/daily submission limit/i.test(result.text) ? (
          <p className="help-action">
            <Link className="inline-link" to="/">Browse problems</Link>
            {" · "}<Link className="inline-link" to="/submissions">My submissions</Link>
          </p>
        ) : null}
      </>;
    case "done": {
      const { label, tone } = VERDICT[result.view.verdict];
      const message = verdictMessage(label, result.view.message);
      return (
        <>
          <p className={`verdict-banner verdict-banner--${tone}`}>
            <span className="verdict-banner-label"><Decorative>{tone === "ok" ? "✓ " : tone === "warn" ? "! " : "✗ "}</Decorative>{label}</span>
            {result.view.verdict === "judge_error"
              ? <span>The judge could not complete this submission. Try again later, or get operational help if the problem persists.</span>
              : message === null ? null : <span>{message}</span>}
          </p>
          {result.view.verdict === "wrong" ? <p>Revise the code against the problem statement and input rules, then submit the corrected version.</p> : null}
          {result.view.verdict === "runtime_error" ? <p>Review pointer, bounds, and arithmetic behavior, then revise the code before submitting again.</p> : null}
          {result.view.verdict === "timeout" ? <p>The program exceeded the {RUN_WALL_SECONDS}-second execution limit. Reduce its runtime and submit again.</p> : null}
          {result.view.verdict === "judge_error" ? (
            <p className="help-action"><HelpLink problem={problem} submissionId={result.view.id} /></p>
          ) : null}
          {result.view.verdict === "accepted" ? (
            <p className="help-action"><Link className="inline-link" to={`/p/${problem}/solutions`}>See accepted solutions</Link></p>
          ) : null}
          {result.view.verdict !== "judge_error" && result.view.compilerOutput !== null ? (
            <details>
              <summary>Show compiler output</summary>
              <ScrollRegion as="pre" label="Compiler output">{result.view.compilerOutput}</ScrollRegion>
            </details>
          ) : null}
          <details>
            <summary>Submitted code{currentCode === result.code ? "" : " · edited since submission"}</summary>
            <ScrollRegion as="pre" label="Submitted code">{result.code}</ScrollRegion>
          </details>
        </>
      );
    }
  }
}
