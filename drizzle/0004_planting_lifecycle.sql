ALTER TABLE `varieties` ADD `days_to_maturity` integer;--> statement-breakpoint
ALTER TABLE `varieties` ADD `dtm_from` text;--> statement-breakpoint
ALTER TABLE `varieties` ADD `crop_family` text;--> statement-breakpoint
ALTER TABLE `plantings` ADD `sown_at` integer;--> statement-breakpoint
ALTER TABLE `plantings` ADD `transplanted_at` integer;--> statement-breakpoint
ALTER TABLE `plantings` ADD `expected_harvest_at` integer;--> statement-breakpoint
ALTER TABLE `plantings` ADD `closed_at` integer;--> statement-breakpoint
ALTER TABLE `plantings` ADD `days_to_maturity` integer;--> statement-breakpoint
ALTER TABLE `plantings` ADD `crop_family` text;--> statement-breakpoint
CREATE INDEX `plantings_parent_planting_id_idx` ON `plantings` (`parent_planting_id`);
