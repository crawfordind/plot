import { relations, sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const locations = sqliteTable(
  "locations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type", {
      enum: ["farm", "bed", "zone", "hoophouse", "alley"],
    }).notNull(),
    geometry: text("geometry").notNull(),
    zone: text("zone"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [index("locations_user_id_idx").on(table.userId)],
);

export const varieties = sqliteTable(
  "varieties",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    plantType: text("plant_type", {
      enum: ["crop", "flower", "tree", "breeding_line"],
    }).notNull(),
    lineageParentIds: text("lineage_parent_ids"),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [index("varieties_user_id_idx").on(table.userId)],
);

export const seasons = sqliteTable(
  "seasons",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    locationId: text("location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    label: text("label").notNull(),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
    endsAt: integer("ends_at", { mode: "timestamp_ms" }).notNull(),
    status: text("status", { enum: ["active", "closed"] })
      .notNull()
      .default("active"),
    reviewSummary: text("review_summary"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("seasons_user_id_idx").on(table.userId),
    index("seasons_location_id_idx").on(table.locationId),
  ],
);

export const plantings = sqliteTable(
  "plantings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    varietyId: text("variety_id").references(() => varieties.id, {
      onDelete: "set null",
    }),
    plantType: text("plant_type", {
      enum: ["crop", "flower", "tree", "breeding_line"],
    }).notNull(),
    commonName: text("common_name").notNull(),
    variety: text("variety"),
    source: text("source"),
    status: text("status", {
      enum: ["active", "harvested", "archived"],
    })
      .notNull()
      .default("active"),
    seasonId: text("season_id").references(() => seasons.id, {
      onDelete: "set null",
    }),
    parentPlantingId: text("parent_planting_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("plantings_user_id_idx").on(table.userId),
    index("plantings_location_id_idx").on(table.locationId),
    index("plantings_variety_id_idx").on(table.varietyId),
  ],
);

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    plantingId: text("planting_id").references(() => plantings.id, {
      onDelete: "set null",
    }),
    locationId: text("location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    type: text("type", {
      enum: [
        "sow",
        "transplant",
        "water",
        "amend",
        "observe",
        "harvest",
        "cross",
        "seed_save",
        "sale",
        "cost",
        "other",
      ],
    }).notNull(),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    quantity: real("quantity"),
    unit: text("unit"),
    amount: real("amount"),
    rawText: text("raw_text"),
    parsedJson: text("parsed_json"),
    weatherSnapshot: text("weather_snapshot"),
    gpsPoint: text("gps_point"),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("events_user_id_idx").on(table.userId),
    index("events_planting_id_idx").on(table.plantingId),
    index("events_location_id_idx").on(table.locationId),
    index("events_occurred_at_idx").on(table.occurredAt),
  ],
);

export const crosses = sqliteTable(
  "crosses",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    motherPlantingId: text("mother_planting_id")
      .notNull()
      .references(() => plantings.id, { onDelete: "cascade" }),
    fatherPlantingId: text("father_planting_id")
      .notNull()
      .references(() => plantings.id, { onDelete: "cascade" }),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    resultLineId: text("result_line_id").references(() => plantings.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [index("crosses_user_id_idx").on(table.userId)],
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  locations: many(locations),
  plantings: many(plantings),
  events: many(events),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const locationsRelations = relations(locations, ({ one, many }) => ({
  user: one(users, {
    fields: [locations.userId],
    references: [users.id],
  }),
  plantings: many(plantings),
  events: many(events),
  seasons: many(seasons),
}));

export const plantingsRelations = relations(plantings, ({ one, many }) => ({
  user: one(users, {
    fields: [plantings.userId],
    references: [users.id],
  }),
  location: one(locations, {
    fields: [plantings.locationId],
    references: [locations.id],
  }),
  variety: one(varieties, {
    fields: [plantings.varietyId],
    references: [varieties.id],
  }),
  season: one(seasons, {
    fields: [plantings.seasonId],
    references: [seasons.id],
  }),
  events: many(events),
}));

export const eventsRelations = relations(events, ({ one }) => ({
  user: one(users, {
    fields: [events.userId],
    references: [users.id],
  }),
  planting: one(plantings, {
    fields: [events.plantingId],
    references: [plantings.id],
  }),
  location: one(locations, {
    fields: [events.locationId],
    references: [locations.id],
  }),
}));
