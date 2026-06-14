import { reverseGeocode } from "@/lib/geocode";
import { geometryCenter } from "@/lib/map/geometry";
import type { GeoJSONGeometry } from "@/lib/types";

// "Where and when" context for the expert panel. The chat already knows the
// farm's map, crops, and activity — but the LLM has no idea what day it is, where
// on earth the farm sits, or what the weather is doing, and all three are
// decisive for seasonal advice (planting windows, frost protection, irrigation,
// grazing trafficability). We derive the farm's coordinates from its own mapped
// geometry, then enrich with Open-Meteo — free and key-less, the same no-key
// spirit as the Nominatim geocoding already in the app.

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const FETCH_TIMEOUT_MS = 6_000;
const ARCHIVE_TIMEOUT_MS = 10_000;

export type FarmEnvironment = { text: string; chips: string[] };

// Conditions change slowly; a ~30-min cache keeps the panel snappy and stays well
// within Open-Meteo's free limits even when a thread fires many turns. Keyed by
// coordinates rounded to ~1 km so nearby farms share a hit.
const weatherCache = new Map<string, { expires: number; env: FarmEnvironment }>();
const WEATHER_TTL_MS = 30 * 60_000;

// Place labels are effectively static; cache for the process lifetime and be
// gentle on Nominatim (its policy is ~1 req/sec).
const placeCache = new Map<string, string | null>();

// USDA hardiness zone is a 30-year climate normal — it doesn't change between
// chats. Cache successful lookups for the process lifetime; failures fall through
// so a transient archive hiccup retries on the next weather refresh.
type HardinessZone = { zone: string; avgLowF: number };
const zoneCache = new Map<string, HardinessZone>();

// --- geometry → a single representative point -------------------------------

// The farm's center: the median of every mapped area's centroid. We use the
// median, not a bounding-box midpoint or a mean, because it ignores outliers — a
// single stray or mis-placed location (e.g. a pin dropped in another state) would
// otherwise drag a bbox/mean far from where the farm actually is and yield wildly
// wrong weather and hardiness data. Returns [lat, lng] (note the order) or null
// if nothing is mapped.
export function farmCenter(geometryJson: string[]): [number, number] | null {
  const lats: number[] = [];
  const lngs: number[] = [];
  for (const raw of geometryJson) {
    try {
      const g = JSON.parse(raw) as GeoJSONGeometry;
      if (!g || typeof g.type !== "string") continue;
      const [lng, lat] = geometryCenter(g);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        lats.push(lat);
        lngs.push(lng);
      }
    } catch {
      // Skip unparseable rows rather than failing the whole lookup.
    }
  }
  if (lats.length === 0) return null;
  return [median(lats), median(lngs)];
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// --- WMO weather codes ------------------------------------------------------

function describeCode(code: number): string {
  const map: Record<number, string> = {
    0: "clear sky",
    1: "mainly clear",
    2: "partly cloudy",
    3: "overcast",
    45: "fog",
    48: "freezing fog",
    51: "light drizzle",
    53: "drizzle",
    55: "heavy drizzle",
    56: "freezing drizzle",
    57: "freezing drizzle",
    61: "light rain",
    63: "rain",
    65: "heavy rain",
    66: "freezing rain",
    67: "freezing rain",
    71: "light snow",
    73: "snow",
    75: "heavy snow",
    77: "snow grains",
    80: "rain showers",
    81: "rain showers",
    82: "heavy rain showers",
    85: "snow showers",
    86: "heavy snow showers",
    95: "thunderstorms",
    96: "thunderstorms with hail",
    99: "severe thunderstorms with hail",
  };
  return map[code] ?? "mixed conditions";
}

// --- formatting helpers -----------------------------------------------------

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const SHORT_DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Open-Meteo returns local-time ISO strings like "2026-06-14T13:00" when asked
// for timezone=auto — no Z, no offset. Parse the wall-clock fields directly so we
// report the farm's local date/time, not the server's.
function parseLocalISO(s: string): {
  date: Date; // a Date whose UTC fields equal the local wall-clock (for math only)
  hhmm: string;
} {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);
  if (!m) return { date: new Date(NaN), hhmm: "" };
  const [, y, mo, d, h, mi] = m;
  const date = new Date(
    Date.UTC(+y, +mo - 1, +d, +h, +mi),
  );
  let hour = +h;
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return { date, hhmm: `${hour}:${mi} ${ampm}` };
}

