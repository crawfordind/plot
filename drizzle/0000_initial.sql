CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`password_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);
--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`geometry` text NOT NULL,
	`zone` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `locations_user_id_idx` ON `locations` (`user_id`);
--> statement-breakpoint
CREATE TABLE `varieties` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`plant_type` text NOT NULL,
	`lineage_parent_ids` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `varieties_user_id_idx` ON `varieties` (`user_id`);
--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`location_id` text,
	`label` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`review_summary` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `seasons_user_id_idx` ON `seasons` (`user_id`);
--> statement-breakpoint
CREATE INDEX `seasons_location_id_idx` ON `seasons` (`location_id`);
--> statement-breakpoint
CREATE TABLE `plantings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`location_id` text NOT NULL,
	`variety_id` text,
	`plant_type` text NOT NULL,
	`common_name` text NOT NULL,
	`variety` text,
	`source` text,
	`status` text DEFAULT 'active' NOT NULL,
	`season_id` text,
	`parent_planting_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variety_id`) REFERENCES `varieties`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `plantings_user_id_idx` ON `plantings` (`user_id`);
--> statement-breakpoint
CREATE INDEX `plantings_location_id_idx` ON `plantings` (`location_id`);
--> statement-breakpoint
CREATE INDEX `plantings_variety_id_idx` ON `plantings` (`variety_id`);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`planting_id` text,
	`location_id` text,
	`type` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`quantity` real,
	`unit` text,
	`amount` real,
	`raw_text` text,
	`parsed_json` text,
	`weather_snapshot` text,
	`gps_point` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`planting_id`) REFERENCES `plantings`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `events_user_id_idx` ON `events` (`user_id`);
--> statement-breakpoint
CREATE INDEX `events_planting_id_idx` ON `events` (`planting_id`);
--> statement-breakpoint
CREATE INDEX `events_location_id_idx` ON `events` (`location_id`);
--> statement-breakpoint
CREATE INDEX `events_occurred_at_idx` ON `events` (`occurred_at`);
--> statement-breakpoint
CREATE TABLE `crosses` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mother_planting_id` text NOT NULL,
	`father_planting_id` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`result_line_id` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mother_planting_id`) REFERENCES `plantings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`father_planting_id`) REFERENCES `plantings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`result_line_id`) REFERENCES `plantings`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `crosses_user_id_idx` ON `crosses` (`user_id`);
