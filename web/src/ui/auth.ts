const RETURN_KEY = "cpp-trap:login-return";
const RETURN_MAX_AGE_MS = 10 * 60 * 1000;

function safePath(value: unknown): value is string {
  if (typeof value !== "string" || !/^\/(?!\/)/.test(value) || /[\\\u0000-\u0020\u007f]/.test(value)) return false;
  return new URL(value, location.origin).origin === location.origin;
}

export function loginHref(): string {
  return "/auth/github";
}

export function rememberReturn(path: string): void {
  // Remove an earlier destination even when this activation supplies an invalid one.
  sessionStorage.removeItem(RETURN_KEY);
  if (safePath(path)) sessionStorage.setItem(RETURN_KEY, JSON.stringify({ path, at: Date.now() }));
}

export function consumeReturn(): string | null {
  const raw = sessionStorage.getItem(RETURN_KEY);
  sessionStorage.removeItem(RETURN_KEY);
  if (raw === null) return null;
  let entry: unknown;
  try {
    entry = JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  if (typeof entry !== "object" || entry === null || !("path" in entry) || !("at" in entry)) return null;
  if (!safePath(entry.path) || typeof entry.at !== "number" || !Number.isFinite(entry.at)) return null;
  const age = Date.now() - entry.at;
  return age >= 0 && age <= RETURN_MAX_AGE_MS ? entry.path : null;
}
