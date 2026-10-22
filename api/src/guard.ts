import type { MiddlewareHandler } from "hono";
import type { Env } from "./env";

export const sameOrigin: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  if (c.req.method === "POST" || c.req.method === "DELETE") {
    const site = c.req.header("Sec-Fetch-Site");
    const origin = c.req.header("Origin");
    if (site === "cross-site" ||
        (site === undefined && origin !== undefined && origin !== new URL(c.req.url).origin)) {
      return c.json({ error: "forbidden" }, 403);
    }
  }
  await next();
};
