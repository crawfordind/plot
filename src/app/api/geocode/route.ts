import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { geocodeAddress } from "@/lib/geocode";

// Address autocomplete for the "New farm" flow. Auth-gated so it can't be used
// as an open geocoding proxy. Results depend entirely on the query, so there's
// nothing org-scoped here — requireUser (not requireOrg) is the right gate.
export async function GET(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const query = new URL(request.url).searchParams.get("q") ?? "";
  if (query.trim().length < 3) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await geocodeAddress(query);
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "Address lookup failed" }, { status: 502 });
  }
}
