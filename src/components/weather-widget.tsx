"use client";

import { useState, useEffect } from "react";

import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";

import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/dates";
import {
  symbolToEmoji,
  windChill,
  fetchWeather,
  parseForecastDays,
  type ForecastDay,
} from "@/lib/weather";

import type { AppSettings } from "@/types";

interface WeatherWidgetProps {
  settings: AppSettings;
}

export function WeatherWidget({ settings }: WeatherWidgetProps) {
  const lat = settings.weatherLat;
  const lon = settings.weatherLon;
  const city = settings.weatherCity || "Your City";

  const [slide, setSlide] = useState(0);
  const [currentData, setCurrentData] = useState<{
    temp: number;
    feelsLike: number;
    precip: number;
    wind: number;
    emoji: string;
  } | null>(null);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string>("Updating…");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!lat || !lon) return;

    fetchWeather(lat, lon)
      .then((data) => {
        const ts = data.properties.timeseries;
        if (!ts || ts.length === 0) return;

        const current = ts[0];
        const det = current.data.instant.details;
        const temp = Math.round(det.air_temperature);
        const wind = det.wind_speed;
        const symbol =
          current.data.next_1_hours?.summary?.symbol_code ||
          current.data.next_6_hours?.summary?.symbol_code ||
          "";

        setCurrentData({
          temp,
          feelsLike: windChill(det.air_temperature, wind),
          precip:
            current.data.next_1_hours?.details?.precipitation_amount ?? 0,
          wind,
          emoji: symbolToEmoji(symbol),
        });

        setForecast(parseForecastDays(ts));
        setUpdatedAt(`Updated at ${formatTime(new Date())}`);
      })
      .catch(() => setError(true));
  }, [lat, lon]);

  if (!lat || !lon) {
    return (
      <Card className="min-h-60 min-w-60 flex-1 bg-gradient-to-b from-white/[0.02] to-transparent shadow-[var(--shadow-soft)]">
        <CardContent className="p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Weather
            </span>
            <span className="text-lg tracking-wider text-faint">···</span>
          </div>
          <p className="py-4 text-muted-foreground">
            Set your location in{" "}
            <Link href="/settings" className="text-primary">
              Settings
            </Link>{" "}
            to see weather.
          </p>
        </CardContent>
      </Card>
    );
  }

  const dateStr = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <Card className="min-h-60 min-w-60 flex-1 bg-gradient-to-b from-white/[0.02] to-transparent shadow-[var(--shadow-soft)]">
      <CardContent className="grid h-full grid-rows-[auto_1fr_auto] p-4">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            Weather
          </span>
          <span className="text-lg tracking-wider text-faint">···</span>
        </div>

        <div className="min-h-[5.5rem]">
          {error ? (
            <p className="text-muted-foreground">Unable to load weather.</p>
          ) : slide === 0 ? (
            currentData ? (
              <div className="flex justify-between gap-2.5">
                <div>
                  <p className="font-serif text-lg font-medium">{city}</p>
                  <p className="text-xs text-muted-foreground">{dateStr}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-4xl leading-none">
                      {currentData.emoji}
                    </span>
                    <span className="text-3xl font-medium">
                      {currentData.temp}°
                    </span>
                  </div>
                </div>
                <div className="grid content-start gap-0.5 text-right text-xs">
                  <p>
                    <span className="text-muted-foreground mr-1">
                      Feels like
                    </span>
                    {currentData.feelsLike}°
                  </p>
                  <p>
                    <span className="text-muted-foreground mr-1">Rain</span>
                    {currentData.precip} mm
                  </p>
                  <p>
                    <span className="text-muted-foreground mr-1">Wind</span>
                    {currentData.wind} m/s
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">Loading weather…</p>
            )
          ) : forecast.length > 0 ? (
            <div className="grid gap-1.5">
              {forecast.map((d) => (
                <div
                  key={d.dayName}
                  className="grid items-center gap-2.5 text-sm text-muted-foreground"
                  style={{
                    gridTemplateColumns: "1fr auto auto auto auto",
                  }}
                >
                  <span>{d.dayName}</span>
                  <span className="text-base">{d.emoji}</span>
                  <span>
                    <span className="text-muted-foreground">{d.low}°</span>
                    {" / "}
                    <strong className="text-foreground">{d.high}°</strong>
                  </span>
                  <span className="text-muted-foreground">{d.rain} mm</span>
                  <span className="text-muted-foreground">
                    {d.wind} m/s
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No forecast data.</p>
          )}
        </div>

        <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2 text-[0.7rem] text-faint">
          <span>Forecast from MET.no</span>
          <span className="flex gap-[5px]">
            {[0, 1].map((i) => (
              <button
                key={i}
                type="button"
                className={cn(
                  "h-1.5 w-1.5 rounded-full border-none p-0",
                  slide === i ? "bg-primary" : "bg-faint"
                )}
                onClick={() => setSlide(i)}
                aria-label={
                  i === 0 ? "Current conditions" : "4-day forecast"
                }
              />
            ))}
          </span>
          <span className="text-right">{updatedAt}</span>
        </div>
      </CardContent>
    </Card>
  );
}
