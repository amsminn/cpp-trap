import { Container, getContainer } from "@cloudflare/containers";
import { buildSource } from "@cpp-trap/shared";
import type {
  HealthView,
  JudgeHealth,
  JudgeRequest,
  JudgeResponse,
} from "@cpp-trap/shared";
import type { Env } from "./env";

const TOTAL_BUDGET_MS = 27_000;
const FETCH_TIMEOUT_MS = 25_000;
const BUSY_RETRY_DELAY_MS = 1_500;
const MAX_BUSY_RETRIES = 3;
const LAST_HEALTH_KEY = "last-health";

type JudgeUnavailable = { readonly unavailable: true };
type JudgeStatus = {
  readonly running: boolean;
  readonly last: JudgeHealth | null;
};

export type JudgeResult = JudgeResponse | JudgeUnavailable;

export { buildSource };

export class Judge extends Container {
  defaultPort = 8080;
  sleepAfter = "30s";
  enableInternet = false;

  async status(): Promise<JudgeStatus> {
    return {
      running: this.ctx.container?.running ?? false,
      last: (await this.ctx.storage.get<JudgeHealth>(LAST_HEALTH_KEY)) ?? null,
    };
  }

  override async fetch(request: Request): Promise<Response> {
    const response = await this.containerFetch(request);

    if (
      new URL(request.url).pathname === "/health" &&
      response.ok
    ) {
      const health: JudgeHealth = await response.clone().json();
      await this.ctx.storage.put(LAST_HEALTH_KEY, health);
    }

    return response;
  }
}

export async function callJudge(
  env: Env,
  req: JudgeRequest,
): Promise<JudgeResult> {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const judge = getJudge(env);
  let busyRetries = 0;

  while (Date.now() < deadline) {
    const remainingMs = deadline - Date.now();
    const timeoutMs = Math.min(FETCH_TIMEOUT_MS, remainingMs);

    try {
      const response = await judge.fetch(
        new Request("http://judge/judge", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(req),
          signal: AbortSignal.timeout(timeoutMs),
        }),
      );

      if (response.status === 503 && busyRetries < MAX_BUSY_RETRIES) {
        busyRetries += 1;
        const retryDelayMs = Math.min(
          BUSY_RETRY_DELAY_MS,
          deadline - Date.now(),
        );
        if (retryDelayMs > 0) {
          await scheduler.wait(retryDelayMs);
        }
        continue;
      }

      if (response.status >= 500) {
        return { unavailable: true };
      }

      if (!response.ok) {
        return { unavailable: true };
      }

      return await response.json<JudgeResponse>();
    } catch (error) {
      if (error instanceof Error) {
        return { unavailable: true };
      }
      throw error;
    }
  }

  return { unavailable: true };
}

export async function judgeHealth(env: Env): Promise<HealthView["judge"]> {
  const judge = getJudge(env);
  const status = await judge.status();

  if (!status.running) {
    return status.last === null ? "unreachable" : toHealthView(status.last);
  }

  try {
    const response = await judge.fetch(new Request("http://judge/health"));
    if (!response.ok) {
      return status.last === null ? "unreachable" : toHealthView(status.last);
    }

    const health: JudgeHealth = await response.json();
    return toHealthView(health);
  } catch (error) {
    if (error instanceof Error) {
      return status.last === null ? "unreachable" : toHealthView(status.last);
    }
    throw error;
  }
}

function toHealthView(health: JudgeHealth): Exclude<HealthView["judge"], string> {
  return {
    ok: health.ok,
    gcc: health.gcc,
    version: health.version,
    sandbox: health.sandbox,
  };
}

function getJudge(env: Env): DurableObjectStub<Judge> {
  return getContainer<Judge>(
    env.JUDGE as DurableObjectNamespace<Judge>,
    "judge-0",
  );
}
