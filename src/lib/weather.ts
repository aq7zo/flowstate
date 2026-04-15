const SYMBOL_MAP: Record<string, string> = {
  clearsky_day: "☀️",
  clearsky_night: "🌙",
  fair_day: "🌤️",
  fair_night: "🌤️",
  partlycloudy_day: "⛅",
  partlycloudy_night: "⛅",
  cloudy: "☁️",
  rain: "🌧️",
  heavyrain: "⛈️",
  lightrain: "🌦️",
  lightrainshowers_day: "🌦️",
  lightrainshowers_night: "🌦️",
  rainshowers_day: "🌧️",
  rainshowers_night: "🌧️",
  heavyrainshowers_day: "⛈️",
  heavyrainshowers_night: "⛈️",
  snow: "❄️",
  lightsnow: "🌨️",
  heavysnow: "❄️",
  fog: "🌫️",
  sleet: "🌨️",
};

export function symbolToEmoji(code: string): string {
  if (!code) return "🌤️";
  for (const [key, emoji] of Object.entries(SYMBOL_MAP)) {
    if (code.startsWith(key)) return emoji;
  }
  return "🌤️";
}

export function windChill(temp: number, wind: number): number {
  if (temp > 10 || wind < 1.3) return Math.round(temp);
  return Math.round(
    13.12 +
      0.6215 * temp -
      11.37 * Math.pow(wind * 3.6, 0.16) +
      0.3965 * temp * Math.pow(wind * 3.6, 0.16)
  );
}

export interface ForecastDay {
  dayName: string;
  low: number;
  high: number;
  emoji: string;
  rain: number;
  wind: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function fetchWeather(
  lat: number,
  lon: number
): Promise<any> {
  const url = `/api/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather API ${res.status}`);
  return res.json();
}

export function parseForecastDays(timeseries: any[]): ForecastDay[] {
  const todayStr = new Date().toISOString().slice(0, 10);
  const dayMap = new Map<string, any[]>();

  for (const entry of timeseries) {
    const dateStr = entry.time.slice(0, 10);
    if (dateStr <= todayStr) continue;
    if (!dayMap.has(dateStr)) dayMap.set(dateStr, []);
    dayMap.get(dateStr)!.push(entry);
  }

  const days: ForecastDay[] = [];
  for (const [dateStr, entries] of dayMap) {
    if (days.length >= 4) break;

    const temps = entries.map(
      (e: any) => e.data.instant.details.air_temperature
    );
    const winds = entries.map((e: any) => e.data.instant.details.wind_speed);

    let noonEntry = entries[0];
    let minDiff = Infinity;
    for (const e of entries) {
      const diff = Math.abs(new Date(e.time).getHours() - 12);
      if (diff < minDiff) {
        minDiff = diff;
        noonEntry = e;
      }
    }

    const precipEntries = entries.filter(
      (e: any) =>
        e.data.next_1_hours?.details?.precipitation_amount != null
    );
    const totalPrecip = precipEntries.reduce(
      (sum: number, e: any) =>
        sum + (e.data.next_1_hours.details.precipitation_amount || 0),
      0
    );

    const symbolCode =
      noonEntry.data.next_1_hours?.summary?.symbol_code ||
      noonEntry.data.next_6_hours?.summary?.symbol_code ||
      "";

    const d = new Date(dateStr + "T12:00:00");
    days.push({
      dayName: d.toLocaleDateString(undefined, { weekday: "long" }),
      low: Math.round(Math.min(...temps)),
      high: Math.round(Math.max(...temps)),
      emoji: symbolToEmoji(symbolCode),
      rain: Math.round(totalPrecip * 10) / 10,
      wind: Math.round(
        (winds.reduce((a: number, b: number) => a + b, 0) / winds.length) * 10
      ) / 10,
    });
  }

  return days;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
