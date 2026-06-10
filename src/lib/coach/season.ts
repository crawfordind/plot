export type SeasonName = "Winter" | "Spring" | "Summer" | "Fall";

export function getCurrentSeason(date = new Date()): SeasonName {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return "Spring";
  if (month >= 5 && month <= 7) return "Summer";
  if (month >= 8 && month <= 10) return "Fall";
  return "Winter";
}

export function getSeasonLabel(date = new Date()) {
  return `${getCurrentSeason(date)} ${date.getFullYear()}`;
}
