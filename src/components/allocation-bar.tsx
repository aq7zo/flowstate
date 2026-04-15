"use client";

import { getChildren } from "@/components/task-item";

import { cn } from "@/lib/utils";
import { minutesToClock } from "@/lib/dates";

import type { Task } from "@/types";

interface AllocationBarProps {
  tasks: Task[];
  quotaMinutes: number;
}

export function AllocationBar({ tasks, quotaMinutes }: AllocationBarProps) {
  const todayRoots = getChildren(tasks, null).filter(
    (t) => t.bucket === "today"
  );
  const timedTasks = todayRoots.filter((t) => (t.estimatedMin || 0) > 0);
  const totalMinutes = timedTasks.reduce(
    (sum, t) => sum + (t.estimatedMin || 0),
    0
  );

  let state: "healthy" | "over-quota" | "impossible" = "healthy";
  if (totalMinutes > 1440) state = "impossible";
  else if (totalMinutes > quotaMinutes) state = "over-quota";

  const barPercent =
    totalMinutes > 0 ? Math.min((totalMinutes / 1440) * 100, 101) : 0;
  const quotaPercent = (quotaMinutes / 1440) * 100;

  const stateLabel =
    state === "impossible"
      ? "Exceeding physical limits of a 24h day."
      : state === "over-quota"
        ? "Exceeding your daily goal."
        : "Within capacity.";

  const segColor =
    state === "impossible"
      ? "bg-destructive"
      : state === "over-quota"
        ? "bg-warning"
        : "bg-accent";

  const segColorEven =
    state === "impossible"
      ? "bg-destructive/70"
      : state === "over-quota"
        ? "bg-warning/70"
        : "bg-accent/70";

  return (
    <div className="grid gap-2.5">
      <div
        className={cn(
          "relative h-8 overflow-visible rounded-md border bg-muted transition-colors",
          state === "over-quota" && "border-warning/40",
          state === "impossible" && "border-destructive/45"
        )}
      >
        <div
          className="flex h-full rounded-[inherit] transition-[width] duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ width: barPercent > 0 ? `${barPercent}%` : "0" }}
        >
          {timedTasks.map((task, i) => {
            const segPercent =
              totalMinutes > 0
                ? (task.estimatedMin / totalMinutes) * 100
                : 0;
            return (
              <div
                key={task.id}
                className={cn(
                  "relative h-full min-w-[2px] cursor-default transition-[filter] duration-150 hover:z-[1] hover:brightness-[1.3]",
                  i % 2 === 0 ? segColor : segColorEven,
                  task.status === "done" && "opacity-45",
                  i > 0 && "border-l border-black/20",
                  i === 0 && "rounded-l-md",
                  i === timedTasks.length - 1 && "rounded-r-md",
                  timedTasks.length === 1 && "rounded-md"
                )}
                style={{ flex: `0 0 ${segPercent}%` }}
                title={`${task.title} · ${minutesToClock(task.estimatedMin)}`}
              />
            );
          })}
        </div>

        <div
          className="pointer-events-none absolute bottom-[-6px] top-[-6px] z-[3] w-0 border-l-2 border-dashed border-muted-foreground"
          style={{ left: `${quotaPercent}%` }}
        >
          <span className="absolute left-0 top-[calc(100%+3px)] -translate-x-1/2 whitespace-nowrap font-mono text-[0.65rem] text-muted-foreground">
            {minutesToClock(quotaMinutes)}
          </span>
        </div>
      </div>

      <p
        className={cn(
          "mono text-sm transition-colors",
          state === "over-quota" && "text-warning",
          state === "impossible" && "text-destructive",
          state === "healthy" && "text-muted-foreground"
        )}
      >
        Allocated: {minutesToClock(totalMinutes)} / 24h (Quota:{" "}
        {minutesToClock(quotaMinutes)}) — {stateLabel}
      </p>
    </div>
  );
}
