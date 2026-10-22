import type {
  ApiError,
  MeView,
  ProblemListItem,
  PublicProblem,
  RankingRow,
  ShortestRow,
  SolutionRow,
  SubmissionView,
  SubmitRequest,
  SubmitAccepted,
} from "@cpp-trap/shared";

const BANNED = ["main", "victory", "asm", "&", "*", "(", "/", "popen", "system", "exec"];
const CREDIT = "Original problem by Mawekl · securitytraps.pl";

const problems: PublicProblem[] = [
  {
    number: 1,
    slug: "the-truth",
    title: "The Truth",
    statement: "Your main objective is to call the victory() function. You must put one line of your code.",
    skeleton: "int main()\n{\n  /*INPUT*/\n  if((1==1)==false) victory();\n  return 0;\n}\n",
    constraints: { max_chars: 18, max_semicolons: 1, single_line: true, banned: BANNED },
    goal: { type: "victory" },
    credit: CREDIT,
  },
  {
    number: 2,
    slug: "equation",
    title: "Equation",
    statement: "Your main objective is to call the victory() function. You must put one line of your code.",
    skeleton: "int main()\n{\n  /*INPUT*/\n  if(1337!=1337)\n    victory();\n  return 0;\n}\n",
    constraints: { max_chars: 10, max_semicolons: 1, single_line: true, banned: BANNED },
    goal: { type: "victory" },
    credit: CREDIT,
  },
  {
    number: 3,
    slug: "swapping",
    title: "Swapping",
    statement: "Your main objective is to call the victory() function. Swap the two values using a single line.",
    skeleton:
      "int main()\n{\n  unsigned int x = 0xB0FF14a5;\n  unsigned int y = 0x7340c00e;\n  /*INPUT*/\n  if(x==0x7340c00e && y==0xB0FF14a5) victory();\n  return 0;\n}\n",
    constraints: { max_chars: 11, max_semicolons: 1, single_line: true, banned: BANNED },
    goal: { type: "victory" },
    credit: CREDIT,
  },
  {
    number: 4,
    slug: "standard-gcd",
    title: "Standard GCD",
    statement: "You have to write function that returns gcd of given parameters. You must put your code.",
    skeleton: "int gcd(int a, int b)\n{\n  /*INPUT*/\n}\n",
    constraints: { max_chars: 15, max_semicolons: null, single_line: false, banned: ["main", "asm", "#", "_", "popen", "system", "exec"] },
    goal: { type: "stdout_prefix", expected: "gcd ok" },
    credit: CREDIT,
  },
];

// Demo inputs that pass each mock problem's input rules; they are not solutions to the real puzzles.
const answers: Record<number, string> = { 1: "int demo=1;", 2: "int d=1;", 3: "int d=1;", 4: "return 1;" };

let me: MeView = import.meta.env.VITE_MOCK === "anon"
  ? null
  : { login: "amsminn", avatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4" };
const solved = new Set<number>([1]);
const submissions = new Map<string, SubmissionView>();

const shortest: Record<number, ShortestRow[]> = {
  1: [{ rank: 1, login: "amsminn", chars: 15 }, { rank: 2, login: "alice", chars: 15 }],
  3: [{ rank: 1, login: "alice", chars: 11 }, { rank: 2, login: "bob", chars: 13 }, { rank: 3, login: "carol", chars: 13 }],
};

const ranking: RankingRow[] = [
  { rank: 1, login: "alice", solved: 14 },
  { rank: 2, login: "bob", solved: 9 },
  { rank: 3, login: "amsminn", solved: 1 },
];

function judge(problem: number, code: string): SubmissionView {
  const id = crypto.randomUUID();
  const view: SubmissionView = {
    id,
    problem,
    code,
    chars: code.length,
    verdict: "queued",
    message: "",
    compilerOutput: null,
    createdAt: new Date().toISOString(),
  };
  submissions.set(id, view);
  setTimeout(() => {
    const verdict = code === answers[problem] ? "accepted" : code.includes("err") ? "compile_error" : "wrong";
    if (verdict === "accepted") solved.add(problem);
    submissions.set(id, {
      ...view,
      verdict,
      message: { accepted: "victory() called · compiled in 214 ms", compile_error: "g++ exited with status 1", wrong: "victory() was not called" }[verdict],
      compilerOutput: verdict === "compile_error" ? "main.cpp: In function 'int main()':\nmain.cpp:5:3: error: 'err' was not declared in this scope" : null,
    });
  }, 1200);
  return view;
}

function reply<T>(body: T, status = 200): Response {
  return Response.json(body, { status });
}

function fail(status: number, error: string, extra: Partial<ApiError> = {}): Response {
  return reply<ApiError>({ error, ...extra }, status);
}

export async function mockFetch(url: string, init: RequestInit): Promise<Response> {
  await new Promise((resolve) => setTimeout(resolve, 150));
  const method = init.method ?? "GET";
  const path = new URL(url, "http://mock").pathname;
  const match = (pattern: RegExp) => pattern.exec(path);

  if (path === "/api/problems" && method === "GET") {
    return reply<ProblemListItem[]>(problems.map((p) => ({
      number: p.number,
      title: p.title,
      maxChars: p.constraints.max_chars,
      solvedCount: shortest[p.number]?.length ?? 0,
      solvedByMe: me !== null && solved.has(p.number),
    })));
  }
  const byNumber = match(/^\/api\/problems\/(\d+)(\/shortest|\/solutions)?$/);
  if (byNumber && method === "GET") {
    const number = Number(byNumber[1]);
    const problem = problems.find((p) => p.number === number);
    if (!problem) return fail(404, "problem not found");
    if (byNumber[2] === "/shortest") return reply<ShortestRow[]>(shortest[number] ?? []);
    if (byNumber[2] === "/solutions") {
      if (me === null) return fail(401, "log in to see solutions");
      if (!solved.has(number)) return fail(403, "solve this problem first");
      const code = answers[number] ?? "";
      return reply<SolutionRow[]>([{ login: "alice", chars: code.length, code }, { login: me.login, chars: code.length, code }]);
    }
    return reply<PublicProblem>(problem);
  }
  if (path === "/api/me" && method === "GET") return reply<MeView>(me);
  if (path === "/api/me" && method === "DELETE") {
    me = null;
    submissions.clear();
    return new Response(null, { status: 204 });
  }
  if (path === "/auth/logout" && method === "POST") {
    me = null;
    return new Response(null, { status: 204 });
  }
  if (path === "/api/me/submissions" && method === "GET") {
    if (me === null) return fail(401, "log in to see your submissions");
    return reply<SubmissionView[]>([...submissions.values()].reverse());
  }
  if (path === "/api/ranking" && method === "GET") return reply<RankingRow[]>(ranking);
  if (path === "/api/submit" && method === "POST") {
    if (me === null) return fail(401, "log in to submit");
    const body = JSON.parse(String(init.body)) as SubmitRequest;
    if (!body.turnstileToken) return fail(403, "human check failed");
    if (body.code.includes("busy")) return fail(503, "judge is busy", { retryAfter: 30 });
    return reply<SubmitAccepted>({ id: judge(body.problem, body.code).id }, 202);
  }
  const byId = match(/^\/api\/submissions\/([^/]+)$/);
  if (byId && method === "GET") {
    if (me === null) return fail(401, "log in to see your submissions");
    const view = submissions.get(byId[1] ?? "");
    return view ? reply<SubmissionView>(view) : fail(404, "submission not found");
  }
  return fail(404, "not found");
}
