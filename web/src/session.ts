import type { MeView } from "@cpp-trap/shared";
import { createContext, useContext } from "react";

export type SessionState =
  | { state: "checking" }
  | { state: "authenticated"; user: NonNullable<MeView> }
  | { state: "anonymous"; reason?: "expired" | "logout" | "deleted" }
  | { state: "error"; error: unknown };

export type Session = {
  state: SessionState;
  me: MeView | undefined;
  identityKey: string;
  setMe: (me: MeView) => void;
  signOut: (reason: "expired" | "logout" | "deleted") => void;
  retry: () => void;
};

export const SessionContext = createContext<Session>({
  state: { state: "checking" },
  me: undefined,
  identityKey: "unknown",
  setMe: () => undefined,
  signOut: () => undefined,
  retry: () => undefined,
});

export function useSession(): Session {
  return useContext(SessionContext);
}
