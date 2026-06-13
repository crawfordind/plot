// The catalog of things that can live on a farm. Single source of truth for the
// location `type` values: the DB column enum, the Zod validator, the TS union,
// and the searchable Pin picker all derive from here.
//
// `type` is stored as plain text (the enum is a TS-only hint, no DB CHECK), so
// adding entries here needs no migration. The first nine values are the original
// behavioural types that other code keys off (farm/field/paddock/etc.); the rest
// are point markers users place via Pin.

export const LOCATION_TYPE_VALUES = [
  // Behavioural / drawable areas (keep these first — other code references them)
  "farm",
  "field",
  "zone",
  "hoophouse",
  "bed",
  "row",
  "alley",
  "fence",
  "paddock",
  // Land & growing
  "pasture",
  "greenhouse",
  "garden",
  "orchard",
  "vineyard",
  "hayfield",
  "nursery",
  "compostarea",
  // Buildings
  "barn",
  "shed",
  "coop",
  "stable",
  "shop",
  "house",
  "garage",
  "silo",
  "bin",
  "storage",
  // Water
  "pond",
  "well",
  "trough",
  "spring",
  "stream",
  "tank",
  "hydrant",
  "ditch",
  // Livestock
  "corral",
  "pen",
  "feeder",
  "mineral",
  "chute",
  "beehive",
  // Infrastructure
  "gate",
  "driveway",
  "path",
  "culvert",
  "bridge",
  // Utilities
  "solar",
  "septic",
  "fuel",
  "manure",
  "meter",
  "generator",
  // Markers
  "tree",
  "marker",
  "soil",
  "sensor",
  "sign",
] as const;

export type LocationType = (typeof LOCATION_TYPE_VALUES)[number];

export const LOCATION_CATEGORIES = [
  "Land & growing",
  "Buildings",
  "Water",
  "Livestock",
  "Infrastructure",
  "Utilities",
  "Markers",
] as const;

export type LocationCategory = (typeof LOCATION_CATEGORIES)[number];

type CatalogMeta = {
  label: string;
  emoji: string;
  category: LocationCategory;
};

