// Forward geocoding (address text -> coordinates) for the "New farm" address
// search. Backed by OpenStreetMap's Nominatim, which needs no API key — a good
// fit for a self-hosted farm app. If you outgrow Nominatim's usage policy
// (1 req/sec, no heavy autocomplete traffic), swap `provider` below for a keyed
// service (MapTiler / Mapbox / Google) without touching the route or UI.

export type GeocodeResult = {
  id: string;
  // Human-readable address, e.g. "1600 Pennsylvania Ave NW, Washington, DC".
  label: string;
  lng: number;
  lat: number;
  // [west, south, east, north] — lets the map frame the whole place (a town,
  // a parcel) instead of dropping a pin at a single point. Absent for results
  // Nominatim returns without a bounding box.
  bbox?: [number, number, number, number];
};

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

// Nominatim's policy requires an identifying User-Agent. NEXT_PUBLIC_APP_URL is
// already set for OpenRouter; reuse it so the contact reflects this deployment.
const USER_AGENT = `Plot farm mapper (${
  process.env.NEXT_PUBLIC_APP_URL ?? "https://github.com/CannaEngineer/plot"
})`;

type NominatimHit = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  // [south, north, west, east] as strings.
  boundingbox?: [string, string, string, string];
};

export async function geocodeAddress(query: string): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "0");
  url.searchParams.set("limit", "6");

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
  });
  if (!response.ok) {
    throw new Error(`Nominatim ${response.status}`);
  }

  const hits = (await response.json()) as NominatimHit[];
  return hits.map((hit) => {
    const result: GeocodeResult = {
      id: String(hit.place_id),
      label: hit.display_name,
      lng: Number(hit.lon),
      lat: Number(hit.lat),
    };
    if (hit.boundingbox) {
      const [south, north, west, east] = hit.boundingbox.map(Number);
      result.bbox = [west, south, east, north];
    }
    return result;
  });
}

const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";

// Coordinates -> human-readable place label (best-effort). Used to give the vision
// model a sense of *where* a photo was taken. Returns null on any failure rather
// than throwing — a missing label must never block an upload or analysis.
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | null> {
  try {
    const url = new URL(NOMINATIM_REVERSE_URL);
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("zoom", "14");

    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
    });
    if (!response.ok) return null;
    const hit = (await response.json()) as { display_name?: string };
    return hit.display_name ?? null;
  } catch {
    return null;
  }
}
