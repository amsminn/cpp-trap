import { useEffect, useState, type ReactElement } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/** Router state About sends with its navigation to `/` after a 204 account deletion. */
export const ACCOUNT_DELETED_STATE = { accountDeleted: true } as const;

const MESSAGE = "Your account and all of your submissions have been deleted.";

function flagged(state: unknown): boolean {
  return typeof state === "object" && state !== null && "accountDeleted" in state && state.accountDeleted === true;
}

/**
 * The one-shot completion status of account deletion (V085 handoff), mounted by App before the route content so it
 * survives the About unmount. It consumes the router flag with a replace navigation to the same pathname, search and
 * hash, keeps the message for that history entry only, and clears it on the next location change; Back and reload
 * meet the replaced, flagless entry. The live region exists before the text lands so the announcement is made.
 */
export function DeletionCompletionNotice(): ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<{ key: string | null } | null>(null);
  const consume = flagged(location.state);

  useEffect(() => {
    if (consume) {
      setEntry({ key: null });
      navigate(location.pathname + location.search + location.hash, { replace: true, state: null });
      return;
    }
    setEntry((current) => {
      if (current === null) return current;
      if (current.key === null) return { key: location.key };
      return current.key === location.key ? current : null;
    });
  }, [consume, location.key, location.pathname, location.search, location.hash, navigate]);

  return (
    <div className="completion-notice" role="status" aria-live="polite" aria-atomic="true">
      {entry === null ? null : <p>{MESSAGE}</p>}
    </div>
  );
}
