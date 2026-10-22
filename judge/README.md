# Judge

Build from the app root: `docker build -f judge/Dockerfile -t cpp-trap-judge .`.
The deployment target is linux/amd64.
Node base: `node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392`.
Ubuntu base: `ubuntu:24.04@sha256:68ee22004a9109b44973313b02ff7b1de250f1de0f5ecb628d73f579aaff33ac`.
APT snapshot: `20261001T000000Z` (noble, noble-updates, noble-security).
Compiler: GCC 4.9.4 copied from `gcc:4.9@sha256:6356ef8b29cc3522527a85b6c58a28626744514bea87a10ff2bf67599a7474f5` into `/opt/gcc-4.9` (`/usr/bin/g++` links to it);
it uses the image's binutils and glibc 2.39 headers/crt files. This matches the inferred original Security Traps
judge (Linux x86-64, glibc, GCC 4.x, `-O0`, strict C++11, no stack protector); see `docs/operations.md`.
Pinned packages: binutils `2.42-4ubuntu2.10`, libc6-dev `2.39-0ubuntu8.9`, util-linux `2.39.3-9ubuntu6.6`,
procps `2:4.0.4-4ubuntu3.3`, tini `0.19.0-1`, bubblewrap `0.9.0-1ubuntu0.3`.
`g++ --version`: `g++ (GCC) 4.9.4`.
Docker Desktop linux/amd64 probe: tier C exits 1 (mounting proc: Operation not permitted);
tier B is selected. `/health` reports `sandbox:"B", oomProtected:false` on this host.
Local Apple Silicon QA uses `--platform linux/arm64` because Rosetta cannot run under RLIMIT_AS; amd64 is validated in CI.

BASE_FLAGS: `-std=c++11 -O0 -fno-stack-protector -w -fmax-errors=5`.
GCC 4.9 is non-PIE and emits no CET instrumentation by default, and falls off the end of a non-void function
without a trap, which puzzles #4, #5, #13 and #14 rely on. Strict C++11 translates trigraphs (`??/`, `??=`, ...).
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
