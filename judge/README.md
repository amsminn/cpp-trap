# Judge

Build from the app root: `docker build -f judge/Dockerfile -t cpp-trap-judge .`.
The deployment target is linux/amd64.
Node base: `node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392`.
Ubuntu base: `ubuntu:24.04@sha256:68ee22004a9109b44973313b02ff7b1de250f1de0f5ecb628d73f579aaff33ac`.
APT snapshot: `20261001T000000Z` (noble, noble-updates, noble-security).
Pinned packages: g++-13 `13.3.0-6ubuntu2~24.04.1`, util-linux `2.39.3-9ubuntu6.6`,
procps `2:4.0.4-4ubuntu3.3`, tini `0.19.0-1`, bubblewrap `0.9.0-1ubuntu0.3`.
`g++ --version`: `g++ (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0`.
Docker Desktop linux/amd64 probe: tier C exits 1 (mounting proc: Operation not permitted);
tier B is selected. `/health` reports `sandbox:"B", oomProtected:false` on this host.
Local Apple Silicon QA uses `--platform linux/arm64` because Rosetta cannot run under RLIMIT_AS; amd64 is validated in CI.

BASE_FLAGS: `-std=gnu++17 -O0 -fno-stack-protector -no-pie -fcf-protection=none -fno-unreachable-traps -w -fmax-errors=5`.
The fallthrough flag preserves legacy non-void function behavior required by the recovered references.
Compile limits: CPU 10:11 s, AS 805306368 bytes, NPROC 32, FSIZE 33554432 bytes,
NOFILE 256, CORE 0; wall 15 s; diagnostics capped at 64 KiB (kill), response 8 KiB.
Run limits: CPU 2:3 s, AS 100663296 bytes, NPROC 8, FSIZE 1048576 bytes,
NOFILE 64, CORE 0, STACK 8388608 bytes; wall 2 s.
Response stdout/stderr: first 4 KiB each; token: at most 1 KiB, exact 32-byte match.
Requests: 64 KiB maximum, one active request, flags must exactly match the shared allowlist.
Runner uid/gid 61001; no groups/capabilities/new privileges; oom score 1000.
Judge requests oom score -1000; `/health` reports whether this succeeded.
Root `/work` is 0711; per-run directory is owned by 61001; token scratch and `/judge` are 0700.
`/tmp`, `/var/tmp`, `/dev/shm` are 0700; uid-61001 temporary files are removed after each run.
Detached groups are killed, then uid 61001 swept every 100 ms for at most 2 s.
Surviving processes quarantine the judge (`ok:false`, subsequent requests return 500).
Tier B always applies. Tier C adds private namespaces if the startup uid-61001 probe passes.
Tier B networking relies on the container platform's `enableInternet=false`.
No shell or setuid/setgid executable remains. Sources/objects are removed before execution.

Limit: a victory puzzle whose slot can express write(3,p,n) with a declaration
(~30 free chars, ( , " allowed, write/syscall not banned) cannot be protected by the token;
switch to a ptrace breakpoint oracle before publishing one.
