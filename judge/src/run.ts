import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { constants as osConstants } from "node:os";
import { chmod, chown, copyFile, mkdir, mkdtemp, open, readdir, rm, writeFile } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { BASE_FLAGS } from "../../shared/src/contract.js";
import type { JudgeHealth, JudgeRequest, JudgeResponse } from "../../shared/src/contract.js";

const ENV = { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" } as const;
const COMPILE_LIMITS = [
  "--cpu=10:11", "--as=805306368", "--nproc=32", "--fsize=33554432",
  "--nofile=256", "--core=0",
] as const;
const RUN_LIMITS = [
  "--cpu=2:3", "--as=100663296", "--nproc=8", "--fsize=1048576",
  "--nofile=64", "--core=0", "--stack=8388608",
] as const;
export const health: { -readonly [Key in keyof JudgeHealth]: JudgeHealth[Key] } = {
  ok: true, version: "1", gcc: "", sandbox: "B", oomProtected: false,
};

const NAMESPACES = [
  "--unshare-ipc", "--unshare-pid", "--unshare-net", "--unshare-uts", "--unshare-cgroup-try",
  "--die-with-parent",
];

function errorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function rootCommand(command: string, args: readonly string[]): string {
  const result = spawnSync(command, args, {
    env: ENV, encoding: "utf8", timeout: 3_000, maxBuffer: 65_536,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command}: ${result.stderr}`);
  return result.stdout;
}

export async function initialize(): Promise<void> {
  try {
    await writeFile("/proc/self/oom_score_adj", "-1000");
    health.oomProtected = true;
  } catch (error) {
    if (!errorCode(error, "EACCES") && !errorCode(error, "EPERM")) throw error;
  }
  try {
    await chmod("/dev/shm", 0o700);
  } catch (error) {
    if (!errorCode(error, "ENOENT")) throw error;
  }
  await mkdir("/work", { recursive: true, mode: 0o711 });
  await chmod("/work", 0o711);
  health.gcc = rootCommand("/usr/bin/g++", ["--version"]).split("\n")[0] ?? "";
  // Probe the exact Tier C shape used for runs: root bwrap without a user namespace (a user
  // namespace would leave the runner uid unmapped), chdir into a runner-owned directory, drop to it.
  const probeDirectory = await mkdtemp("/work/probe-");
  await chown(probeDirectory, 61001, 61001);
  const probe = spawnSync("/usr/bin/bwrap", [
    ...NAMESPACES, "--ro-bind", "/", "/", "--bind", probeDirectory, probeDirectory,
    "--tmpfs", "/tmp", "--proc", "/proc", "--dev", "/dev", "--chdir", "/",
    "/usr/bin/setpriv", "--reuid=61001", "--regid=61001", "--clear-groups",
    "/usr/bin/env", "-C", probeDirectory, "/usr/bin/true",
  ], { env: ENV, timeout: 3_000, stdio: "ignore" });
  await rm(probeDirectory, { recursive: true, force: true });
  health.sandbox = probe.status === 0 ? "C" : "B";
}

function killGroup(pid: number): void {
  try {
    process.kill(-pid, "SIGKILL");
  } catch (error) {
    if (!errorCode(error, "ESRCH")) throw error;
  }
}

async function sweep(): Promise<void> {
  // A new session can escape the original group, but not the dedicated uid.
  for (let attempt = 0; attempt <= 20; attempt++) {
    const killed = spawnSync("/usr/bin/pkill", ["-KILL", "-u", "61001"], {
      env: ENV, timeout: 1_000, stdio: "ignore",
    });
    if (killed.error) throw killed.error;
    if (killed.status !== 0 && killed.status !== 1) throw new Error("pkill failed");
    const processes = rootCommand("/usr/bin/ps", ["-eo", "uid=,pid="]);
    if (!processes.split("\n").some(line => line.trim().split(/\s+/)[0] === "61001")) return;
    if (attempt < 20) await delay(100);
  }
  health.ok = false;
  throw new Error("Runner processes survived cleanup");
}

function sandboxCommand(directory: string, limits: readonly string[], command: readonly string[]): string[] {
  const restricted = [
    "/usr/bin/setpriv", "--reuid=61001", "--regid=61001", "--clear-groups",
    "--no-new-privs", "--bounding-set=-all", "--inh-caps=-all", "--",
    "/usr/bin/choom", "-n", "1000", "--", "/usr/bin/prlimit", ...limits, "--",
    // bwrap drops root's capabilities, so the runner, who owns the directory, enters it.
    "/usr/bin/env", "-C", directory, ...command,
  ];
  return health.sandbox === "C" ? [
    "/usr/bin/bwrap", ...NAMESPACES, "--new-session",
    "--ro-bind", "/", "/", "--bind", directory, directory, "--tmpfs", "/tmp",
    "--proc", "/proc", "--dev", "/dev", "--chdir", "/", "--", ...restricted,
  ] : restricted;
}

type Execution = {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly timedOut: boolean;
  readonly ms: number;
  readonly stderr: string;
};

type Exit = { readonly exitCode: number | null; readonly signal: NodeJS.Signals | null };

// bwrap reports a child killed by signal N as exit status 128 + N; restore the signal.
function unwrapBwrap(binary: string, exit: Exit): Exit {
  if (binary !== "/usr/bin/bwrap" || exit.signal !== null || exit.exitCode === null || exit.exitCode <= 128) return exit;
  const name = Object.entries(osConstants.signals).find(([, number]) => number === exit.exitCode! - 128)?.[0];
  return name ? { exitCode: null, signal: name as NodeJS.Signals } : exit;
}

async function execute(
  command: readonly string[], directory: string, wallMs: number,
  outputs?: readonly [FileHandle, FileHandle, FileHandle],
  compile = false,
): Promise<Execution> {
  const [binary, ...args] = command;
  if (!binary) throw new Error("Missing executable");
  const started = performance.now();
  const child = spawn(binary, args, {
    cwd: directory, detached: true,
    env: compile ? { ...ENV, HOME: directory, TMPDIR: directory } : { ...ENV, HOME: directory },
    stdio: outputs ? ["ignore", outputs[0].fd, outputs[1].fd, outputs[2].fd] : ["ignore", "ignore", "pipe"],
  });
  let timedOut = false;
  let diagnosticBytes = 0;
  const diagnostics: Buffer[] = [];
  child.stderr?.on("data", (chunk: Buffer) => {
    const remaining = 65_536 - diagnosticBytes;
    if (remaining > 0) diagnostics.push(chunk.subarray(0, remaining));
    diagnosticBytes += chunk.length;
    if (diagnosticBytes >= 65_536 && child.pid) killGroup(child.pid);
  });
  const timer = setTimeout(() => {
    timedOut = true;
    if (child.pid) killGroup(child.pid);
  }, wallMs);
  try {
    const result = await new Promise<{ readonly exitCode: number | null; readonly signal: NodeJS.Signals | null }>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (exitCode, signal) => resolve({ exitCode, signal }));
    });
    return { ...unwrapBwrap(binary, result), timedOut, ms: Math.round(performance.now() - started), stderr: Buffer.concat(diagnostics).subarray(0, 8_192).toString("utf8") };
  } finally {
    clearTimeout(timer);
    if (child.pid) killGroup(child.pid);
    try {
      await sweep();
    } finally {
      child.stderr?.destroy();
    }
  }
}

async function readPrefix(file: FileHandle, limit: number): Promise<Buffer> {
  const bytes = Buffer.alloc(limit);
  const { bytesRead } = await file.read(bytes, 0, limit, 0);
  return bytes.subarray(0, bytesRead);
}

export async function judge(request: JudgeRequest): Promise<JudgeResponse> {
  const directory = await mkdtemp("/work/run-");
  const scratch = await mkdtemp("/judge/token-");
  const files: FileHandle[] = [];
  try {
    await chmod(scratch, 0o700);
    await chown(directory, 61001, 61001);
    const nonce = randomBytes(16).toString("hex");
    await writeFile(`${scratch}/victory.cpp`, `#include <unistd.h>\nextern "C" void victory(){ write(3, "${nonce}", 32); _exit(0); }\n`, { mode: 0o600 });
    const token = await execute(["/usr/bin/g++", ...BASE_FLAGS, "-c", "victory.cpp", "-o", "victory.o"], scratch, 15_000);
    if (token.exitCode !== 0) throw new Error("Unable to compile victory object");
    await copyFile(`${scratch}/victory.o`, `${directory}/victory.o`);
    await rm(scratch, { recursive: true, force: true });
    await writeFile(`${directory}/victory.h`, 'extern "C" void victory();');
    await writeFile(`${directory}/main.cpp`, request.source);
    const compile = await execute(sandboxCommand(directory, COMPILE_LIMITS, [
      "/usr/bin/g++", "-include", "victory.h", ...BASE_FLAGS, ...(request.flags ?? []),
      "main.cpp", "victory.o", "-o", "prog",
    ]), directory, 15_000, undefined, true);
    const response: JudgeResponse = {
      judge: { version: health.version, gcc: health.gcc },
      compile: { ok: compile.exitCode === 0, ms: compile.ms, stderr: compile.stderr },
    };
    if (!response.compile.ok) return response;
    for (const name of await readdir(directory)) {
      if (name === "main.cpp" || name.endsWith(".o")) await rm(`${directory}/${name}`, { force: true });
    }
    // Keep handles, not attacker-replaceable paths, for the three output files.
    for (const name of ["stdout", "stderr", "verdict"]) {
      files.push(await open(`${directory}/${name}`, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW, 0o600));
    }
    const [stdout, stderr, verdict] = files;
    if (!stdout || !stderr || !verdict) throw new Error("Missing output handles");
    const run = await execute(sandboxCommand(directory, RUN_LIMITS, ["./prog"]), directory, 2_000, [stdout, stderr, verdict]);
    return {
      ...response,
      run: {
        exitCode: run.exitCode, signal: run.signal, timedOut: run.timedOut, ms: run.ms,
        stdout: (await readPrefix(stdout, 4_096)).toString("utf8"),
        stderr: (await readPrefix(stderr, 4_096)).toString("utf8"),
        victory: (await readPrefix(verdict, 1_024)).equals(Buffer.from(nonce)),
      },
    };
  } finally {
    try {
      await sweep();
    } finally {
      for (const file of files) await file.close();
      rootCommand("/usr/bin/find", ["/tmp", "/var/tmp", "/dev/shm", "-xdev", "-depth", "-uid", "61001", "-delete"]);
      await rm(directory, { recursive: true, force: true });
      await rm(scratch, { recursive: true, force: true });
    }
  }
}
