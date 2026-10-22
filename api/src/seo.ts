import {
  ABOUT_CREDITS, ABOUT_INTRO, HOME_LEAD, HOME_LEAD_KO, HOME_TITLE, SITE_ALTERNATE_NAMES, SITE_NAME, pageTitle, ruleLines,
} from "@cpp-trap/shared";
import type { PublicProblem } from "@cpp-trap/shared";
import type { Context } from "hono";
import type { Env } from "./env";

type SeoContext = Context<{ Bindings: Env }>;

type ProblemRow = {
  readonly number: number; readonly title: string; readonly statement: string; readonly skeleton: string;
  readonly constraints_json: string; readonly credit: string; readonly updated_at: string;
};

type Page = {
  readonly status: 200 | 404;
  readonly title: string;
  readonly description: string;
  readonly path: string;
  readonly index: boolean;
  readonly body?: string;
  readonly jsonLd?: readonly object[];
};

// A public, non-secret key: IndexNow only proves that this host chose it.
export const INDEXNOW_KEY = "5f3c8e2a9b7d4c61a0e8f2b6d9c3a7e4";
export const GOOGLE_VERIFICATION = "google93159443ac44b3f0";
const CRAWLERS = [
  "Googlebot", "Bingbot", "Yeti", "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot",
  "Claude-User", "PerplexityBot", "Perplexity-User",
] as const;

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function clip(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), limit / 2))}…`;
}

async function loadProblems(env: Env): Promise<ProblemRow[]> {
  const rows = await env.DB.prepare(
    "SELECT number, title, statement, skeleton, constraints_json, credit, updated_at FROM problems ORDER BY number",
  ).all<ProblemRow>();
  return rows.results;
}

function card(inner: string): string {
  return `<div class="card">${inner}<noscript><p>JavaScript is required to submit code.</p></noscript></div>`;
}

function homePage(origin: string, problems: readonly ProblemRow[]): Page {
  const items = problems.map((problem) => `<li><a class="inline-link" href="/p/${problem.number}">#${problem.number} ${escape(problem.title)}</a></li>`).join("");
  return {
    status: 200, title: HOME_TITLE, path: "/", index: true,
    description: `${SITE_NAME} (${SITE_ALTERNATE_NAMES[0]}): ${problems.length} tiny C++ puzzles from Mawekl's Security Traps. ${HOME_LEAD}`,
    body: card(`<h1>Problems</h1><p class="muted">${escape(HOME_LEAD)}</p><p class="muted" lang="ko">${escape(HOME_LEAD_KO)}</p><ol>${items}</ol>`),
    jsonLd: [
      {
        "@context": "https://schema.org", "@type": "WebSite", "@id": `${origin}/#website`, name: SITE_NAME,
        alternateName: SITE_ALTERNATE_NAMES, url: `${origin}/`, description: HOME_LEAD, inLanguage: "en",
      },
      {
        "@context": "https://schema.org", "@type": "ItemList", name: "Problems",
        itemListElement: problems.map((problem, index) => ({
          "@type": "ListItem", position: index + 1, url: `${origin}/p/${problem.number}`, name: problem.title,
        })),
      },
    ],
  };
}

function problemPage(origin: string, problem: ProblemRow): Page {
  const constraints: PublicProblem["constraints"] = JSON.parse(problem.constraints_json);
  const rules = ruleLines(constraints);
  const banned = constraints.banned.length
    ? `<li class="rules-banned"><span>Must not contain</span>${constraints.banned.map((term) => `<code>${escape(term)}</code>`).join("")}</li>`
    : "";
  const path = `/p/${problem.number}`;
  return {
    status: 200, path, index: true,
    title: pageTitle(`${problem.title} · #${problem.number}`),
    description: clip(`${SITE_NAME} #${problem.number} ${problem.title}: ${problem.statement} ${rules.join("; ")}.`, 160),
    body: card(`<span class="tag">#${problem.number}</span><h1>${escape(problem.title)}</h1>`
      + `<p class="statement">${escape(problem.statement)}</p>`
      + `<ul class="rules" aria-label="Input rules">${rules.map((rule) => `<li>${escape(rule)}</li>`).join("")}${banned}</ul>`
      + `<pre>${escape(problem.skeleton)}</pre><p class="credit">${escape(problem.credit)}</p>`
      + `<p><a class="inline-link" href="/">All problems</a></p>`),
    jsonLd: [
      {
        "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
          { "@type": "ListItem", position: 1, name: "Problems", item: `${origin}/` },
          { "@type": "ListItem", position: 2, name: problem.title, item: `${origin}${path}` },
        ],
      },
      {
        "@context": "https://schema.org", "@type": "LearningResource", name: problem.title, description: problem.statement,
        url: `${origin}${path}`, learningResourceType: "Exercise", inLanguage: "en", isAccessibleForFree: true,
        creditText: problem.credit, isPartOf: { "@id": `${origin}/#website` }, dateModified: problem.updated_at,
      },
    ],
  };
}

function aboutPage(): Page {
  return {
    status: 200, path: "/about", index: true, title: pageTitle("About"),
    description: "About C++ Trap: tiny C++ puzzles by Mawekl from Security Traps, republished with credit, how the judge runs your code, and privacy.",
    body: card(`<h1>About</h1><p>${escape(`${ABOUT_INTRO} ${HOME_LEAD}`)}</p>`
      + `<p class="muted">Also known as ${escape(SITE_ALTERNATE_NAMES.join(", "))}.</p><h2>Credits</h2><p>${escape(ABOUT_CREDITS)}</p>`),
  };
}

