import { ABOUT_CREDITS, ABOUT_INTRO, HOME_LEAD, SITE_ALTERNATE_NAMES } from "@cpp-trap/shared";
import { useLayoutEffect, useRef, useState, type MouseEvent, type SyntheticEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, errorText, RequestError } from "../client";
import { useSession } from "../session";
import { AuthPrompt } from "../ui/AuthPrompt";
import { ACCOUNT_DELETED_STATE } from "../ui/DeletionCompletionNotice";
import { JudgeEnvironment } from "../ui/JudgeEnvironment";
import { helpContext } from "../ui/HelpLink";
import { PageMain } from "../ui/PageMain";
import { StateView } from "../ui/StateView";
import { useTitle } from "../ui/useTitle";
import { useRouteReady } from "../ui/RouteTransition";
import "../styles/about.css";

/** idle: nothing requested; pending: one DELETE /api/me in flight; error: the last request failed, retry offered. */
type DeletionStatus = "idle" | "pending" | "error";

export function AboutPage() {
  useTitle("About");
  useRouteReady(true);
  const { state, signOut, retry } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const support = helpContext(location.state);
  const [status, setStatus] = useState<DeletionStatus>("idle");
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<RequestError | null>(null);
  const inFlight = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  // The native modal follows the confirmation state (V084): showModal() makes the rest of the page inert and keeps Tab
  // inside the dialog, the safe Cancel takes the initial focus, and close() returns focus to the opener.
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (confirming && !element.open) {
      element.showModal();
      cancel.current?.focus();
    } else if (!confirming && element.open) {
      element.close();
    }
  }, [confirming]);

  function openConfirmation() {
    if (inFlight.current) return;
    setConfirming(true);
  }

  function dismiss() {
    if (inFlight.current) return;
    setConfirming(false);
  }

  // Escape is a close request. While the request is in flight the dialog stays open (closedby="none" where the browser
  // supports it, cancelled here otherwise): a close could not stop the deletion and must not suggest that it did.
  function cancelRequest(event: SyntheticEvent<HTMLDialogElement>) {
    if (inFlight.current) event.preventDefault();
  }

  // A click on the backdrop reaches the dialog element itself, outside its own box; that dismisses like Cancel.
  function backdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget || inFlight.current) return;
    const box = event.currentTarget.getBoundingClientRect();
    const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    if (!inside) setConfirming(false);
  }

  function keepAccount() {
    setStatus("idle");
    setFailure(null);
    opener.current?.focus();
  }

  // The in-flight flag is set synchronously, so a double click or repeated Enter sends exactly one DELETE /api/me.
  async function confirmDeletion() {
    if (inFlight.current) return;
    inFlight.current = true;
    setStatus("pending");
    setFailure(null);
    try {
      await api.deleteAccount();
      signOut("deleted");
      navigate("/", { state: ACCOUNT_DELETED_STATE });
    } catch (error: unknown) {
      if (!(error instanceof RequestError)) throw error;
      setFailure(error);
      setStatus("error");
      setConfirming(false);
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <PageMain className="single about">
      <div className="card">
        <h1>About</h1>
        <p>{ABOUT_INTRO} {HOME_LEAD}</p>
        <p className="muted">Also known as {SITE_ALTERNATE_NAMES.join(", ")}.</p>
        <JudgeEnvironment />

        <h2>Credits</h2>
        <p>{ABOUT_CREDITS}</p>
        <p>
          <strong>Takedown:</strong> if you are the author or a rights holder and want a problem removed, message{" "}
          <a className="inline-link" href="https://github.com/amsminn" rel="noopener">amsminn on GitHub</a> and it will be taken down on request.
        </p>

        <section id="technical-help" aria-labelledby="technical-help-title">
          <h2 id="technical-help-title">Technical help</h2>
          <p>
            If verification or judging keeps failing, contact{" "}
            <a className="inline-link" href="https://github.com/amsminn" rel="noopener noreferrer">operational support on GitHub</a>.
          </p>
          <p>Report the problem number, submission id if available, verdict (the result shown), browser and approximate time.</p>
          <p>Do not include verification tokens, session cookies or private code.</p>
          {support.problem === undefined ? null : <p>Problem: <span className="numeric">#{support.problem}</span></p>}
          {support.submissionId === undefined ? null : <p>Submission id: <code>{support.submissionId}</code></p>}
        </section>

        <h2 id="privacy">Privacy</h2>
        <ul>
          <li>Stored when you log in: your GitHub numeric id, login, avatar URL, and your submissions.</li>
          <li>The GitHub login scope requests your email address, but it is never stored.</li>
          <li>IP addresses are not stored by the site; Cloudflare request logs are kept for 7 days.</li>
          <li>Sessions last 30 days. Submissions are kept until you delete your account.</li>
          <li>Who sees what: your login and solved count are public; your accepted code is visible only to people who solved that problem.</li>
        </ul>
        <section className="account" aria-labelledby="account-title" aria-busy={state.state === "checking"}>
          <h3 id="account-title">Your account</h3>
          <div className="account-state">
            {state.state === "checking" ? (
              <StateView kind="loading" label="Checking your session" onRetry={retry} />
            ) : state.state === "error" ? (
              <StateView kind="error" label="Checking your session" onRetry={retry}>{errorText(state.error, "session")}</StateView>
            ) : state.state === "authenticated" ? (
              <>
                <p>You are logged in as <strong>{state.user.login}</strong>.</p>
                <div role="alert" aria-atomic="true">
                  {status === "error" ? (
                    <p className="notice bad">
                      {errorText(failure, "delete")} You are still logged in as {state.user.login} on this device.
                      {" "}Choose Retry deletion to try again, or Cancel to keep your account.
                    </p>
                  ) : null}
                </div>
                <p className="account-actions">
                  <button ref={opener} type="button" className="btn danger" aria-disabled={status === "pending"} onClick={openConfirmation}>
                    {status === "error" ? "Retry deletion" : "Delete my account"}
                  </button>
                  {status === "error" ? <button type="button" className="link-btn" onClick={keepAccount}>Cancel</button> : null}
                </p>
              </>
            ) : (
              <>
                <p className="muted">Deleting your account and submissions is available here once you are logged in.</p>
                <AuthPrompt returnTo={location.pathname + location.search + location.hash} purpose="account" />
              </>
            )}
          </div>
          {state.state === "authenticated" ? (
            <dialog ref={dialog} className="account-delete" role="dialog" aria-labelledby="account-delete-title" aria-describedby="account-delete-consequences"
              closedby={status === "pending" ? "none" : "closerequest"} onCancel={cancelRequest} onClose={dismiss} onClick={backdropClick}>
              <h2 id="account-delete-title">Delete your account?</h2>
              <p id="account-delete-consequences">This immediately removes your account, your sessions and every submission you have made. It cannot be undone.</p>
              <p className="account-delete-status" role="status" aria-live="polite" aria-atomic="true">{status === "pending" ? "Deleting your account and submissions…" : null}</p>
              <div className="account-delete-actions" aria-busy={status === "pending"}>
                <button ref={cancel} type="button" className="link-btn" aria-disabled={status === "pending"} onClick={dismiss}>Cancel</button>
                <button type="button" className="btn danger" aria-disabled={status === "pending"} onClick={confirmDeletion}>Delete account</button>
              </div>
            </dialog>
          ) : null}
        </section>
      </div>
    </PageMain>
  );
}
