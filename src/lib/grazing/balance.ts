import type { HerdSpecies } from "@/lib/types";

// NRCS Forage-Animal Balance math (Grazing Management 528 worksheet, pp. 14-21).
// All formulas were checked against the worksheet's worked scenarios so the
// headline outputs (supply, demand, balance, minimum paddocks) reproduce exactly.

// Dry-matter (DM) intake as a percent of body weight, per the worksheet's animal
// types. Overridable per herd. Poultry only count the forage portion of the diet.
export const SPECIES_DM_INTAKE_PCT: Record<HerdSpecies, number> = {
  sheep: 3.0,
  goat: 3.0,
  cattle: 2.6,
  horse: 2.0,
  poultry: 0.6,
  other: 2.6,
};

// One animal unit = 1,000 lb of live body weight.
const LB_PER_ANIMAL_UNIT = 1000;
// The worksheet sizes paddocks assuming roughly 4 grazing rotations per season.
const ROTATIONS_PER_SEASON = 4;
const LB_PER_TON = 2000;

// Sensible PA cool-season defaults used by the planner when the grower does not
// specify them.
export const DEFAULT_GRAZING_DAYS = 214; // ~ May 1 – Nov 30 grazing season
export const DEFAULT_FORAGE_LB_PER_ACRE = 5000; // managed cool-season pasture
export const DEFAULT_HARVEST_EFFICIENCY = 0.7; // rotational utilization
export const REST_PERIODS = [21, 30, 45, 60] as const;

export type BalanceAnimal = {
  species: HerdSpecies;
  head: number;
  weightLb: number;
  dmIntakePct?: number | null;
};

export type BalanceInput = {
  animals: BalanceAnimal[];
  acres: number;
  grazeDaysPerPaddock: number;
  grazingDays?: number;
  forageLbPerAcre?: number;
  harvestEfficiency?: number;
};

export type RestScenario = {
  restDays: number;
  minPaddocks: number;
  minAcres: number;
};

export type BalanceResult = {
  acres: number;
  animalUnits: number;
  dailyDemandLb: number;
  annualDemandLb: number;
  annualDemandTons: number;
  forageSupplyLb: number;
  forageSupplyTons: number;
  balanceLb: number;
  balanceTons: number;
  stockingRate: number; // animal units per grazable acre
  grazeDaysPerPaddock: number;
  forageNeededPerRotationLb: number;
  paddockSizeAcres: number;
  restScenarios: RestScenario[];
  // The recommended number of paddocks for the grower's chosen rest target,
  // if it matches one of the standard rest periods; else closest table value.
};

export function dmIntakePct(animal: BalanceAnimal): number {
  if (animal.dmIntakePct && animal.dmIntakePct > 0) return animal.dmIntakePct;
  return SPECIES_DM_INTAKE_PCT[animal.species];
}

export function animalUnits(animals: BalanceAnimal[]): number {
  const lb = animals.reduce((sum, a) => sum + a.head * a.weightLb, 0);
  return lb / LB_PER_ANIMAL_UNIT;
}

export function dailyDemandLb(animals: BalanceAnimal[]): number {
  return animals.reduce(
    (sum, a) => sum + (a.head * a.weightLb * dmIntakePct(a)) / 100,
    0,
  );
}

export function forageSupplyLb(
  acres: number,
  lbPerAcre: number,
  efficiency: number,
): number {
  return acres * lbPerAcre * efficiency;
}

// Minimum paddocks to give a paddock `restDays` of recovery while the herd
// spends `grazeDays` on each. Matches the worksheet: 2-day graze → 12/16/24/31
// paddocks for 21/30/45/60-day rest.
export function minPaddocks(restDays: number, grazeDays: number): number {
  const g = Math.max(grazeDays, 0.5);
  return Math.ceil(restDays / g) + 1;
}

export function computeBalance(input: BalanceInput): BalanceResult {
  const grazingDays = input.grazingDays ?? DEFAULT_GRAZING_DAYS;
  const forageLbPerAcre = input.forageLbPerAcre ?? DEFAULT_FORAGE_LB_PER_ACRE;
  const harvestEfficiency =
    input.harvestEfficiency ?? DEFAULT_HARVEST_EFFICIENCY;
  const graze = Math.max(input.grazeDaysPerPaddock, 0.5);

  const au = animalUnits(input.animals);
  const daily = dailyDemandLb(input.animals);
  const annualDemand = daily * grazingDays;
  const supply = forageSupplyLb(input.acres, forageLbPerAcre, harvestEfficiency);
  const balance = supply - annualDemand;

  const forageNeededPerRotationLb = daily * graze;
  // Forage available per grazable acre, per rotation (worksheet's 4-rotation basis).
  const availPerAcrePerRotation =
    input.acres > 0 ? supply / input.acres / ROTATIONS_PER_SEASON : 0;
  const paddockSizeAcres =
    availPerAcrePerRotation > 0
      ? forageNeededPerRotationLb / availPerAcrePerRotation
      : 0;

  const restScenarios: RestScenario[] = REST_PERIODS.map((restDays) => {
    const n = minPaddocks(restDays, graze);
    return { restDays, minPaddocks: n, minAcres: n * paddockSizeAcres };
  });

  return {
    acres: input.acres,
    animalUnits: au,
    dailyDemandLb: daily,
    annualDemandLb: annualDemand,
    annualDemandTons: annualDemand / LB_PER_TON,
    forageSupplyLb: supply,
    forageSupplyTons: supply / LB_PER_TON,
    balanceLb: balance,
    balanceTons: balance / LB_PER_TON,
    stockingRate: input.acres > 0 ? au / input.acres : 0,
    grazeDaysPerPaddock: graze,
    forageNeededPerRotationLb,
    paddockSizeAcres,
    restScenarios,
  };
}
