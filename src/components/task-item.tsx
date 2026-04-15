"use client";

import { ChevronDown, ChevronRight, Check, Pencil, X, Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { cn } from "@/lib/utils";
import { minutesToClock } from "@/lib/dates";

import type { Task, Bucket } from "@/types";

const MAX_DEPTH = 3;

function priorityBorderColor(priority: string): string {
  if (priority === "high") return "hsl(var(--priority-high))";
  if (priority === "low") return "hsl(var(--priority-low))";
  return "hsl(var(--priority-medium))";
}

export function getChildren(allTasks: Task[], parentId: number | null): Task[] {
  return allTasks
    .filter((t) => (t.parentId ?? null) === parentId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function isLocked(task: Task, allTasks: Task[]): boolean {
  if (task.type !== "sequential" || !task.dependsOn) return false;
  const dep = allTasks.find((t) => t.id === task.dependsOn);
  if (!dep) return false;
  return dep.status !== "done";
}

export function getDescendantIds(taskId: number, allTasks: Task[]): number[] {
  const ids: number[] = [];
  const queue = [taskId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = getChildren(allTasks, current);
    for (const child of children) {
      if (child.id != null) {
        ids.push(child.id);
        queue.push(child.id);
      }
    }
  }
  return ids;
}

function descendantsProgress(
  taskId: number,
  allTasks: Task[]
): { done: number; total: number } | null {
  const ids = getDescendantIds(taskId, allTasks);
  if (ids.length === 0) return null;
  const done = ids.filter(
    (id) => allTasks.find((t) => t.id === id)?.status === "done"
  ).length;
  return { done, total: ids.length };
}

interface TaskItemProps {
  task: Task;
  allTasks: Task[];
  depth: number;
  collapsedBranches: Set<number>;
  onToggleComplete: (task: Task) => void;
  onToggleBranch: (taskId: number) => void;
  onAddSubtask: (parentId: number, bucket: Bucket) => void;
  onAddSequential: (afterTask: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export function TaskItem({
  task,
  allTasks,
  depth,
  collapsedBranches,
  onToggleComplete,
  onToggleBranch,
  onAddSubtask,
  onAddSequential,
  onEdit,
  onDelete,
}: TaskItemProps) {
  const locked = isLocked(task, allTasks);
  const children = getChildren(allTasks, task.id ?? null);
  const hasChildren = children.length > 0;
  const collapsed = task.id != null && collapsedBranches.has(task.id);

  return (
    <>
      <li
        className={cn(
          "grid grid-cols-[auto_1fr_auto] items-center gap-2.5 rounded-md border bg-muted p-3",
          depth === 1 && "ml-9",
          depth === 2 && "ml-[4.4rem]",
          depth >= 3 && "ml-[6.6rem]",
          task.status === "done" && "opacity-70",
          locked && "opacity-70 grayscale-[60%]"
        )}
        style={{
          borderLeftWidth: 3,
          borderLeftColor: priorityBorderColor(task.priority),
        }}
      >
        <button
          type="button"
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-border transition-colors",
            task.status === "done" &&
              "border-primary bg-primary text-background",
            locked && "cursor-not-allowed opacity-45"
          )}
          disabled={locked}
          onClick={() => onToggleComplete(task)}
          aria-label={
            task.status === "done" ? "Mark task pending" : "Mark task done"
          }
        >
          {task.status === "done" && <Check className="h-3.5 w-3.5" />}
        </button>

        <div className="grid min-w-0 gap-1">
          <div className="flex items-center gap-1.5">
            {hasChildren && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => task.id != null && onToggleBranch(task.id)}
                aria-label="Toggle sub-tasks"
              >
                {collapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            )}
            <p className="truncate">{task.title}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className={cn(
                "animate-settle-in text-[0.73rem] uppercase tracking-wider",
                task.priority === "high" &&
                  "border-destructive/30 bg-destructive/15 text-destructive",
                task.priority === "medium" &&
                  "border-warning/30 bg-warning/15 text-warning",
                task.priority === "low" &&
                  "border-success/30 bg-success/15 text-success"
              )}
            >
              {task.priority}
            </Badge>
            {task.estimatedMin > 0 && (
              <Badge variant="outline" className="mono text-[0.73rem]">
                {minutesToClock(task.estimatedMin)}
              </Badge>
            )}
            {task.type === "sequential" && (
              <Badge variant="outline" className="mono text-[0.73rem]">
                {locked ? "locked" : "sequential"}
              </Badge>
            )}
            {hasChildren &&
              collapsed &&
              (() => {
                const p = descendantsProgress(task.id!, allTasks);
                return p ? (
                  <Badge variant="outline" className="mono text-[0.73rem]">
                    {p.done}/{p.total}
                  </Badge>
                ) : null;
              })()}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs text-muted-foreground"
            disabled={depth >= MAX_DEPTH}
            onClick={() =>
              task.id != null && onAddSubtask(task.id, task.bucket)
            }
            aria-label="Add sub-task"
          >
            Sub
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs text-muted-foreground"
            onClick={() => onAddSequential(task)}
            aria-label="Add sequential task"
          >
            Seq
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={() => onEdit(task)}
            aria-label="Edit task"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={() => onDelete(task)}
            aria-label="Delete task"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {(task.notes || task.link) && (
          <div className="col-span-2 col-start-2 mt-0.5 grid gap-1 rounded-md border border-border p-2.5">
            {task.notes && (
              <p className="whitespace-pre-wrap break-words text-sm">
                {task.notes}
              </p>
            )}
            {task.link && (
              <a
                href={task.link}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-sm text-accent no-underline hover:underline"
              >
                <Link2 className="h-3 w-3" />
                {task.link}
              </a>
            )}
          </div>
        )}
      </li>

      {hasChildren &&
        !collapsed &&
        children.map((child) => (
          <TaskItem
            key={child.id}
            task={child}
            allTasks={allTasks}
            depth={depth + 1}
            collapsedBranches={collapsedBranches}
            onToggleComplete={onToggleComplete}
            onToggleBranch={onToggleBranch}
            onAddSubtask={onAddSubtask}
            onAddSequential={onAddSequential}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
    </>
  );
}
