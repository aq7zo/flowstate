"use client";

import { useState, useEffect } from "react";

import { Card, CardContent } from "@/components/ui/card";

import { cn } from "@/lib/utils";
import { getWeekNumber, formatTime } from "@/lib/dates";

function CalendarDotGrid() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (firstDay + 6) % 7;

  const dots: React.ReactNode[] = [];
  for (let i = 0; i < offset; i++) {
    dots.push(
      <span
        key={`e-${i}`}
        className="h-2 w-2 rounded-full bg-transparent"
      />
    );
  }
  for (let d = 1; d <= daysInMonth; d++) {
    dots.push(
      <span
        key={d}
        className={cn(
          "h-2 w-2 rounded-full",
          d < today && "bg-faint",
          d === today && "bg-primary ring-2 ring-foreground",
          d > today && "border-[1.5px] border-faint bg-transparent"
        )}
      />
    );
  }

  return (
    <div
      className="grid gap-[3px]"
      style={{ gridTemplateColumns: "repeat(7, 8px)" }}
    >
      {dots}
    </div>
  );
}

export function DateWidget() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const dayName = time.toLocaleDateString(undefined, { weekday: "long" });
  const fullDate = time.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const weekNum = getWeekNumber(time);

  return (
    <Card className="min-h-60 min-w-60 flex-1 bg-gradient-to-b from-white/[0.02] to-transparent shadow-[var(--shadow-soft)]">
      <CardContent className="grid h-full grid-rows-[auto_1fr_auto] p-4">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            Date
          </span>
          <span className="text-lg tracking-wider text-faint">···</span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-muted-foreground">{dayName}</p>
            <p className="font-serif text-xl font-medium">{fullDate}</p>
            <p className="text-xs text-faint">Week {weekNum}</p>
            <p className="mt-0.5 text-muted-foreground">
              {formatTime(time)}
            </p>
          </div>
          <CalendarDotGrid />
        </div>
        <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2 text-[0.7rem] text-faint">
          <span>Local time</span>
          <span className="text-right">
            {time.toLocaleDateString(undefined, {
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
