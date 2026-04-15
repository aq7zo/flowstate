import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city")?.trim();
  if (!city) {
    return NextResponse.json({ error: "Missing city query param" }, { status: 400 });
  }

  const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&format=json&limit=1`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Flowstate/1.0 (local dev app)",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: `Geocoding request failed (${res.status})` },
      { status: 502 }
    );
  }

  const payload = (await res.json()) as Array<{
    lat: string;
    lon: string;
    name: string;
    display_name?: string;
  }>;
  const first = payload[0];
  if (!first) {
    return NextResponse.json({ error: "No geocoding result found" }, { status: 404 });
  }

  return NextResponse.json({
    lat: Number(first.lat),
    lon: Number(first.lon),
    name: first.name ?? city,
    country: first.display_name ?? "",
  });
}
