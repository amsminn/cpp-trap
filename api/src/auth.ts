import { githubAuth } from "@hono/oauth-providers/github";
import { and, eq, gt, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { sessions, users } from "./db/schema";
import type { Env } from "./env";

type AuthContext = Context<{ Bindings: Env }>;
const sessionMaxAge = 2592000;

export async function hashSessionToken(pepper: string, token: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const hash = await crypto.subtle.sign("HMAC", key, encoder.encode(token));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sessionCookie(c: AuthContext, token: string, maxAge: number): void {
  setCookie(c, "__Host-sid", token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge,
  });
}

export function clearSessionCookie(c: AuthContext): void {
  sessionCookie(c, "", 0);
}

export async function currentUser(c: AuthContext): Promise<typeof users.$inferSelect | null> {
  const token = getCookie(c, "__Host-sid");
  if (!token) return null;
  const id = await hashSessionToken(c.env.SESSION_PEPPER, token);
  const row = await drizzle(c.env.DB).select({ user: users })
    .from(sessions).innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, Date.now()))).get();
  return row?.user ?? null;
}

export const auth = new Hono<{ Bindings: Env }>();
const github = githubAuth({ scope: ["user:email"], oauthApp: true });

auth.get("/github", github, finishLogin);
auth.get("/github/callback", github, finishLogin);

async function finishLogin(c: AuthContext): Promise<Response> {
  const profile = c.get("user-github");
  if (!profile || typeof profile.id !== "number" || typeof profile.login !== "string") {
    return c.json({ error: "Invalid GitHub profile" }, 401);
  }
  const avatarUrl = profile.avatar_url?.startsWith("https://avatars.githubusercontent.com/")
    ? profile.avatar_url : null;
  const db = drizzle(c.env.DB);
  const user = await db.insert(users).values({
    githubId: profile.id, login: profile.login, avatarUrl,
  }).onConflictDoUpdate({
    target: users.githubId,
    set: { login: profile.login, avatarUrl },
  }).returning({ id: users.id }).get();
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  const now = Date.now();
  await db.batch([
    db.delete(sessions).where(and(eq(sessions.userId, user.id), lte(sessions.expiresAt, now))),
    db.insert(sessions).values({
      id: await hashSessionToken(c.env.SESSION_PEPPER, token),
      userId: user.id,
      expiresAt: now + sessionMaxAge * 1000,
    }),
  ]);
  sessionCookie(c, token, sessionMaxAge);
  return c.redirect("/");
}

auth.post("/logout", async (c) => {
  const token = getCookie(c, "__Host-sid");
  if (token) {
    await drizzle(c.env.DB).delete(sessions)
      .where(eq(sessions.id, await hashSessionToken(c.env.SESSION_PEPPER, token)));
  }
  clearSessionCookie(c);
  return c.body(null, 204);
});

export async function deleteAccount(c: AuthContext): Promise<Response> {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "Authentication required" }, 401);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM submissions WHERE user_id = ?").bind(user.id),
    c.env.DB.prepare("DELETE FROM user_daily WHERE user_id = ?").bind(user.id),
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
    c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
  ]);
  clearSessionCookie(c);
  return c.body(null, 204);
}
