"use client";

import { useState, useEffect, useCallback } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

import { cn } from "@/lib/utils";
import {
  initDb,
  getAllTasks,
  getSettings,
  patchSettings,
  getPomodoroLogsByDateRange,
  upsertDailySummary,
} from "@/lib/db";
import { toDateKey, addDays, minutesToClock } from "@/lib/dates";

import type { Task, PomodoroLog, DailySummary } from "@/types";

type DailyMap = Map<
  string,
  { date: string; planned: number; completed: number; tags: Record<string, number> }
>;

async function computeDaily(tasks: Task[]): Promise<DailyMap> {
  const map: DailyMap = new Map();
  tasks.forEach((task) => {
    const key = task.date;
    if (!map.has(key)) {
      map.set(key, { date: key, planned: 0, completed: 0, tags: {} });
    }
    const row = map.get(key)!;
    row.planned += 1;
    if (task.status === "done") row.completed += 1;
    row.tags[task.priority] = (row.tags[task.priority] || 0) + 1;
  });

  for (const summary of map.values()) {
    const rate =
      summary.planned === 0
        ? 0
        : Math.round((summary.completed / summary.planned) * 100);
    await upsertDailySummary({
      date: summary.date,
      planned: summary.planned,
      completed: summary.completed,
      completionRate: rate,
      tags: summary.tags,
    });
  }
  return map;
}

function completionColor(score: number): string {
  const alpha = Math.max(0.08, Math.min(0.95, score));
  return `rgba(61, 217, 197, ${alpha})`;
}

