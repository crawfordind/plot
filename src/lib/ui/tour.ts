export const TOUR_STORAGE_KEY = "plot_tour_done";

export type TourStep = {
  // data-tour attribute value of the element to spotlight (omit for a centered card).
  target?: string;
  title: string;
  body: string;
};

export const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to Plot",
    body: "Your farm, mapped. Track plantings, daily logs, and rotational grazing — all from one map. Here's the 20-second tour.",
  },
  {
    target: "build",
    title: "Map your farm",
    body: "Tap Build and describe your farm in a sentence — “two beds and a fence” — and Plot lays it out on the map for you.",
  },
  {
    target: "pin",
    title: "Or drop a pin",
    body: "Prefer one spot at a time? Tap Pin, then tap the map to place a bed, field, or paddock.",
  },
  {
    target: "log",
    title: "Log in plain English",
    body: "Type what happened — “watered Bed 2, harvested 3 lb tomatoes” — and the bar turns it into clean records.",
  },
  {
    target: "more",
    title: "Everything else lives here",
    body: "Open More for Grazing (herds, paddocks, NRCS records), Draw paddock, and to replay this tour anytime.",
  },
];

export function isTourDone(): boolean {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

export function markTourDone() {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, "1");
  } catch {
    // ignore
  }
}
