import { useId, type ReactElement, type ReactNode } from "react";

/** The fixed UI term for the verification step (U72); also the group's accessible name. */
export const HUMAN_CHECK_NAME = "Human check";
/** One sentence: who runs the check and what it gates (U79). Shown beside the widget and read as the group's description. */
export const HUMAN_CHECK_EXPLANATION = "Cloudflare verifies that you are human before you submit code.";

export type HumanCheckProps = {
  /** The widget instance the problem page owns (its ref, reset and onToken stay with the page), plus any lifecycle text. */
  readonly children: ReactNode;
};

/**
 * The named group around the editor's human-check widget (V048): the visible caption is the group's name and description,
 * placed above the widget so a linear reader meets it before the provider iframe. The group is the shared verification
 * frame (widget footprint reserved, one status line below the widget left to the children). Mounting stays with the
 * editor, so the group exists only while a session is signed in; widget language and retry lifecycle are editor work.
 */
export function HumanCheck({ children }: HumanCheckProps): ReactElement {
  const id = useId();
  const nameId = `${id}-name`;
  const noteId = `${id}-note`;
  return (
    <div className="verification-frame human-check" role="group" aria-labelledby={nameId} aria-describedby={noteId}>
      <p className="human-check-caption">
        <strong id={nameId}>{HUMAN_CHECK_NAME}</strong>
        <span aria-hidden="true"> · </span>
        <span id={noteId} className="muted">{HUMAN_CHECK_EXPLANATION}</span>
      </p>
      {children}
    </div>
  );
}
