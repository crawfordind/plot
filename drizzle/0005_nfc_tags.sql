CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`tag_code` text NOT NULL,
	`chip_uid` text,
	`kind` text DEFAULT 'nfc' NOT NULL,
	`scope` text DEFAULT 'tube' NOT NULL,
	`location_id` text NOT NULL,
	`planting_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`alias_of_tag_id` text,
	`written_lat` real,
	`written_lng` real,
	`written_by` text,
	`written_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_read_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`planting_id`) REFERENCES `plantings`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`alias_of_tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`written_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_tag_code_unique` ON `tags` (`tag_code`);--> statement-breakpoint
CREATE INDEX `tags_org_id_idx` ON `tags` (`org_id`);--> statement-breakpoint
CREATE INDEX `tags_location_id_idx` ON `tags` (`location_id`);--> statement-breakpoint
CREATE INDEX `tags_last_read_at_idx` ON `tags` (`last_read_at`);--> statement-breakpoint
CREATE TABLE `tag_reads` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`user_id` text,
	`read_via` text DEFAULT 'nfc' NOT NULL,
	`lat` real,
	`lng` real,
	`event_id` text,
	`read_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tag_reads_tag_id_idx` ON `tag_reads` (`tag_id`);--> statement-breakpoint
CREATE INDEX `tag_reads_org_id_idx` ON `tag_reads` (`org_id`);--> statement-breakpoint
CREATE INDEX `tag_reads_read_at_idx` ON `tag_reads` (`read_at`);--> statement-breakpoint
ALTER TABLE `organizations` ADD `height_unit` text DEFAULT 'cm' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `survival` text;--> statement-breakpoint
ALTER TABLE `events` ADD `height_cm` real;--> statement-breakpoint
ALTER TABLE `events` ADD `caliper_mm` real;--> statement-breakpoint
ALTER TABLE `events` ADD `height_ref` text;--> statement-breakpoint
ALTER TABLE `events` ADD `damage` text;--> statement-breakpoint
ALTER TABLE `events` ADD `tube_condition` text;--> statement-breakpoint
ALTER TABLE `events` ADD `replaced_by_id` text;