function dateLabel(d: Date): string {
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

// Meteorological season, hemisphere-aware (lat<0 flips it).
function seasonFor(month0: number, lat: number): string {
  const north = [
    "winter", // Jan
    "winter",
    "spring", // Mar
    "spring",
    "spring",
    "summer", // Jun
    "summer",
    "summer",
    "fall", // Sep
    "fall",
    "fall",
    "winter", // Dec
  ];
  const s = north[month0] ?? "—";
  if (lat >= 0) return s;
  const flip: Record<string, string> = {
    winter: "summer",
    summer: "winter",
    spring: "fall",
    fall: "spring",
  };
  return flip[s] ?? s;
}

function round(n: number, places = 0): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

function daylight(sunrise: string, sunset: string): string {
  const a = parseLocalISO(sunrise).date.getTime();
  const b = parseLocalISO(sunset).date.getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return "";
  const mins = Math.round((b - a) / 60_000);
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function moistureLabel(vwc: number): string {
  // Volumetric water content (m³/m³) for a mineral soil, rough field guide.
  if (vwc < 0.1) return "dry";
  if (vwc < 0.2) return "moderate";
  if (vwc < 0.32) return "moist";
  return "saturated";
}

// --- shapes we read off the Open-Meteo response -----------------------------

type OpenMeteo = {
  current?: {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    apparent_temperature?: number;
    precipitation?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    wind_gusts_10m?: number;
  };
  hourly?: {
    time?: string[];
    soil_temperature_6cm?: (number | null)[];
    soil_moisture_3_to_9cm?: (number | null)[];
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_sum?: number[];
    precipitation_probability_max?: (number | null)[];
    sunrise?: string[];
    sunset?: string[];
    et0_fao_evapotranspiration?: (number | null)[];
  };
};

async function fetchOpenMeteo(lat: number, lng: number): Promise<OpenMeteo> {
  const url = new URL(FORECAST_URL);
  url.searchParams.set("latitude", lat.toFixed(4));
  url.searchParams.set("longitude", lng.toFixed(4));
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m",
  );
  url.searchParams.set("hourly", "soil_temperature_6cm,soil_moisture_3_to_9cm");
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunrise,sunset,et0_fao_evapotranspiration",
  );
  url.searchParams.set("past_days", "3");
  url.searchParams.set("forecast_days", "7");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("precipitation_unit", "inch");
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  return (await res.json()) as OpenMeteo;
}

// Find the hourly index nearest to "now" (current.time), for soil readings.
function nowIndex(hourly: NonNullable<OpenMeteo["hourly"]>, nowISO?: string): number {
  const times = hourly.time ?? [];
  if (!nowISO || times.length === 0) return -1;
  const target = nowISO.slice(0, 13); // YYYY-MM-DDTHH
  const exact = times.findIndex((t) => t.startsWith(target));
  if (exact >= 0) return exact;
  // Fall back to the latest hour at or before now (times are sorted ascending).
  let best = -1;
  for (let i = 0; i < times.length; i++) {
    if (times[i].slice(0, 13) <= target) best = i;
    else break;
  }
  return best >= 0 ? best : times.length - 1;
}

// --- USDA hardiness zone ----------------------------------------------------

// USDA zones are 10°F bands of the average annual extreme minimum temperature,
// each split into 'a' (lower 5°F) and 'b' (upper 5°F) half-zones. Zone 1a starts
// at -60°F; zone 13b tops out near +70°F. We clamp into that range.
function classifyZone(avgLowF: number): string {
  const clamped = Math.max(-60, Math.min(69.99, avgLowF));
  const zoneNumber = Math.floor((clamped + 60) / 10) + 1; // 1..13
  const bandStart = -60 + (zoneNumber - 1) * 10;
  const half = clamped - bandStart < 5 ? "a" : "b";
  return `${zoneNumber}${half}`;
}

