CREATE TABLE `herds` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`species` text NOT NULL,
	`head_count` integer NOT NULL,
	`avg_weight_lb` real NOT NULL,
	`dm_intake_pct` real,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `herds_user_id_idx` ON `herds` (`user_id`);--> statement-breakpoint
CREATE TABLE `paddocks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`location_id` text NOT NULL,
	`primary_forage` text,
	`acres` real,
	`rest_target_days` integer,
	`start_height_in` real,
	`stop_height_in` real,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `paddocks_location_id_unique` ON `paddocks` (`location_id`);--> statement-breakpoint
CREATE INDEX `paddocks_user_id_idx` ON `paddocks` (`user_id`);--> statement-breakpoint
CREATE TABLE `grazing_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`herd_id` text NOT NULL,
	`location_id` text NOT NULL,
	`moved_in_at` integer NOT NULL,
	`moved_out_at` integer,
	`height_in_in` real,
	`height_out_in` real,
	`forage_species` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`herd_id`) REFERENCES `herds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `grazing_events_user_id_idx` ON `grazing_events` (`user_id`);--> statement-breakpoint
CREATE INDEX `grazing_events_herd_id_idx` ON `grazing_events` (`herd_id`);--> statement-breakpoint
CREATE INDEX `grazing_events_location_id_idx` ON `grazing_events` (`location_id`);--> statement-breakpoint
CREATE INDEX `grazing_events_moved_in_at_idx` ON `grazing_events` (`moved_in_at`);