// Every type has display metadata. Keyed as a Record so TypeScript enforces that
// no type is left without an entry (and none is invented).
export const LOCATION_CATALOG: Record<LocationType, CatalogMeta> = {
  // Land & growing
  farm: { label: "Farm", emoji: "🚜", category: "Land & growing" },
  field: { label: "Field", emoji: "🌾", category: "Land & growing" },
  paddock: { label: "Paddock", emoji: "🐄", category: "Land & growing" },
  pasture: { label: "Pasture", emoji: "🌿", category: "Land & growing" },
  bed: { label: "Bed", emoji: "🌱", category: "Land & growing" },
  row: { label: "Row", emoji: "🪴", category: "Land & growing" },
  garden: { label: "Garden", emoji: "🥕", category: "Land & growing" },
  orchard: { label: "Orchard", emoji: "🍎", category: "Land & growing" },
  vineyard: { label: "Vineyard", emoji: "🍇", category: "Land & growing" },
  hayfield: { label: "Hayfield", emoji: "🌾", category: "Land & growing" },
  hoophouse: { label: "Hoop house", emoji: "⛺", category: "Land & growing" },
  greenhouse: { label: "Greenhouse", emoji: "🏡", category: "Land & growing" },
  nursery: { label: "Nursery", emoji: "🌳", category: "Land & growing" },
  zone: { label: "Zone", emoji: "🗺️", category: "Land & growing" },
  compostarea: { label: "Compost area", emoji: "♻️", category: "Land & growing" },
  // Buildings
  barn: { label: "Barn", emoji: "🛖", category: "Buildings" },
  shed: { label: "Shed", emoji: "🏚️", category: "Buildings" },
  coop: { label: "Chicken coop", emoji: "🐔", category: "Buildings" },
  stable: { label: "Stable", emoji: "🐎", category: "Buildings" },
  shop: { label: "Workshop", emoji: "🔧", category: "Buildings" },
  house: { label: "House", emoji: "🏠", category: "Buildings" },
  garage: { label: "Garage", emoji: "🚙", category: "Buildings" },
  silo: { label: "Silo", emoji: "🌽", category: "Buildings" },
  bin: { label: "Grain bin", emoji: "🛢️", category: "Buildings" },
  storage: { label: "Storage", emoji: "📦", category: "Buildings" },
  // Water
  pond: { label: "Pond", emoji: "🦆", category: "Water" },
  well: { label: "Well", emoji: "🚰", category: "Water" },
  trough: { label: "Water trough", emoji: "💧", category: "Water" },
  spring: { label: "Spring", emoji: "💦", category: "Water" },
  stream: { label: "Stream / creek", emoji: "🏞️", category: "Water" },
  tank: { label: "Water tank", emoji: "🛢️", category: "Water" },
  hydrant: { label: "Hydrant", emoji: "🧯", category: "Water" },
  ditch: { label: "Ditch", emoji: "〰️", category: "Water" },
  // Livestock
  corral: { label: "Corral", emoji: "🤠", category: "Livestock" },
  pen: { label: "Pen", emoji: "🐖", category: "Livestock" },
  feeder: { label: "Feeder", emoji: "🌾", category: "Livestock" },
  mineral: { label: "Mineral feeder", emoji: "🧂", category: "Livestock" },
  chute: { label: "Working chute", emoji: "🐂", category: "Livestock" },
  beehive: { label: "Beehive", emoji: "🐝", category: "Livestock" },
  // Infrastructure
  fence: { label: "Fence", emoji: "🚧", category: "Infrastructure" },
  gate: { label: "Gate", emoji: "🚪", category: "Infrastructure" },
  alley: { label: "Alley / lane", emoji: "↔️", category: "Infrastructure" },
  driveway: { label: "Driveway", emoji: "🛣️", category: "Infrastructure" },
  path: { label: "Path / trail", emoji: "🥾", category: "Infrastructure" },
  culvert: { label: "Culvert", emoji: "🕳️", category: "Infrastructure" },
  bridge: { label: "Bridge", emoji: "🌉", category: "Infrastructure" },
  // Utilities
  solar: { label: "Solar array", emoji: "☀️", category: "Utilities" },
  septic: { label: "Septic", emoji: "🚽", category: "Utilities" },
  fuel: { label: "Fuel tank", emoji: "⛽", category: "Utilities" },
  manure: { label: "Manure pile", emoji: "💩", category: "Utilities" },
  meter: { label: "Electric meter", emoji: "⚡", category: "Utilities" },
  generator: { label: "Generator", emoji: "🔌", category: "Utilities" },
  // Markers
  tree: { label: "Tree", emoji: "🌳", category: "Markers" },
  marker: { label: "Marker", emoji: "📍", category: "Markers" },
  soil: { label: "Soil test", emoji: "🧪", category: "Markers" },
  sensor: { label: "Sensor", emoji: "📡", category: "Markers" },
  sign: { label: "Sign", emoji: "🪧", category: "Markers" },
};

// Human-readable label for a stored type (falls back to the raw value).
export function locationTypeLabel(type: string): string {
  return LOCATION_CATALOG[type as LocationType]?.label ?? type;
}

export function locationTypeEmoji(type: string): string {
  return LOCATION_CATALOG[type as LocationType]?.emoji ?? "📍";
}

export type CatalogItem = {
  type: LocationType;
  label: string;
  emoji: string;
  category: LocationCategory;
};

// Flat, display-ordered list for the picker.
export const LOCATION_CATALOG_ITEMS: CatalogItem[] = (
  Object.keys(LOCATION_CATALOG) as LocationType[]
).map((type) => ({ type, ...LOCATION_CATALOG[type] }));