// Derive the zone from ~10 years of daily minimum temperatures (Open-Meteo's free
// historical archive — same key-less provider). We take each year's coldest day,
// average those annual extremes, and classify — the same definition the USDA map
// uses. Best-effort and self-caching; returns null on any failure.
async function getHardinessZone(
  lat: number,
  lng: number,
  key: string,
): Promise<HardinessZone | null> {
  const cached = zoneCache.get(key);
  if (cached) return cached;
  try {
    const endYear = new Date().getUTCFullYear() - 1;
    const startYear = endYear - 9;
    const url = new URL(ARCHIVE_URL);
    url.searchParams.set("latitude", lat.toFixed(4));
    url.searchParams.set("longitude", lng.toFixed(4));
    url.searchParams.set("start_date", `${startYear}-01-01`);
    url.searchParams.set("end_date", `${endYear}-12-31`);
    url.searchParams.set("daily", "temperature_2m_min");
    url.searchParams.set("temperature_unit", "fahrenheit");
    url.searchParams.set("timezone", "auto");

    const res = await fetch(url, { signal: AbortSignal.timeout(ARCHIVE_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Open-Meteo archive ${res.status}`);
    const data = (await res.json()) as {
      daily?: { time?: string[]; temperature_2m_min?: (number | null)[] };
    };
    const times = data.daily?.time ?? [];
    const mins = data.daily?.temperature_2m_min ?? [];
    const annualLow = new Map<string, number>();
    for (let i = 0; i < times.length; i++) {
      const x = mins[i];
      if (x == null) continue;
      const year = times[i].slice(0, 4);
      const prev = annualLow.get(year);
      if (prev == null || x < prev) annualLow.set(year, x);
    }
    const lows = [...annualLow.values()];
    if (lows.length < 3) return null; // too little data to be meaningful
    const avg = lows.reduce((a, b) => a + b, 0) / lows.length;
    const result: HardinessZone = { zone: classifyZone(avg), avgLowF: Math.round(avg) };
    zoneCache.set(key, result);
    return result;
  } catch (err) {
    console.error("[weather] hardiness-zone lookup failed:", err);
    return null;
  }
}

// --- the public builder -----------------------------------------------------

// Always returns at least a date/place header; weather is best-effort on top.
export async function getFarmEnvironment(
  center: [number, number] | null,
): Promise<FarmEnvironment> {
  if (!center) {
    const now = new Date();
    return {
      text: [
        `Today is ${WEEKDAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}.`,
        "The farm hasn't been placed on the map yet, so location-specific weather and forecast aren't available.",
      ].join("\n"),
      chips: [],
    };
  }

  const [lat, lng] = center;
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = weatherCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.env;

  // Place label (cached ~forever, best-effort).
  let place: string | null;
  if (placeCache.has(key)) {
    place = placeCache.get(key) ?? null;
  } else {
    place = await reverseGeocode(lat, lng).catch(() => null);
    placeCache.set(key, place);
  }

  let env: FarmEnvironment;
  try {
    // Forecast and the hardiness-zone climate lookup are independent — run both
    // at once. getHardinessZone never throws, so a weather failure alone lands in
    // catch below (where we still surface the zone from its own cache).
    const [data, zone] = await Promise.all([
      fetchOpenMeteo(lat, lng),
      getHardinessZone(lat, lng, key),
    ]);
    env = render(data, lat, lng, place, zone);
  } catch (err) {
    console.error("[weather] Open-Meteo lookup failed:", err);
    const zone = await getHardinessZone(lat, lng, key);
    const now = new Date();
    env = {
      text: [
        `Today is ${WEEKDAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}.`,
        place ? `Location: ${place} (≈${lat.toFixed(3)}, ${lng.toFixed(3)}).` : "",
        zone
          ? `USDA hardiness zone: ${zone.zone} (avg. annual extreme low ≈ ${zone.avgLowF}°F).`
          : "",
        "Live weather is temporarily unavailable.",
      ]
        .filter(Boolean)
        .join("\n"),
      chips: zone ? [`USDA zone ${zone.zone}`] : [],
    };
  }

  weatherCache.set(key, { expires: Date.now() + WEATHER_TTL_MS, env });
  return env;
}

function render(
  data: OpenMeteo,
  lat: number,
  lng: number,
  place: string | null,
  zone: HardinessZone | null,
): FarmEnvironment {
  const lines: string[] = [];
  const chips: string[] = [];

  const cur = data.current ?? {};
  const daily = data.daily ?? {};
  const nowParsed = cur.time ? parseLocalISO(cur.time) : null;
  const now = nowParsed?.date ?? new Date();

  // Header: date, season, place.
  const season = seasonFor(now.getUTCMonth(), lat);
  lines.push(
    `Today is ${dateLabel(now)} — ${season}${nowParsed?.hhmm ? `, ${nowParsed.hhmm} local` : ""}.`,
  );
  lines.push(
    place
      ? `Location: ${place} (≈${lat.toFixed(3)}, ${lng.toFixed(3)}).`
      : `Location: ≈${lat.toFixed(3)}, ${lng.toFixed(3)}.`,
  );
  if (zone) {
    lines.push(
      `USDA hardiness zone: ${zone.zone} (avg. annual extreme low ≈ ${zone.avgLowF}°F).`,
    );
    chips.push(`USDA zone ${zone.zone}`);
  }

  // Current conditions.
  if (cur.temperature_2m != null) {
    const desc = cur.weather_code != null ? describeCode(cur.weather_code) : "";
    const feels =
      cur.apparent_temperature != null &&
      Math.abs(cur.apparent_temperature - cur.temperature_2m) >= 3
        ? ` (feels ${round(cur.apparent_temperature)}°F)`
        : "";
    const wind =
      cur.wind_speed_10m != null
        ? `, wind ${round(cur.wind_speed_10m)} mph${
            cur.wind_gusts_10m != null ? ` (gusts ${round(cur.wind_gusts_10m)})` : ""
          }`
        : "";
    const rh =
      cur.relative_humidity_2m != null ? `, ${round(cur.relative_humidity_2m)}% RH` : "";
    lines.push(
      `Now: ${desc ? `${desc}, ` : ""}${round(cur.temperature_2m)}°F${feels}${rh}${wind}.`,
    );
    chips.push(`${round(cur.temperature_2m)}°F ${desc}`.trim());
  }

  // Today's outlook (index of the current day = 3, since past_days=3).
  const todayIdx = (daily.time ?? []).findIndex((d) =>
    cur.time ? d === cur.time.slice(0, 10) : false,
  );
  if (todayIdx >= 0) {
    const hi = daily.temperature_2m_max?.[todayIdx];
    const lo = daily.temperature_2m_min?.[todayIdx];
    const pop = daily.precipitation_probability_max?.[todayIdx];
    const psum = daily.precipitation_sum?.[todayIdx];
    const sr = daily.sunrise?.[todayIdx];
    const ss = daily.sunset?.[todayIdx];
    const et0 = daily.et0_fao_evapotranspiration?.[todayIdx];
    const parts: string[] = [];
    if (hi != null && lo != null) parts.push(`high ${round(hi)}° / low ${round(lo)}°F`);
    if (pop != null) parts.push(`${round(pop)}% precip${psum ? ` (${round(psum, 2)}")` : ""}`);
    if (sr && ss) {
      const dl = daylight(sr, ss);
      parts.push(
        `daylight ${parseLocalISO(sr).hhmm}–${parseLocalISO(ss).hhmm}${dl ? ` (${dl})` : ""}`,
      );
    }
    if (et0 != null) parts.push(`ET₀ ${round(et0, 2)}"/day`);
    if (parts.length) lines.push(`Today: ${parts.join(", ")}.`);
  }

  // Soil at root depth (germination & fieldwork signal).
  const hourly = data.hourly;
  if (hourly) {
    const i = nowIndex(hourly, cur.time);
    if (i >= 0) {
      const st = hourly.soil_temperature_6cm?.[i];
      const sm = hourly.soil_moisture_3_to_9cm?.[i];
      const bits: string[] = [];
      if (st != null) bits.push(`temp ${round(st)}°F at 6 cm`);
      if (sm != null) bits.push(`moisture ${round(sm, 2)} m³/m³ (${moistureLabel(sm)})`);
      if (bits.length) lines.push(`Soil: ${bits.join(", ")}.`);
    }
  }

  // Recent rain (the 3 past days), useful for irrigation/grazing decisions.
  if (todayIdx > 0 && daily.precipitation_sum) {
    const past = daily.precipitation_sum.slice(0, todayIdx).filter((n) => n != null);
    if (past.length) {
      const total = past.reduce((a, b) => a + (b ?? 0), 0);
      lines.push(`Recent rain (past ${past.length} days): ${round(total, 2)}".`);
    }
  }

  // 6-day outlook + frost watch over the forecast horizon.
  const times = daily.time ?? [];
  const start = todayIdx >= 0 ? todayIdx + 1 : 0;
  const outlook: string[] = [];
  let frost: { day: string; lo: number } | null = null;
  for (let i = start; i < times.length; i++) {
    const d = parseLocalISO(`${times[i]}T12:00`).date;
    const dow = SHORT_DOW[d.getUTCDay()];
    const hi = daily.temperature_2m_max?.[i];
    const lo = daily.temperature_2m_min?.[i];
    const pop = daily.precipitation_probability_max?.[i];
    if (hi != null && lo != null) {
      outlook.push(`${dow} ${round(hi)}/${round(lo)}°${pop ? ` ${round(pop)}%` : ""}`);
      if (lo <= 36 && (!frost || lo < frost.lo)) frost = { day: dow, lo: round(lo) };
    }
  }
  if (outlook.length) lines.push(`Outlook: ${outlook.join(" · ")}.`);
  if (frost) {
    lines.push(`⚠️ Frost risk: low near ${frost.lo}°F on ${frost.day}.`);
    chips.push("frost risk ahead");
  }

  return { text: lines.join("\n"), chips };
}