function rankingPage(): Page {
  return {
    status: 200, path: "/ranking", index: true, title: pageTitle("Leaderboard"),
    description: "C++ Trap leaderboard: players ranked by how many C++ trap puzzles they solved. Equal totals share a rank.",
    body: card("<h1>Leaderboard</h1><p class=\"muted\">Ranked by problems solved. Equal totals share a rank; tied users are listed by login.</p>"),
  };
}

function privatePage(path: string, title: string): Page {
  return { status: 200, path, index: false, title, description: HOME_LEAD };
}

function notFoundPage(path: string): Page {
  return { status: 404, path, index: false, title: pageTitle("Page not found"), description: HOME_LEAD };
}

async function resolvePage(env: Env, origin: string, path: string): Promise<Page> {
  if (path === "/") return homePage(origin, await loadProblems(env));
  if (path === "/about") return aboutPage();
  if (path === "/ranking") return rankingPage();
  if (path === "/submissions") return privatePage(path, pageTitle("My submissions"));
  const match = /^\/p\/([1-9][0-9]{0,8})(\/solutions)?$/.exec(path);
  if (!match?.[1]) return notFoundPage(path);
  const problem = await env.DB.prepare(
    "SELECT number, title, statement, skeleton, constraints_json, credit, updated_at FROM problems WHERE number = ?",
  ).bind(Number(match[1])).first<ProblemRow>();
  if (!problem) return notFoundPage(path);
  return match[2]
    ? privatePage(path, pageTitle(`Accepted solutions for ${problem.title} · #${problem.number}`))
    : problemPage(origin, problem);
}

function head(origin: string, page: Page): string {
  const url = `${origin}${page.path}`;
  const tags = [
    page.index ? `<link rel="canonical" href="${escape(url)}">` : `<meta name="robots" content="noindex">`,
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escape(page.title)}">`,
    `<meta property="og:description" content="${escape(page.description)}">`,
    `<meta property="og:url" content="${escape(url)}">`,
    `<meta property="og:image" content="${origin}/og.png">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    ...(page.jsonLd ?? []).map((data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`),
  ];
  return tags.join("");
}

/** Serves the SPA shell with a page-specific head and the page's own text, so crawlers without JavaScript read it. */
export async function htmlPage(c: SeoContext): Promise<Response> {
  const url = new URL(c.req.url);
  const page = await resolvePage(c.env, url.origin, url.pathname);
  const shell = await c.env.ASSETS.fetch(new Request(new URL("/", url), c.req.raw));
  const headers = new Headers(shell.headers);
  headers.delete("etag");
  headers.delete("content-length");
  const rewritten = new HTMLRewriter()
    .on("title", { element: (element) => { element.setInnerContent(page.title); } })
    .on('meta[name="description"]', { element: (element) => { element.setAttribute("content", page.description); } })
    .on("head", { element: (element) => { element.append(head(url.origin, page), { html: true }); } })
    .on("#startup-fallback", { element: (element) => { if (page.body) element.setInnerContent(page.body, { html: true }); } })
    .transform(new Response(shell.body, { status: page.status, headers }));
  return rewritten;
}

export function robots(c: SeoContext): Response {
  const origin = new URL(c.req.url).origin;
  const group = (agent: string) => `User-agent: ${agent}\nAllow: /\nDisallow: /api/\nDisallow: /auth/\n`;
  const body = ["*", ...CRAWLERS].map(group).join("\n") + `\nSitemap: ${origin}/sitemap.xml\n`;
  return c.text(body, 200, { "cache-control": "public, max-age=3600" });
}

export async function sitemap(c: SeoContext): Promise<Response> {
  const origin = new URL(c.req.url).origin;
  const problems = await loadProblems(c.env);
  const newest = problems.map((problem) => problem.updated_at).sort().at(-1)?.slice(0, 10);
  const entry = (path: string, lastmod?: string) =>
    `<url><loc>${escape(origin + path)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`;
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`
    + entry("/", newest) + entry("/about") + entry("/ranking")
    + problems.map((problem) => entry(`/p/${problem.number}`, problem.updated_at.slice(0, 10))).join("")
    + "</urlset>\n";
  return c.body(body, 200, { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" });
}

export async function llms(c: SeoContext): Promise<Response> {
  const origin = new URL(c.req.url).origin;
  const problems = await loadProblems(c.env);
  const body = `# ${SITE_NAME}\n\n> ${ABOUT_INTRO} ${HOME_LEAD} Also known as ${SITE_ALTERNATE_NAMES.join(", ")}.\n\n`
    + `${ABOUT_CREDITS} Every submission is compiled with GCC 4.9 in strict C++11 mode on x86-64 Linux and run in a sandbox; a problem is solved when the program calls victory().\n\n`
    + `## Problems\n\n${problems.map((problem) => `- [#${problem.number} ${problem.title}](${origin}/p/${problem.number}): ${problem.statement}`).join("\n")}\n\n`
    + `## Pages\n\n- [Problems](${origin}/): the list of all problems\n- [Leaderboard](${origin}/ranking): players ranked by problems solved\n- [About](${origin}/about): credits, judge environment and privacy\n`;
  return c.text(body, 200, { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" });
}

export function indexNowKey(c: SeoContext): Response {
  return c.text(INDEXNOW_KEY, 200);
}

export function googleVerification(c: SeoContext): Response {
  return c.html(`google-site-verification: ${GOOGLE_VERIFICATION}.html`, 200);
}
