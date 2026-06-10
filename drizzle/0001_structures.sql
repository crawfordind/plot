ALTER TABLE `locations` ADD COLUMN `parent_id` text REFERENCES `locations`(`id`) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `locations_parent_id_idx` ON `locations` (`parent_id`);
