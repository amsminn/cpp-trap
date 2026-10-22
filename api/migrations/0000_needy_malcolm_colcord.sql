CREATE TABLE `daily_quota` (
	`day` text PRIMARY KEY NOT NULL,
	`n` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `problem_secrets` (
	`number` integer PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`flags_json` text NOT NULL,
	FOREIGN KEY (`number`) REFERENCES `problems`(`number`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `problems` (
	`number` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`statement` text NOT NULL,
	`skeleton` text NOT NULL,
	`constraints_json` text NOT NULL,
	`goal_json` text NOT NULL,
	`credit` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`problem_number` integer NOT NULL,
	`code` text NOT NULL,
	`chars` integer NOT NULL,
	`verdict` text DEFAULT 'queued' NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`compiler_output` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`judged_at` text,
	`idempotency_key` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`problem_number`) REFERENCES `problems`(`number`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_user_id_idempotency_key_unique` ON `submissions` (`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `submissions_problem_verdict_chars_idx` ON `submissions` (`problem_number`,`verdict`,`chars`);--> statement-breakpoint
CREATE INDEX `submissions_user_created_at_idx` ON `submissions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `user_daily` (
	`day` text NOT NULL,
	`user_id` integer NOT NULL,
	`n` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `user_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY NOT NULL,
	`github_id` integer NOT NULL,
	`login` text NOT NULL,
	`avatar_url` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_github_id_unique` ON `users` (`github_id`);