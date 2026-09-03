import { relations, sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { LOCATION_TYPE_VALUES } from "../lib/locations/catalog";
import { CROP_FAMILY_VALUES } from "../lib/crops/family";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// A workspace: a farm/company/group that OWNS data. Every data row carries an
// orgId; users collaborate by being members of the same organization.
export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdByUserId: text("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  // Display unit for tree/tube heights. Storage is always centimetres (see
  // lib/tags/units.ts); this only decides what the field UI shows and steps by,
  // so switching it is a preference change, never a data migration.
  heightUnit: text("height_unit", { enum: ["cm", "in"] })
    .notNull()
    .default("cm"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// Links a user to an organization with a role. A user can belong to several orgs.
export const memberships = sqliteTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "admin", "member"] })
      .notNull()
      .default("member"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    // One membership per (org, user).
    uniqueIndex("memberships_org_user_idx").on(table.orgId, table.userId),
    index("memberships_user_id_idx").on(table.userId),
  ],
);

// Pending invitations to join an org, by email. Consumed when the invitee
// registers or logs in with that email. Lets you invite people before they sign up.
export const orgInvites = sqliteTable(
  "org_invites",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", { enum: ["owner", "admin", "member"] })
      .notNull()
      .default("member"),
    invitedByUserId: text("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("org_invites_email_idx").on(table.email),
    index("org_invites_org_id_idx").on(table.orgId),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The org this session is currently working in (the active workspace).
    activeOrgId: text("active_org_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

// Long-lived personal access tokens for read-only API access from outside the
// browser (e.g. loading a farm's GeoJSON as a layer in QGIS). Scoped to one org;
// only the SHA-256 hash is stored, so the raw token is shown once at creation.
export const apiTokens = sqliteTable(
  "api_tokens",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // SHA-256 (hex) of the raw token; we never store the token itself.
    tokenHash: text("token_hash").notNull().unique(),
    // First chars of the raw token, kept for display ("plot_a1b2c3…").
    prefix: text("prefix").notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [index("api_tokens_org_id_idx").on(table.orgId)],
);

export const locations = sqliteTable(
  "locations",
  {
    id: text("id").primaryKey(),
    // The workspace that owns this row (all members of the org share it).
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // The member who created it (audit; ownership/visibility is by orgId).
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type", { enum: LOCATION_TYPE_VALUES }).notNull(),
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
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    plantType: text("plant_type", {
      enum: ["crop", "flower", "tree", "breeding_line"],
    }).notNull(),
    lineageParentIds: text("lineage_parent_ids"),
    // Agronomy reference, entered once and reused: days-to-maturity (and whether
    // that clock starts at sow or transplant) lets a planting auto-compute its
    // expected harvest; cropFamily backs rotation/disease-break reasoning.
    daysToMaturity: integer("days_to_maturity"),
    dtmFrom: text("dtm_from", { enum: ["sow", "transplant"] }),
    cropFamily: text("crop_family", { enum: CROP_FAMILY_VALUES }),
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
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
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
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
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
    // Real lifecycle dates (distinct from createdAt = when the record was
    // entered). sownAt/transplantedAt anchor the maturity clock; expectedHarvestAt
    // = anchor + daysToMaturity drives the "what's ready" view; closedAt is set
    // when a terminal harvest/seed-save advances status to "harvested".
    sownAt: integer("sown_at", { mode: "timestamp_ms" }),
    transplantedAt: integer("transplanted_at", { mode: "timestamp_ms" }),
    expectedHarvestAt: integer("expected_harvest_at", { mode: "timestamp_ms" }),
    closedAt: integer("closed_at", { mode: "timestamp_ms" }),
    daysToMaturity: integer("days_to_maturity"),
    cropFamily: text("crop_family", { enum: CROP_FAMILY_VALUES }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("plantings_user_id_idx").on(table.userId),
    index("plantings_location_id_idx").on(table.locationId),
    index("plantings_variety_id_idx").on(table.varietyId),
    index("plantings_parent_planting_id_idx").on(table.parentPlantingId),
  ],
);

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
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
        "visit",
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
    // ─── Visit fields (type = "visit") ──────────────────────────────────────
    // A tube check is just an event, so the Records panel, NL parser and CSV
    // export pick these up without a parallel store. All nullable: every other
    // event type leaves them empty.
    survival: text("survival", { enum: ["alive", "dead", "missing"] }),
    // Always centimetres on disk regardless of the org's display unit.
    heightCm: real("height_cm"),
    caliperMm: real("caliper_mm"),
    // Where the height was read from, so two crews' numbers stay comparable.
    heightRef: text("height_ref", {
      enum: ["inside", "at_tube_top", "above_tube"],
    }),
    // JSON string[]: "browse" | "rodent" | "insect" | "tube_down".
    damage: text("damage"),
    tubeCondition: text("tube_condition", {
      enum: ["intact", "loose", "down", "removed"],
    }),
    // Set when this visit recorded a replant: the planting that took over.
    replacedById: text("replaced_by_id"),
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
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
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
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
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
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
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
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
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

// Photos, media and documents attached to a location/asset. The bytes live on
// disk (see src/lib/attachments/storage.ts); this row holds the metadata and the
// stored filename pointer.
export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    // Original upload name (for display + download), and the random on-disk name.
    fileName: text("file_name").notNull(),
    storedName: text("stored_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    // Coarse bucket for UI rendering (image gets a thumbnail; others a file chip).
    kind: text("kind", {
      enum: ["image", "video", "document", "other"],
    }).notNull(),
    caption: text("caption"),
    // How the photo entered the system, which decides how it's labelled:
    //   asset_camera — shot in-app from a specific asset's panel (labelled as it)
    //   live_camera  — shot in-app with no asset (snapped to nearest by GPS)
    //   upload       — picked from the gallery/disk (geo from EXIF; user adds context)
    source: text("source", {
      enum: ["asset_camera", "live_camera", "upload"],
    })
      .notNull()
      .default("upload"),
    // Where the photo was taken and which way the camera faced. Captured live for
    // in-app shots; read from EXIF for uploads. All nullable — geo is best-effort.
    lat: real("lat"),
    lng: real("lng"),
    gpsAccuracyM: real("gps_accuracy_m"),
    // Compass heading in degrees (0=N, 90=E), i.e. the direction the lens pointed.
    heading: real("heading"),
    capturedAt: integer("captured_at", { mode: "timestamp_ms" }),
    // Reverse-geocoded place label for the coordinates (best-effort, may be null).
    placeLabel: text("place_label"),
    // Free-text context the user supplies before analysis (esp. for uploads).
    userContext: text("user_context"),
    // Lifecycle of the vision analysis for this photo.
    analysisStatus: text("analysis_status", {
      enum: ["pending", "processing", "done", "failed"],
    })
      .notNull()
      .default("pending"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("attachments_user_id_idx").on(table.userId),
    index("attachments_location_id_idx").on(table.locationId),
  ],
);

// One AI "read" of a photo by the agronomist/soil-scientist vision model. Kept in
// its own table (1:1 via the unique attachmentId) so re-analysis simply replaces
// the row and the lean `attachments` table stays focused on the file itself.
export const photoInsights = sqliteTable(
  "photo_insights",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    attachmentId: text("attachment_id")
      .notNull()
      .unique()
      .references(() => attachments.id, { onDelete: "cascade" }),
    // Provenance of the read so insights stay interpretable as models/prompts evolve.
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    // One-paragraph plain-language read of the photo.
    summary: text("summary").notNull(),
    // What the photo is mainly about — drives "right images for the right things".
    subjectType: text("subject_type", {
      enum: [
        "crop",
        "soil",
        "pest_disease",
        "weed",
        "livestock",
        "equipment",
        "infrastructure",
        "water",
        "landscape",
        "other",
      ],
    }).notNull(),
    // JSON string[] of short tags for search/grouping.
    tags: text("tags").notNull().default("[]"),
    // JSON object of structured agronomy/soil observations + recommendations.
    observations: text("observations").notNull().default("{}"),
    // Full raw model response, for debugging and future re-processing.
    raw: text("raw"),
    // Model's self-reported confidence, 0–1.
    confidence: real("confidence"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [index("photo_insights_org_id_idx").on(table.orgId)],
);

// ─── NFC / QR tags ──────────────────────────────────────────────────────────
// A physical tag zip-tied to a tree tube. The one rule: THE TAG IS A POINTER,
// NEVER THE RECORD. Plot mints `tagCode` and owns the history; a tag can be
// replaced, aliased, duplicated by a printed QR, or fail outright without
// touching a single logged visit. The chip's factory UID is kept only as a
// tamper check — it is never the lookup key, because UID cloning is trivial and
// some readers won't expose it at all.
export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // The opaque 8-char code in the tag's URL (https://<host>/t/<tagCode>).
    // Carries no farm data, so a tag found on the ground leaks nothing.
    tagCode: text("tag_code").notNull().unique(),
    chipUid: text("chip_uid"),
    kind: text("kind", { enum: ["nfc", "qr", "both"] })
      .notNull()
      .default("nfc"),
    // What one tap means: a single tube, a whole row, or a whole block. The
    // crew picks per tag; the farm sets the default.
    scope: text("scope", { enum: ["tube", "row", "block"] })
      .notNull()
      .default("tube"),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    plantingId: text("planting_id").references(() => plantings.id, {
      onDelete: "set null",
    }),
    status: text("status", {
      enum: ["active", "lost", "retired", "unbound"],
    })
      .notNull()
      .default("active"),
    // Replacement chain. A fresh tag written for a lost one points back here, so
    // if the old tag ever reads again it still resolves to the same record.
    aliasOfTagId: text("alias_of_tag_id").references(
      (): AnySQLiteColumn => tags.id,
      { onDelete: "set null" },
    ),
    // The GPS fix at the moment of writing — identity and position are the same
    // event when a tag is encoded in the field.
    writtenLat: real("written_lat"),
    writtenLng: real("written_lng"),
    writtenBy: text("written_by").references(() => users.id, {
      onDelete: "set null",
    }),
    writtenAt: integer("written_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    // Silence is the alarm: a tube that stops being scanned is a failing tag,
    // and this is what the health report sorts on.
    lastReadAt: integer("last_read_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("tags_org_id_idx").on(table.orgId),
    index("tags_location_id_idx").on(table.locationId),
    index("tags_last_read_at_idx").on(table.lastReadAt),
  ],
);

// One row per scan. Append-only: it is both the audit trail and the evidence
// that a tube was actually walked, which is what makes the silent-tag report
// trustworthy.
export const tagReads = sqliteTable(
  "tag_reads",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    // 'manual' is someone typing the printed code — paper survives radio.
    readVia: text("read_via", { enum: ["nfc", "qr", "manual"] })
      .notNull()
      .default("nfc"),
    lat: real("lat"),
    lng: real("lng"),
    // The visit this scan produced, when it produced one.
    eventId: text("event_id").references(() => events.id, {
      onDelete: "set null",
    }),
    readAt: integer("read_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("tag_reads_tag_id_idx").on(table.tagId),
    index("tag_reads_org_id_idx").on(table.orgId),
    index("tag_reads_read_at_idx").on(table.readAt),
  ],
);

export const tagsRelations = relations(tags, ({ one, many }) => ({
  org: one(organizations, {
    fields: [tags.orgId],
    references: [organizations.id],
  }),
  location: one(locations, {
    fields: [tags.locationId],
    references: [locations.id],
  }),
  planting: one(plantings, {
    fields: [tags.plantingId],
    references: [plantings.id],
  }),
  aliasOf: one(tags, {
    fields: [tags.aliasOfTagId],
    references: [tags.id],
    relationName: "tag_alias",
  }),
  aliases: many(tags, { relationName: "tag_alias" }),
  reads: many(tagReads),
}));

export const tagReadsRelations = relations(tagReads, ({ one }) => ({
  tag: one(tags, {
    fields: [tagReads.tagId],
    references: [tags.id],
  }),
  user: one(users, {
    fields: [tagReads.userId],
    references: [users.id],
  }),
  event: one(events, {
    fields: [tagReads.eventId],
    references: [events.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  memberships: many(memberships),
  locations: many(locations),
  plantings: many(plantings),
  events: many(events),
  herds: many(herds),
  paddocks: many(paddocks),
  grazingEvents: many(grazingEvents),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(memberships),
  invites: many(orgInvites),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  org: one(organizations, {
    fields: [memberships.orgId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [memberships.userId],
    references: [users.id],
  }),
}));

export const orgInvitesRelations = relations(orgInvites, ({ one }) => ({
  org: one(organizations, {
    fields: [orgInvites.orgId],
    references: [organizations.id],
  }),
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
  attachments: many(attachments),
  tags: many(tags),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  user: one(users, {
    fields: [attachments.userId],
    references: [users.id],
  }),
  location: one(locations, {
    fields: [attachments.locationId],
    references: [locations.id],
  }),
  insight: one(photoInsights, {
    fields: [attachments.id],
    references: [photoInsights.attachmentId],
  }),
}));

export const photoInsightsRelations = relations(photoInsights, ({ one }) => ({
  attachment: one(attachments, {
    fields: [photoInsights.attachmentId],
    references: [attachments.id],
  }),
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
  // Succession/breeding lineage: a planting can descend from a parent planting.
  parent: one(plantings, {
    fields: [plantings.parentPlantingId],
    references: [plantings.id],
    relationName: "planting_parent",
  }),
  children: many(plantings, { relationName: "planting_parent" }),
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

// ─── Expert chat ────────────────────────────────────────────────────────────
// A persisted chat thread between a user and the expert panel. `expertIds` is a
// JSON string[] of the experts last active on this thread (the picker default
// when it reopens). Title is generated from the first exchange.
export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title"),
    // JSON string[] of ExpertId, e.g. ["plot_assistant"].
    expertIds: text("expert_ids").notNull().default("[]"),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("conversations_org_id_idx").on(table.orgId),
    index("conversations_updated_at_idx").on(table.updatedAt),
  ],
);

// One message in a thread. A multi-expert assistant turn is stored as one row
// per expert (each with its own `expertId`), so they render as separate cards
// and can be replayed in order. User rows have a null expertId.
export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    // Which expert authored an assistant message (null for user messages).
    expertId: text("expert_id"),
    content: text("content").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [index("chat_messages_conversation_id_idx").on(table.conversationId)],
);

// A file the user attached to a chat message. Kept separate from `attachments`
// (which is pinned to a map location): chat uploads are transient context, not
// map pins. Bytes live in the same S3 store (see lib/attachments/storage.ts).
// `messageId` is filled in when the user message is sent; before that the row is
// an orphan owned by the conversation. Images get a `visionSummary`; text docs
// get `extractedText`.
export const chatAttachments = sqliteTable(
  "chat_attachments",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    messageId: text("message_id").references(() => chatMessages.id, {
      onDelete: "cascade",
    }),
    fileName: text("file_name").notNull(),
    storedName: text("stored_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    kind: text("kind", { enum: ["image", "document"] }).notNull(),
    // Extracted text for documents (PDF/CSV/TXT), capped; null for images.
    extractedText: text("extracted_text"),
    // Short vision read for images; null for documents.
    visionSummary: text("vision_summary"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("chat_attachments_conversation_id_idx").on(table.conversationId),
    index("chat_attachments_message_id_idx").on(table.messageId),
  ],
);

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  org: one(organizations, {
    fields: [conversations.orgId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [conversations.userId],
    references: [users.id],
  }),
  messages: many(chatMessages),
  attachments: many(chatAttachments),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [chatMessages.conversationId],
    references: [conversations.id],
  }),
  attachments: many(chatAttachments),
}));

export const chatAttachmentsRelations = relations(chatAttachments, ({ one }) => ({
  conversation: one(conversations, {
    fields: [chatAttachments.conversationId],
    references: [conversations.id],
  }),
  message: one(chatMessages, {
    fields: [chatAttachments.messageId],
    references: [chatMessages.id],
  }),
}));
