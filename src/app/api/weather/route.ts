import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { error: "Missing or invalid lat/lon query params" },
      { status: 400 }
    );
  }

  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Flowstate/1.0 flowstate-app@github.com" },
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: `Weather request failed (${res.status})` },
      { status: 502 }
    );
  }

  const payload = await res.json();
  return NextResponse.json(payload);
}
