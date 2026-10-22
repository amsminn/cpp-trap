export type Env = {
  readonly DB: D1Database;
  readonly JUDGE: DurableObjectNamespace;
  readonly RATE_LIMIT: RateLimit;
  readonly ASSETS: Fetcher;
  readonly DAILY_LIMIT: string;
  readonly USER_DAILY_LIMIT: string;
  readonly SUBMISSIONS_ENABLED: string;
  readonly GITHUB_ID: string;
  readonly GITHUB_SECRET: string;
  readonly TURNSTILE_SECRET: string;
  readonly SESSION_PEPPER: string;
};
