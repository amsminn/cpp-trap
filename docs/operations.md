# Operations

How C++ Trap is deployed, configured, limited and kept safe. The README covers local development.

## Deploy and configuration

The app and problems pipelines check pushes/PRs and manual runs on Ubuntu x86-64.
App checks install the lockfile, typecheck, run rules tests, build the judge and
run all 20 e2e cases. On main, deployment additionally requires the repository
variable `DEPLOY_ENABLED=true`; it builds web assets, applies D1 migrations,
and deploys the Worker/assets/container. Problem sync requires `SYNC_ENABLED=true`
in the problems repository. PRs do not deploy or sync.

Deploy configuration is `wrangler.jsonc` (deployed with `npx wrangler deploy`);
it also serves local tooling (`wrangler d1 ... --local`, `scripts/sync-problems.ts`).
`cf migrate` was not adopted: the wrangler path is the one already exercised by CI,
and a second config would have to be kept in sync. Live URL:
https://cpp-trap.kim1109123.workers.dev. The Actions token is an account-owned
API token limited to Workers Scripts, D1, Workers Containers, Cloudchamber,
Observability write and Account Settings read, expiring after 12 months.

Configuration names (never put secret values in this README):

- Worker secrets: `GITHUB_ID`, `GITHUB_SECRET`, `TURNSTILE_SECRET`, `SESSION_PEPPER`.
- Worker vars: `DAILY_LIMIT`, `USER_DAILY_LIMIT`, `SUBMISSIONS_ENABLED`.
- Bindings: `DB`, `JUDGE`, `RATE_LIMIT`, `ASSETS`.
- Web build setting: `VITE_TURNSTILE_SITEKEY` (public, not a secret).
- Both repos' Actions secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- App checkout secret: `PROBLEMS_DEPLOY_KEY`; problems checkout secret: `APP_DEPLOY_KEY`.
- Problems sync secret: `D1_DATABASE_ID`; repo variables: `DEPLOY_ENABLED`, `SYNC_ENABLED`.

Cost controls live in `wrangler.jsonc`: one `basic` judge instance,
global `DAILY_LIMIT` 2000, `USER_DAILY_LIMIT` 200, and `RATE_LIMIT` 5/user/minute.
`api/src/submit.ts` atomically reserves daily quota; infrastructure failures refund
it. `api/src/judge.ts` disables container internet and sleeps after 30 seconds.
Target Workers Paid baseline is $5/month; the account has a $10 billing budget alert. The alert is notification, not a hard cap.

## Security and operations

Tier B always strips setuid/setgid programs and shells, drops groups/capabilities,
sets no-new-privileges and runner uid 61001, uses fresh directories and file-backed
outputs, kills process groups and sweeps the runner uid after every run.
Surviving processes quarantine the judge. Tier C adds read-only root, private
temporary storage, PID/network namespaces only when the startup bwrap probe passes.
Docker Desktop currently selects B; its network isolation relies on the container
platform's `enableInternet=false`, not the standalone Docker command above.

Compile: 15 s wall, CPU 10:11 s, 768 MiB address space, 32 processes,
32 MiB files, 256 descriptors. Run: 2 s wall, CPU 2:3 s, 96 MiB address space,
8 processes, 1 MiB files, 64 descriptors, 8 MiB stack; core dumps disabled.
Diagnostics cap at 64 KiB (response 8 KiB); stdout/stderr return 4 KiB each.
One judge request runs at a time; busy requests receive 503.

Victory requires an exact match to a fresh 32-byte token on fd 3, not stdout
text or exit status; token output is read up to 1 KiB. Sources/objects are removed
before running. This is not a general integrity oracle: a future victory puzzle
allowing a declared `write(3,p,n)` (roughly 30 free characters with the necessary
punctuation and syscall names allowed) needs a ptrace breakpoint oracle before
publication. See `judge/README.md`; do not loosen puzzle constraints casually.

Kill switches, in escalating order:

1. Set `SUBMISSIONS_ENABLED=false` or `DAILY_LIMIT=0` in the Worker dashboard.
2. Set `max_instances` to 0 if Wrangler accepts it; otherwise remove the
   `containers` block and deploy to stop the judge.
3. Disable the `workers.dev` route in the dashboard.

A dashboard var change lasts only until the next deploy. For a lasting stop,
commit the var change or set the app repo variable `DEPLOY_ENABLED=false`.

A monitor can poll `GET /api/health` every few minutes and inspect `ok`, `judge.ok`, and `today.used` / `today.limit`.
Health uses a cache of at most 60 seconds and does not wake an idle judge;
an idle/unreachable judge is not by itself proof of a failed submission.

Rotate secrets without putting values in chat, logs or the repo:

- `SESSION_PEPPER`: generate fresh random material and install via an interactive
  Worker secret prompt or direct pipe; this logs everyone out.
- `GITHUB_SECRET`: regenerate in the GitHub OAuth App, replace the Worker secret,
  then verify login/callback and revoke the old credential.
- `TURNSTILE_SECRET`: rotate in Turnstile, replace the Worker secret and verify
  submit; rebuild web if the public site key also changes.
- `CLOUDFLARE_API_TOKEN`: renew before its 12-month TTL, keep account-scoped
  deploy/D1/container permissions, pipe into both repos' Actions secrets, verify
  deploy/sync, then revoke the old token.
- Deploy keys: create replacement read-only keys in the target repos, replace
  `PROBLEMS_DEPLOY_KEY` / `APP_DEPLOY_KEY` in the consuming repo, verify checkout,
  then delete the old keys.

Use the platform's interactive secret entry or direct pipes, never literal values
in commands/history. Invocation logs are kept at 100%: head sampling cannot exempt
errors. Retention is 7 days; code, tokens, cookies and sources are never logged.
