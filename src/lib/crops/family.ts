// Botanical crop families. Drives rotation/disease-break reasoning (don't follow
// a brassica with a brassica) and groups plantings agronomically. Kept as a
// closed list so it can back a typed column; `guessCropFamily` maps a common
// name to one of these (best-effort, null when unknown) so the family is filled
// automatically at log/parse time without the farmer entering it.
export const CROP_FAMILY_VALUES = [
  "brassica",
  "solanaceae",
  "cucurbit",
  "allium",
  "legume",
  "chenopod",
  "apiaceae",
  "asteraceae",
  "poaceae",
  "other",
] as const;

export type CropFamily = (typeof CROP_FAMILY_VALUES)[number];

// Common-name fragments → family. Matched as case-insensitive substrings, so
// "cherry tomato" and "San Marzano tomato" both resolve to solanaceae.
const FAMILY_BY_KEYWORD: { family: CropFamily; keywords: string[] }[] = [
  {
    family: "solanaceae",
    keywords: ["tomato", "tomatillo", "pepper", "eggplant", "potato", "ground cherry"],
  },
  {
    family: "brassica",
    keywords: [
      "broccoli", "cabbage", "kale", "cauliflower", "collard", "kohlrabi",
      "brussels", "turnip", "radish", "arugula", "mustard", "bok choy",
      "pak choi", "rutabaga", "mizuna", "tatsoi",
    ],
  },
  {
    family: "cucurbit",
    keywords: ["cucumber", "squash", "zucchini", "melon", "watermelon", "pumpkin", "gourd"],
  },
  {
    family: "allium",
    keywords: ["onion", "garlic", "leek", "shallot", "scallion", "chive"],
  },
  {
    family: "legume",
    keywords: ["bean", "pea", "lentil", "soybean", "fava", "cowpea", "chickpea", "peanut"],
  },
  {
    family: "chenopod",
    keywords: ["spinach", "chard", "beet", "quinoa", "amaranth"],
  },
  {
    family: "apiaceae",
    keywords: ["carrot", "celery", "parsley", "dill", "cilantro", "coriander", "fennel", "parsnip"],
  },
  {
    family: "asteraceae",
    keywords: ["lettuce", "sunflower", "endive", "radicchio", "artichoke", "chicory"],
  },
  {
    family: "poaceae",
    keywords: ["corn", "maize", "wheat", "oat", "rye", "barley", "sorghum"],
  },
];

export function guessCropFamily(commonName: string | null | undefined): CropFamily | null {
  if (!commonName) return null;
  const name = commonName.toLowerCase();
  for (const { family, keywords } of FAMILY_BY_KEYWORD) {
    if (keywords.some((kw) => name.includes(kw))) return family;
  }
  return null;
}
