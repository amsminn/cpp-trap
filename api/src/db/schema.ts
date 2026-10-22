import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { Verdict } from "@cpp-trap/shared";

const createdAt = () => text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

export const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  githubId: integer("github_id").notNull().unique(),
  login: text("login").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: createdAt(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  // Unix milliseconds, compared against Date.now().
  expiresAt: integer("expires_at").notNull(),
  createdAt: createdAt(),
});

export const problems = sqliteTable("problems", {
  number: integer("number").primaryKey(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  statement: text("statement").notNull(),
  skeleton: text("skeleton").notNull(),
  constraintsJson: text("constraints_json").notNull(),
  goalJson: text("goal_json").notNull(),
  credit: text("credit").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export const problemSecrets = sqliteTable("problem_secrets", {
  number: integer("number").primaryKey().references(() => problems.number),
  source: text("source").notNull(),
  flagsJson: text("flags_json").notNull(),
});

export const submissions = sqliteTable("submissions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: integer("user_id").notNull().references(() => users.id),
  problemNumber: integer("problem_number").notNull().references(() => problems.number),
  code: text("code").notNull(),
  chars: integer("chars").notNull(),
  verdict: text("verdict").$type<Verdict>().notNull().default("queued"),
  message: text("message").notNull().default(""),
  compilerOutput: text("compiler_output"),
  createdAt: createdAt(),
  judgedAt: text("judged_at"),
  idempotencyKey: text("idempotency_key").notNull(),
}, (table) => [
  uniqueIndex("submissions_user_id_idempotency_key_unique").on(table.userId, table.idempotencyKey),
  index("submissions_problem_verdict_chars_idx").on(table.problemNumber, table.verdict, table.chars),
  index("submissions_user_created_at_idx").on(table.userId, table.createdAt),
]);

export const userDaily = sqliteTable("user_daily", {
  day: text("day").notNull(),
  userId: integer("user_id").notNull().references(() => users.id),
  n: integer("n").notNull().default(0),
}, (table) => [primaryKey({ columns: [table.day, table.userId] })]);

export const dailyQuota = sqliteTable("daily_quota", {
  day: text("day").primaryKey(),
  n: integer("n").notNull().default(0),
});