export default function CalendarPage() {
  const [ready, setReady] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [filterTag, setFilterTag] = useState("all");
  const [priorities, setPriorities] = useState<string[]>([]);
  const [dailyMap, setDailyMap] = useState<DailyMap>(new Map());
  const [streak, setStreak] = useState(0);
  const [summaryData, setSummaryData] = useState<{
    planned: number;
    done: number;
    workMins: number;
    mostProductive: string;
    tagBreakdown: string;
  }>({ planned: 0, done: 0, workMins: 0, mostProductive: "N/A", tagBreakdown: "" });

  const refresh = useCallback(async (tag: string) => {
    const tasks = await getAllTasks();
    const prioSet = new Set(tasks.map((t) => t.priority));
    setPriorities(Array.from(prioSet));

    const dm = await computeDaily(tasks);
    setDailyMap(dm);

    const start = addDays(toDateKey(), -365);
    const logs = await getPomodoroLogsByDateRange(start, toDateKey());

    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const mondayKey = toDateKey(monday);
    const sundayKey = addDays(mondayKey, 6);
    const weekTasks = tasks.filter(
      (t) => t.date >= mondayKey && t.date <= sundayKey
    );
    const planned = weekTasks.length;
    const done = weekTasks.filter((t) => t.status === "done").length;
    const workMins = logs
      .filter((l) => l.type === "work")
      .reduce((s, l) => s + l.duration, 0);

    const byDay: Record<string, { planned: number; done: number }> = {};
    weekTasks.forEach((t) => {
      byDay[t.date] = byDay[t.date] || { planned: 0, done: 0 };
      byDay[t.date].planned += 1;
      if (t.status === "done") byDay[t.date].done += 1;
    });

    let mostProductive = "N/A";
    let highestRate = -1;
    Object.entries(byDay).forEach(([day, stats]) => {
      const rate = stats.planned ? stats.done / stats.planned : 0;
      if (rate > highestRate) {
        highestRate = rate;
        mostProductive = day;
      }
    });

    const tagCounts = weekTasks.reduce(
      (acc, t) => {
        acc[t.priority] = (acc[t.priority] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    const tagBreakdown = Object.entries(tagCounts)
      .map(
        ([t, c]) =>
          `${t}: ${Math.round((c / Math.max(planned, 1)) * 100)}%`
      )
      .join(" · ");

    setSummaryData({ planned, done, workMins, mostProductive, tagBreakdown });

    const settings = await getSettings();
    const threshold = settings.streakCompletionThreshold || 80;
    const keys = Array.from(dm.keys()).sort();
    let current = 0;
    let longest = settings.longestStreak || 0;
    for (let i = keys.length - 1; i >= 0; i--) {
      const day = dm.get(keys[i])!;
      const rate =
        day.planned > 0
          ? Math.round((day.completed / day.planned) * 100)
          : 0;
      if (day.planned > 0 && rate >= threshold) current += 1;
      else if (day.planned > 0) break;
    }
    longest = Math.max(longest, current);
    setStreak(current);
    await patchSettings({ currentStreak: current, longestStreak: longest });
  }, []);

  useEffect(() => {
    async function init() {
      await initDb();
      await refresh(filterTag);
      setReady(true);
    }
    init();
  }, [refresh, filterTag]);

  if (!ready) {
    return (
      <section className="grid gap-4">
        <div className="h-96 animate-pulse rounded-lg bg-muted" />
      </section>
    );
  }

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startOffset = first.getDay();
  const totalSlots = startOffset + last.getDate();
  const todayKeyStr = toDateKey();

  return (
    <section className="grid gap-4">
      <div className="flex items-end justify-between">
        <div>
          <h1>Calendar</h1>
          <p className="text-muted-foreground">
            Track completion trends, streaks, and workload.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setShowHeatmap((p) => !p)}
        >
          {showHeatmap ? "Month View" : "Heatmap View"}
        </Button>
      </div>

      <Card className="bg-gradient-to-b from-white/[0.02] to-transparent shadow-[var(--shadow-soft)]">
        <CardContent className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Label htmlFor="cal-filter" className="mono">
              Filter Tag
            </Label>
            <Select
              value={filterTag}
              onValueChange={(v) => {
                setFilterTag(v);
                refresh(v);
              }}
            >
              <SelectTrigger id="cal-filter" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {priorities.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mono text-muted-foreground">
              Streak: {streak} days
            </p>
          </div>

          {!showHeatmap ? (
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
            >
              {Array.from({ length: totalSlots }, (_, slot) => {
                const day = slot - startOffset + 1;
                if (day < 1)
                  return <div key={slot} className="invisible" />;
                const key = toDateKey(new Date(year, month, day));
                const summary = dailyMap.get(key);
                const planned = summary?.planned || 0;
                const completed = summary?.completed || 0;
                const rate = planned > 0 ? completed / planned : 0;
                const relevant =
                  filterTag === "all" ||
                  (summary?.tags && summary.tags[filterTag]);

                return (
                  <article
                    key={slot}
                    className={cn(
                      "grid min-h-[4.2rem] content-between rounded-[10px] border border-border bg-muted p-1.5",
                      !relevant && "opacity-45"
                    )}
                  >
                    <p className="mono text-sm">{day}</p>
                    <div className="h-1 overflow-hidden rounded-full bg-accent/15">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                        style={{ width: `${Math.round(rate * 100)}%` }}
                      />
                    </div>
                    <p className="mono text-xs text-muted-foreground">
                      {completed}/{planned}
                    </p>
                  </article>
                );
              })}
            </div>
          ) : (
            <div
              className="grid gap-[2px]"
              style={{ gridTemplateColumns: "repeat(52, minmax(0, 1fr))" }}
            >
              {Array.from({ length: 365 }, (_, i) => {
                const key = addDays(todayKeyStr, -(364 - i));
                const summary = dailyMap.get(key);
                const planned = summary?.planned || 0;
                const completed = summary?.completed || 0;
                const rate = planned > 0 ? completed / planned : 0;
                const relevant =
                  filterTag === "all" ||
                  (summary?.tags && summary.tags[filterTag]);

                return (
                  <div
                    key={i}
                    className="min-h-[0.55rem] rounded-[2px]"
                    style={{
                      background: relevant
                        ? completionColor(rate)
                        : "rgba(61, 217, 197, 0.05)",
                    }}
                    title={`${key} · ${planned} tasks · ${Math.round(rate * 100)}% complete`}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-b from-white/[0.02] to-transparent shadow-[var(--shadow-soft)]">
        <CardHeader>
          <CardTitle>Week Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                label: "Tasks Planned vs Completed",
                value: `${summaryData.planned} vs ${summaryData.done}`,
              },
              {
                label: "Pomodoro Minutes",
                value: String(summaryData.workMins),
              },
              {
                label: "Most Productive Day",
                value: summaryData.mostProductive,
              },
              {
                label: "Tag Breakdown",
                value: summaryData.tagBreakdown || "No tagged tasks",
              },
            ].map((card) => (
              <article
                key={card.label}
                className="rounded-md border border-border bg-muted p-3"
              >
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <p className="mono">{card.value}</p>
              </article>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
