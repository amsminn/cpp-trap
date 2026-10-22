import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { loginHref, rememberReturn } from "./auth";

/** The About section that states what is stored, for how long and who can see it (U75); every login prompt links here. */
export const PRIVACY_PATH = "/about#privacy";

export type AuthPromptPurpose = "submit" | "solutions" | "submissions" | "account";

export type AuthPromptProps = {
  /** The same-origin path (pathname, search and hash) to return to after GitHub login; stored on activation only. */
  readonly returnTo: string;
  readonly purpose: AuthPromptPurpose;
  readonly className?: string;
};

/** Label plus note name GitHub and what logging in unlocks (U63/U74); only gated purposes render the primary action. */
const COPY: Record<AuthPromptPurpose, { readonly label: string; readonly note: string | null; readonly action: boolean }> = {
  submit: { label: "Log in with GitHub to submit", note: null, action: true },
  solutions: { label: "Log in with GitHub", note: "and solve this problem to see how others did it.", action: true },
  submissions: { label: "Log in with GitHub", note: "to see your submissions.", action: true },
  account: { label: "Log in with GitHub", note: null, action: false },
};

/**
 * One login prompt for every signed-out context (V086/V100): the GitHub login whose activation remembers where to come
 * back to, then follows the plain OAuth destination, beside a Privacy link to the stored-data policy. The login is the
 * first anchor; the Privacy link sits inside the note so it wraps with the sentence. `.auth-prompt` is the wrapping flex
 * row from the shared layout contracts; every inline anchor carries `.inline-link` for its phone hit area.
 */
export function AuthPrompt({ returnTo, purpose, className }: AuthPromptProps): ReactElement {
  const copy = COPY[purpose];
  return (
    <p className={className === undefined ? "auth-prompt" : `auth-prompt ${className}`}>
      <a className={copy.action ? "btn" : "inline-link"} href={loginHref()} onClick={() => rememberReturn(returnTo)}>{copy.label}</a>
      {" "}
      <span>
        {copy.note === null ? null : `${copy.note} `}
        <Link className="inline-link" to={PRIVACY_PATH}>Privacy</Link>
      </span>
    </p>
  );
}
