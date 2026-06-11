import { relations, sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

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
      enum: [
        "farm",
        "field",
        "zone",
        "hoophouse",
        "bed",
        "row",
        "alley",
        "fence",
        "paddock",
      ],
    }).notNull(),
    // Self-reference so structures nest: farm › hoophouse › bed › row.
    parentId: text("parent_id").references((): AnySQLiteColumn => locations.id, {
      onDelete: "cascade",
    }),
    geometry: text("geometry").notNull(),
    zone: text("zone"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("locations_user_id_idx").on(table.userId),
    index("locations_parent_id_idx").on(table.parentId),
  ],
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

// A livestock group (mob/flock/herd) the producer rotates through paddocks.
// species + headCount + avgWeightLb drive the NRCS forage-animal balance math.
export const herds = sqliteTable(
  "herds",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    species: text("species", {
      enum: ["cattle", "sheep", "goat", "horse", "poultry", "other"],
    }).notNull(),
    headCount: integer("head_count").notNull(),
    avgWeightLb: real("avg_weight_lb").notNull(),
    // DM intake as % of body weight; null falls back to a per-species default.
    dmIntakePct: real("dm_intake_pct"),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [index("herds_user_id_idx").on(table.userId)],
);

// 1:1 grazing configuration layered onto a `location` of type "paddock".
// Keeps the map feature (geometry) in `locations` and the agronomy here.
export const paddocks = sqliteTable(
  "paddocks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    locationId: text("location_id")
      .notNull()
      .unique()
      .references(() => locations.id, { onDelete: "cascade" }),
    primaryForage: text("primary_forage"),
    // Acreage override; when null, computed from the location geometry.
    acres: real("acres"),
    // Prescribed recovery (rest) target before re-grazing, in days.
    restTargetDays: integer("rest_target_days"),
    // Prescribed "start"/"stop" grazing heights (inches), per NRCS 528.
    startHeightIn: real("start_height_in"),
    stopHeightIn: real("stop_height_in"),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [index("paddocks_user_id_idx").on(table.userId)],
);

// One row per grazing period: this herd on this paddock from movedInAt to
// movedOutAt. An open row (movedOutAt null) means the herd is grazing there now.
// This table IS the NRCS 528 Recordkeeping Worksheet.
export const grazingEvents = sqliteTable(
  "grazing_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    herdId: text("herd_id")
      .notNull()
      .references(() => herds.id, { onDelete: "cascade" }),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    movedInAt: integer("moved_in_at", { mode: "timestamp_ms" }).notNull(),
    movedOutAt: integer("moved_out_at", { mode: "timestamp_ms" }),
    // Grazing height (inches) when animals went on / came off.
    heightInIn: real("height_in_in"),
    heightOutIn: real("height_out_in"),
    forageSpecies: text("forage_species"),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("grazing_events_user_id_idx").on(table.userId),
    index("grazing_events_herd_id_idx").on(table.herdId),
    index("grazing_events_location_id_idx").on(table.locationId),
    index("grazing_events_moved_in_at_idx").on(table.movedInAt),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  locations: many(locations),
  plantings: many(plantings),
  events: many(events),
  herds: many(herds),
  paddocks: many(paddocks),
  grazingEvents: many(grazingEvents),
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
  parent: one(locations, {
    fields: [locations.parentId],
    references: [locations.id],
    relationName: "location_parent",
  }),
  children: many(locations, { relationName: "location_parent" }),
  plantings: many(plantings),
  events: many(events),
  seasons: many(seasons),
  paddock: one(paddocks, {
    fields: [locations.id],
    references: [paddocks.locationId],
  }),
  grazingEvents: many(grazingEvents),
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

export const herdsRelations = relations(herds, ({ one, many }) => ({
  user: one(users, {
    fields: [herds.userId],
    references: [users.id],
  }),
  grazingEvents: many(grazingEvents),
}));

export const paddocksRelations = relations(paddocks, ({ one }) => ({
  user: one(users, {
    fields: [paddocks.userId],
    references: [users.id],
  }),
  location: one(locations, {
    fields: [paddocks.locationId],
    references: [locations.id],
  }),
}));

export const grazingEventsRelations = relations(grazingEvents, ({ one }) => ({
  user: one(users, {
    fields: [grazingEvents.userId],
    references: [users.id],
  }),
  herd: one(herds, {
    fields: [grazingEvents.herdId],
    references: [herds.id],
  }),
  location: one(locations, {
    fields: [grazingEvents.locationId],
    references: [locations.id],
  }),
}));
