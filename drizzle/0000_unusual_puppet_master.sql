CREATE TABLE `account_library` (
	`user_id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`generation` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `library_chunks` (
	`user_id` text NOT NULL,
	`generation` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`user_id`, `generation`, `chunk_index`)
);
