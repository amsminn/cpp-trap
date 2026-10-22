import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { auth, deleteAccount } from "./auth";
import type { Env } from "./env";
import { sameOrigin } from "./guard";
import {
  health, me, mySubmissions, problem, problemList, ranking,
  shortest, solutions, submission,
} from "./queries";
import {
  GOOGLE_VERIFICATION, googleVerification, htmlPage, indexNowKey, INDEXNOW_KEY, llms, robots, sitemap,
} from "./seo";
import { submit } from "./submit";

export { Judge } from "./judge";

const app = new Hono<{ Bindings: Env }>();
app.use("/api/*", secureHeaders());
app.use("/auth/*", secureHeaders());
app.use("/api/*", bodyLimit({
  maxSize: 16 * 1024,
  onError: (c) => c.json({ error: "body too large" }, 413),
}));
app.use("*", sameOrigin);
app.route("/auth", auth);
app.get("/api/problems", problemList);
app.get("/api/problems/:n", problem);
app.get("/api/problems/:n/shortest", shortest);
app.get("/api/problems/:n/solutions", solutions);
app.get("/api/me", me);
app.delete("/api/me", deleteAccount);
app.get("/api/me/submissions", mySubmissions);
app.get("/api/ranking", ranking);
app.get("/api/submissions/:id", submission);
app.get("/api/health", health);
app.post("/api/submit", submit);
app.get("/robots.txt", robots);
app.get("/sitemap.xml", sitemap);
app.get("/llms.txt", llms);
app.get(`/${INDEXNOW_KEY}.txt`, indexNowKey);
app.get(`/${GOOGLE_VERIFICATION}.html`, googleVerification);

app.onError((error, c) => {
  const id = crypto.randomUUID();
  console.error(id, error.name);
  return c.json({ error: "internal", id }, 500);
});
app.notFound((c) => c.req.path.startsWith("/api/")
  ? c.json({ error: "not found" }, 404)
  : c.req.method === "GET" || c.req.method === "HEAD" ? htmlPage(c) : c.env.ASSETS.fetch(c.req.raw));

export default app;
