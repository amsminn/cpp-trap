import { useCallback, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react";

export type ScrollRegionProps = {
  /** The region's accessible name while it is focusable, e.g. "Program skeleton" (what the keyboard user has reached). */
  readonly label: string;
  readonly children: ReactNode;
  readonly className?: string;
  /** "pre" keeps exact whitespace (code); "div" wraps block content such as a table. */
  readonly as?: "div" | "pre";
};

const HINT = "Scroll sideways to see the rest.";

type Measured = { readonly overflow: boolean; readonly hidden: boolean };

/**
 * A local horizontal scroller for exact content that must not wrap (V028/V093): code and tables. While the content is
 * wider than the box, the element is a named region in the Tab order (tabindex 0, role region, aria-label), shows the
 * scroll hint below itself and scrolls natively with the arrow keys; while the content fits, none of that is rendered,
 * so a fitting region adds no Tab stop. Overflow is read from the sizing box around the children, which takes the
 * longest line (or a table's narrowest layout) and never less than the scroller, so a resize, a font swap, a spacing
 * override or a content change all re-evaluate it through one ResizeObserver. Inside aria-hidden content (a loading
 * placeholder) the region keeps the hint for its geometry but is never focusable or named: tabindex -1 stops Chrome
 * from making an overflowing scroller an implicit keyboard stop there.
 */
export function ScrollRegion({ label, children, className, as = "div" }: ScrollRegionProps): ReactElement {
  const scroller = useRef<HTMLElement | null>(null);
  const content = useRef<HTMLElement | null>(null);
  const [{ overflow, hidden }, setMeasured] = useState<Measured>({ overflow: false, hidden: false });
  const hintId = useId();

  useLayoutEffect(() => {
    const region = scroller.current;
    const box = content.current;
    if (region === null || box === null) return;
    const hidden = region.closest('[aria-hidden="true"]') !== null;
    const measure = () => setMeasured((previous) => {
      const overflow = region.scrollWidth - region.clientWidth > 1;
      return previous.overflow === overflow && previous.hidden === hidden ? previous : { overflow, hidden };
    });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(region);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const setScroller = useCallback((node: HTMLElement | null) => { scroller.current = node; }, []);
  const setContent = useCallback((node: HTMLElement | null) => { content.current = node; }, []);
  const interactive = overflow && !hidden;
  const regionProps = {
    className: className ? `scroll-region ${className}` : "scroll-region",
    tabIndex: interactive ? 0 : overflow ? -1 : undefined,
    role: interactive ? "region" : undefined,
    "aria-label": interactive ? label : undefined,
    "aria-describedby": interactive ? hintId : undefined,
  };

  return (
    <>
      {as === "pre" ? (
        <pre ref={setScroller} {...regionProps}><span ref={setContent} className="scroll-content">{children}</span></pre>
      ) : (
        <div ref={setScroller} {...regionProps}><div ref={setContent} className="scroll-content">{children}</div></div>
      )}
      {overflow ? <span className="scroll-hint" id={hintId}>{HINT}</span> : null}
    </>
  );
}
