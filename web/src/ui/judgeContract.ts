import { BASE_FLAGS } from "@cpp-trap/shared";

/**
 * The judge environment the UI documents (V031), in one place so the problem editor and About cannot drift apart.
 * Every value mirrors the pinned judge image described in app/judge/README.md; the flags are the shared allowlisted
 * BASE_FLAGS themselves (re-exported, never copied), and the limits are the README's wall/CPU/AS/response figures.
 * These are documentation constants: no request fetches them and no judge or shared code reads them.
 */
export { BASE_FLAGS };

/** `g++ --version` inside the image: g++ (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0 on ubuntu:24.04. */
export const JUDGE_COMPILER = "g++ 13.3.0 (Ubuntu 24.04)";

/** The language standard the judge compiles with: the leading BASE_FLAGS entry, which the type check keeps a -std= flag. */
export const LANGUAGE_FLAG = BASE_FLAGS[0] satisfies `-std=${string}`;

export const COMPILE_WALL_SECONDS = 15;

export const RUN_WALL_SECONDS = 2;

/** Program CPU-time limit in seconds (the soft RLIMIT_CPU). */
export const RUN_CPU_SECONDS = 2;

/** Program address-space limit: RLIMIT_AS 100663296 bytes. */
export const RUN_MEMORY_MIB = 96;

/** Bytes of stdout and of stderr returned with a verdict (the first 4 KiB of each). */
export const OUTPUT_LIMIT_BYTES = 4096;

/** Submissions one judge runs at the same time: one active request, the rest wait in the queue. */
export const JUDGE_CONCURRENCY = 1;
