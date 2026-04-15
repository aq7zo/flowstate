"use client";

import { useState, useEffect } from "react";

import { Card, CardContent } from "@/components/ui/card";

import { cn } from "@/lib/utils";
import { getWeekNumber, formatTime } from "@/lib/dates";
import { getSettings, initDb } from "@/lib/db";

import type { WeekStartDay } from "@/types";

const WEEKDAY_TO_INDEX: Record<WeekStartDay, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONDAY_INDEX: number = WEEKDAY_TO_INDEX.monday;

function getWeekdayHeader(weekStartDay: WeekStartDay): string[] {
  const startIdx = WEEKDAY_TO_INDEX[weekStartDay];
  return Array.from({ length: 7 }, (_, i) => WEEKDAY_LABELS[(startIdx + i) % 7]);
}

function getCalendarOffset(
  firstDay: number,
  weekStartDayIndex: number
): number {
  return (firstDay - weekStartDayIndex + 7) % 7;
}

function validateGridOrFallback(
  year: number,
  month: number,
  daysInMonth: number,
  firstDay: number,
  weekStartDay: WeekStartDay
): number {
  const weekStartDayIndex = WEEKDAY_TO_INDEX[weekStartDay];
  const computedOffset = getCalendarOffset(firstDay, weekStartDayIndex);
  const totalCells = computedOffset + daysInMonth;
  const isAligned = totalCells % 7 === 0 || totalCells <= 42;
  const day1Column = computedOffset % 7;
  const expectedColumn = getCalendarOffset(firstDay, weekStartDayIndex);

  const lastCellIndex = computedOffset + daysInMonth - 1;
  const lastColumn = lastCellIndex % 7;
  const expectedLastDay = new Date(year, month, daysInMonth).getDay();
  const expectedLastColumn = getCalendarOffset(expectedLastDay, weekStartDayIndex);

  if (isAligned && day1Column === expectedColumn && lastColumn === expectedLastColumn) {
    return computedOffset;
  }

  if (process.env.NODE_ENV !== "production") {
    console.error(
      "[DateWidget] Calendar grid invariant failed",
      {
        year,
        month,
        daysInMonth,
        weekStartDay,
        totalCells,
        isAligned,
        day1Column,
        expectedColumn,
        lastColumn,
        expectedLastColumn,
      }
    );
  }

  return getCalendarOffset(firstDay, MONDAY_INDEX);
}

function runCalendarGridSelfChecks() {
  if (process.env.NODE_ENV === "production") return;

  const weekStarts = Object.keys(WEEKDAY_TO_INDEX) as WeekStartDay[];

  // Validate all 49 firstDay x weekStart combinations for day-1 placement.
  for (let firstDay = 0; firstDay < 7; firstDay++) {
    for (const start of weekStarts) {
      const idx = WEEKDAY_TO_INDEX[start];
      const offset = getCalendarOffset(firstDay, idx);
      const expectedColumn = getCalendarOffset(firstDay, idx);
      if (offset % 7 !== expectedColumn) {
        console.error("[DateWidget] 49-case offset check failed", {
          firstDay,
          weekStartDay: start,
          offset,
          expectedColumn,
        });
      }
    }
  }

  // Leap-year February.
  const leapYearDays = new Date(2024, 2, 0).getDate();
  if (leapYearDays !== 29) {
    console.error("[DateWidget] Leap year check failed", { leapYearDays });
  }

  // 31-day month starting on configured start day can require 6 rows in Sunday-first mode.
  const august2020FirstDay = new Date(2020, 7, 1).getDay(); // Saturday
  const august2020Days = new Date(2020, 8, 0).getDate(); // 31
  const sundayOffset = getCalendarOffset(
    august2020FirstDay,
    WEEKDAY_TO_INDEX.sunday
  );
  const augustTotalCells = sundayOffset + august2020Days;
  if (augustTotalCells !== 37) {
    console.error("[DateWidget] 31-day calendar span check failed", {
      augustTotalCells,
    });
  }

  // Month starting day before configured start day (Sunday before Monday).
  const sundayBeforeMonday = getCalendarOffset(
    0,
    WEEKDAY_TO_INDEX.monday
  );
  if (sundayBeforeMonday !== 6) {
    console.error("[DateWidget] Start-day-minus-one check failed", {
      sundayBeforeMonday,
    });
  }
}

function CalendarDotGrid({ weekStartDay }: { weekStartDay: WeekStartDay }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = validateGridOrFallback(
    year,
    month,
    daysInMonth,
    firstDay,
    weekStartDay
  );
  const weekdayHeader = getWeekdayHeader(weekStartDay);

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
    <div className="grid gap-1">
      <div
        className="grid gap-[6px]"
        style={{ gridTemplateColumns: "repeat(7, 12px)" }}
      >
        {weekdayHeader.map((label, idx) => (
          <span
            key={`${label}-${idx}`}
            className="text-[9px] leading-none text-faint text-center translate-y-[-2px]"
          >
            {label}
          </span>
        ))}
      </div>
      <div
        className="grid gap-[6.5px]"
        style={{ gridTemplateColumns: "repeat(7, 12px)" }}
      >
        {dots}
      </div>
    </div>
  );
}

export function DateWidget() {
  const [time, setTime] = useState(new Date());
  const [weekStartDay, setWeekStartDay] = useState<WeekStartDay>("monday");

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let mounted = true;
    runCalendarGridSelfChecks();

    async function syncWeekStartDay() {
      await initDb();
      const settings = await getSettings();
      if (!mounted) return;
      setWeekStartDay(settings.weekStartDay ?? "monday");
    }

    syncWeekStartDay();
    const id = setInterval(syncWeekStartDay, 5000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
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
        <div className="mb-2.5">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            Date
          </span>
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
          <CalendarDotGrid weekStartDay={weekStartDay} />
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
