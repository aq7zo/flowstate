"use client";

import { useState, useEffect, useCallback, useRef } from "react";

import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";

import { DateWidget } from "@/components/date-widget";
import { WeatherWidget } from "@/components/weather-widget";
import { AllocationBar } from "@/components/allocation-bar";
import { TaskForm } from "@/components/task-form";
import {
  TaskItem,
  buildSiblingGroups,
  getChildren,
  getDescendantIds,
  getLeaders,
} from "@/components/task-item";

import { cn } from "@/lib/utils";
import {
  initDb,
  getSettings,
  patchSettings,
  getTasksByDate,
  createTask,
  updateTask,
  deleteTask,
  bulkUpdateTasks,
  getUnfinishedTasksByDate,
} from "@/lib/db";
import { toDateKey, yesterdayKey, minutesToClock } from "@/lib/dates";

import type { Task, AppSettings, Bucket, Priority } from "@/types";

const BUCKETS: Bucket[] = ["today", "tomorrow", "upcoming"];
const BUCKET_LABEL: Record<Bucket, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  upcoming: "Upcoming",
};
interface CreationContext {
  mode: "root" | "subtask" | "sequential";
  parentId: number | null;
  dependsOn: number | null;
  insertAfterId: number | null;
  bucket: Bucket;
}

function normalizeBucket(b: string | undefined): Bucket {
  return BUCKETS.includes(b as Bucket) ? (b as Bucket) : "today";
}

function getDepth(taskId: number, tasks: Task[]): number {
  let depth = 0;
  let current = tasks.find((t) => t.id === taskId);
  while (current?.parentId) {
    depth++;
    current = tasks.find((t) => t.id === current!.parentId);
  }
  return depth;
}

function priorityBorderColor(priority: Priority): string {
  if (priority === "high") return "hsl(var(--priority-high))";
  if (priority === "low") return "hsl(var(--priority-low))";
  if (priority === "medium") return "hsl(var(--priority-medium))";
  return "hsl(var(--border))";
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [ready, setReady] = useState(false);

  const [creationOpen, setCreationOpen] = useState(false);
  const [creationCtx, setCreationCtx] = useState<CreationContext>({
    mode: "root",
    parentId: null,
    dependsOn: null,
    insertAfterId: null,
    bucket: "today",
  });

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editPriority, setEditPriority] = useState<Priority>("none");
  const [editTag, setEditTag] = useState<string>("none");
  const [editEstimated, setEditEstimated] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editLinks, setEditLinks] = useState<string[]>([""]);

  const [carryoverOpen, setCarryoverOpen] = useState(false);
  const [carryoverTasks, setCarryoverTasks] = useState<Task[]>([]);
  const [tomorrowPlannerOpen, setTomorrowPlannerOpen] = useState(false);

  const [expandedBuckets, setExpandedBuckets] = useState<Set<Bucket>>(
    new Set(["today"])
  );
  const [collapsedBranches, setCollapsedBranches] = useState<Set<number>>(
    new Set()
  );
  const [showAllocation, setShowAllocation] = useState(true);
  const [feedback, setFeedback] = useState("");

  const todayKey = useRef(toDateKey());
  const tomorrowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoStackRef = useRef<
    { id: number; snapshot: Partial<Task> }[]
  >([]);

  const refresh = useCallback(async () => {
    const t = await getTasksByDate(todayKey.current);
    setTasks(t);
  }, []);

  useEffect(() => {
    async function init() {
      await initDb();
      const s = await getSettings();
      setSettings(s);
      setReady(true);

      await refresh();

      if (s.lastSessionDate && s.lastSessionDate !== todayKey.current) {
        const yesterday = yesterdayKey(todayKey.current);
        const unfinished = await getUnfinishedTasksByDate(yesterday);
        const threshold = s.carryOverThreshold ?? 1;
        if (unfinished.length >= threshold) {
          setCarryoverTasks(unfinished);
          setCarryoverOpen(true);
        }
      }
      await patchSettings({ lastSessionDate: todayKey.current });

      if (s.tomorrowPromptEnabled) {
        const [h, m] = (s.tomorrowPromptTime || "20:30").split(":").map(Number);
        if (!isNaN(h) && !isNaN(m)) {
          const target = new Date();
          target.setHours(h, m, 0, 0);
          if (Date.now() < target.getTime()) {
            tomorrowTimerRef.current = setTimeout(() => {
              setTomorrowPlannerOpen(true);
            }, target.getTime() - Date.now());
          }
        }
      }
    }
    init();
    return () => {
      if (tomorrowTimerRef.current) clearTimeout(tomorrowTimerRef.current);
    };
  }, [refresh]);

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      const tag = (document.activeElement?.tagName ?? "").toUpperCase();
      const inField =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (e.key === "Escape") {
        if (editingTask) setEditingTask(null);
        if (creationOpen) setCreationOpen(false);
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !inField) {
        const undo = undoStackRef.current.pop();
        if (undo) {
          updateTask(undo.id, undo.snapshot).then(() => refresh());
        }
      }

      if (e.key.toLowerCase() === "n" && !e.metaKey && !e.ctrlKey && !inField) {
        e.preventDefault();
        openCreation("today");
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [creationOpen, editingTask, refresh]);

  function openCreation(bucket: Bucket) {
    setCreationCtx({
      mode: "root",
      parentId: null,
      dependsOn: null,
      insertAfterId: null,
      bucket,
    });
    setCreationOpen(true);
    setExpandedBuckets((prev) => new Set(prev).add(bucket));
  }

  async function handleCreateTask(data: {
    title: string;
    priority: Priority;
    tag: string | null;
    estimatedMin: number;
    notes: string;
    links: string[];
  }) {
    const maxDepth = settings?.maxNestingDepth ?? 0;
    if (maxDepth > 0 && creationCtx.parentId) {
      const parentDepth = getDepth(creationCtx.parentId, tasks);
      if (parentDepth >= maxDepth) {
        setFeedback(`Cannot nest deeper than ${maxDepth} levels.`);
        return;
      }
    }

    const parentTask = creationCtx.parentId
      ? tasks.find((t) => t.id === creationCtx.parentId)
      : null;
    const bucket = normalizeBucket(
      parentTask?.bucket || creationCtx.bucket
    );
    const siblings = getChildren(tasks, creationCtx.parentId);
    let targetOrder: number;
    if (
      creationCtx.mode === "sequential" &&
      creationCtx.dependsOn != null
    ) {
      const predId = creationCtx.dependsOn;
      const hasParallelBranch = siblings.some(
        (s) => s.type === "sequential" && s.dependsOn === predId
      );
      if (hasParallelBranch) {
        const maxOrder = siblings.reduce(
          (m, s) => Math.max(m, s.order || 0),
          0
        );
        targetOrder = maxOrder + 1;
      } else if (creationCtx.insertAfterId) {
        const idx = siblings.findIndex(
          (t) => t.id === creationCtx.insertAfterId
        );
        targetOrder = idx >= 0 ? idx + 2 : siblings.length + 1;
      } else {
        targetOrder = siblings.length + 1;
      }
    } else {
      targetOrder = siblings.length + 1;
      if (creationCtx.insertAfterId) {
        const idx = siblings.findIndex(
          (t) => t.id === creationCtx.insertAfterId
        );
        if (idx >= 0) targetOrder = idx + 2;
      }
    }

    const created = await createTask({
      ...data,
      parentId: creationCtx.parentId,
      bucket,
      dependsOn: creationCtx.dependsOn,
      type: creationCtx.mode === "sequential" ? "sequential" : "standard",
      date: todayKey.current,
    });
    await updateTask(created.id!, { order: targetOrder });

    const shifted = siblings
      .filter((t) => (t.order || 0) >= targetOrder)
      .map((t) => ({ id: t.id!, changes: { order: (t.order || 0) + 1 } }));
    if (shifted.length > 0) await bulkUpdateTasks(shifted);

    if (creationCtx.mode !== "root") setCreationOpen(false);
    setFeedback("");
    await refresh();
  }

  async function handleToggleComplete(task: Task) {
    const nextStatus = task.status === "done" ? "pending" : "done";
    const targetIds = [task.id!, ...getDescendantIds(task.id!, tasks)];
    const completedAt = nextStatus === "done" ? new Date() : null;

    undoStackRef.current.push({
      id: task.id!,
      snapshot: { status: task.status, completedAt: task.completedAt },
    });
    if (undoStackRef.current.length > 10) undoStackRef.current.shift();

    await bulkUpdateTasks(
      targetIds.map((id) => ({ id, changes: { status: nextStatus, completedAt } }))
    );

    let parentId = task.parentId;
    while (parentId) {
      const parent = tasks.find((t) => t.id === parentId);
      if (!parent) break;
      const descIds = getDescendantIds(parent.id!, tasks);
      const updatedTasks = await getTasksByDate(todayKey.current);
      const allDone =
        descIds.length > 0 &&
        descIds.every(
          (id) => updatedTasks.find((t) => t.id === id)?.status === "done"
        );
      await updateTask(parent.id!, {
        status: allDone ? "done" : "pending",
        completedAt: allDone ? new Date() : null,
      });
      parentId = parent.parentId;
    }

    await refresh();
  }

  function handleToggleBranch(taskId: number) {
    setCollapsedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function handleAddSubtask(parentId: number, bucket: Bucket) {
    setCreationCtx({
      mode: "subtask",
      parentId,
      dependsOn: null,
      insertAfterId: null,
      bucket: normalizeBucket(bucket),
    });
    setCreationOpen(true);
    setExpandedBuckets((prev) => new Set(prev).add(normalizeBucket(bucket)));
  }

  function handleAddSequential(afterTask: Task) {
    setCreationCtx({
      mode: "sequential",
      parentId: afterTask.parentId ?? null,
      dependsOn: afterTask.id!,
      insertAfterId: afterTask.id!,
      bucket: normalizeBucket(afterTask.bucket),
    });
    setCreationOpen(true);
    setExpandedBuckets((prev) =>
      new Set(prev).add(normalizeBucket(afterTask.bucket))
    );
  }

  function openEditDialog(task: Task) {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditPriority(
      (["none", "high", "medium", "low"] as const).includes(task.priority)
        ? task.priority
        : "none"
    );
    setEditEstimated(String(task.estimatedMin || 0));
    setEditTag(task.tag ?? "none");
    setEditNotes(task.notes || "");
    const initial = task.links.length > 0 ? [...task.links] : [""];
    if (initial[initial.length - 1] !== "") initial.push("");
    setEditLinks(initial);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTask) return;
    const trimmed = editTitle.trim();
    if (!trimmed) return;
    await updateTask(editingTask.id!, {
      title: trimmed,
      priority: editPriority,
      tag: editTag === "none" ? null : editTag,
      estimatedMin: Math.max(0, Number(editEstimated) || 0),
      notes: editNotes.trim(),
      links: editLinks.map((l) => l.trim()).filter(Boolean),
    });
    setEditingTask(null);
    await refresh();
  }

  async function handleDeleteTask(task: Task) {
    const removeIds = [task.id!, ...getDescendantIds(task.id!, tasks)];
    for (const id of removeIds) await deleteTask(id);
    await refresh();
  }

  async function handleReorder(
    parentId: number | null,
    activeId: number,
    overId: number
  ) {
    const siblings = getChildren(tasks, parentId);
    const groups = buildSiblingGroups(siblings);

    const leaderOf = (id: number) => {
      for (const g of groups) {
        if (g.some((t) => t.id === id)) return g[0].id!;
      }
      return id;
    };
    const activeLeader = leaderOf(activeId);
    const overLeader = leaderOf(overId);

    const oldIdx = groups.findIndex((g) => g[0].id === activeLeader);
    const newIdx = groups.findIndex((g) => g[0].id === overLeader);
    if (oldIdx === -1 || newIdx === -1) return;

    const reordered = arrayMove(groups, oldIdx, newIdx).flat();
    await bulkUpdateTasks(
      reordered.map((t, i) => ({ id: t.id!, changes: { order: i + 1 } }))
    );
    await refresh();
  }

  function handleRootDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeTask = tasks.find((t) => t.id === Number(active.id));
    const overTask = tasks.find((t) => t.id === Number(over.id));
    if (!activeTask || !overTask) return;
    if ((activeTask.parentId ?? null) !== (overTask.parentId ?? null)) return;
    handleReorder(activeTask.parentId ?? null, Number(active.id), Number(over.id));
  }

  async function carryoverAction(
    status: "pending" | "carried",
    date: string | null,
    taskIds?: number[]
  ) {
    const targets = taskIds
      ? carryoverTasks.filter((t) => taskIds.includes(t.id!))
      : carryoverTasks;
    if (targets.length === 0) return;
    await bulkUpdateTasks(
      targets.map((t) => ({
        id: t.id!,
        changes: { status, date: date || t.date, completedAt: null },
      }))
    );
    const remaining = carryoverTasks.filter(
      (t) => !targets.some((tgt) => tgt.id === t.id)
    );
    setCarryoverTasks(remaining);
    if (remaining.length === 0) setCarryoverOpen(false);
    await refresh();
  }

  if (!ready || !settings) {
    return (
      <section className="grid gap-4">
        <div className="h-60 animate-pulse rounded-lg bg-muted" />
        <div className="h-96 animate-pulse rounded-lg bg-muted" />
      </section>
    );
  }

  const quotaMinutes = settings.dailyQuota || 480;
  const customTagColors = Object.fromEntries(
    (settings.customTags ?? []).map((t) => [t.name, t.color])
  ) as Record<string, string>;
  const totalDone = tasks.filter((t) => t.status === "done").length;
  const estimated = tasks.reduce(
    (sum, t) => sum + (Number(t.estimatedMin) || 0),
    0
  );
  const overQuota = estimated > quotaMinutes;

  return (
    <section className="grid gap-4">
      {/* Widgets */}
      <div className="flex flex-wrap gap-3 max-[540px]:flex-col">
        <DateWidget />
        <WeatherWidget settings={settings} />
      </div>

      {/* Task Panel */}
      <Card className="bg-gradient-to-b from-white/[0.02] to-transparent shadow-[var(--shadow-soft)]">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="mono text-muted-foreground">
              {totalDone}/{tasks.length} completed
            </p>
          </div>

          {overQuota && (
            <Alert
              variant="destructive"
              className={cn(
                "mb-3",
                estimated > 1440
                  ? "border-destructive/40 text-destructive"
                  : "border-warning/35 text-warning"
              )}
            >
              <AlertDescription className="mono">
                You&apos;ve planned {minutesToClock(estimated)} against a{" "}
                {minutesToClock(quotaMinutes)} quota.
              </AlertDescription>
            </Alert>
          )}

          {feedback && (
            <Alert variant="destructive" className="mb-3">
              <AlertDescription className="mono">{feedback}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-3">
            {BUCKETS.map((bucket) => {
              const roots = getChildren(tasks, null).filter(
                (t) => normalizeBucket(t.bucket) === bucket
              );
              const isExpanded = expandedBuckets.has(bucket);

              return (
                <Collapsible
                  key={bucket}
                  open={isExpanded}
                  onOpenChange={(open) =>
                    setExpandedBuckets((prev) => {
                      const next = new Set(prev);
                      if (open) next.add(bucket);
                      else next.delete(bucket);
                      return next;
                    })
                  }
                >
                  <div className="rounded-md border border-border bg-white/[0.015] p-3">
                    <div className="mb-2 flex items-center justify-between gap-1.5">
                      <CollapsibleTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-auto border-none p-0 font-serif text-lg text-foreground"
                        >
                          {BUCKET_LABEL[bucket]}{" "}
                          {isExpanded ? "[-]" : "[+]"}
                        </Button>
                      </CollapsibleTrigger>
                      <div className="flex items-center gap-1.5">
                        {roots.length > 0 && (
                          <Badge
                            variant="outline"
                            className="mono min-w-7 justify-center bg-primary/20 text-primary"
                          >
                            {roots.length}
                          </Badge>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground"
                          onClick={() => openCreation(bucket)}
                          aria-label={`Add task for ${BUCKET_LABEL[bucket]}`}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <CollapsibleContent>
                      {roots.length === 0 ? (
                        <p className="py-1 text-muted-foreground">
                          No tasks yet.
                        </p>
                      ) : (
                        <DndContext
                          collisionDetection={closestCenter}
                          modifiers={[restrictToParentElement]}
                          onDragEnd={handleRootDragEnd}
                        >
                          <SortableContext
                            items={getLeaders(roots).map((t) => t.id!)}
                            strategy={verticalListSortingStrategy}
                          >
                            <ul className="relative grid list-none gap-2.5 overflow-hidden p-0">
                              {getLeaders(roots).map((task) => (
                                <TaskItem
                                  key={task.id}
                                  task={task}
                                  allTasks={tasks}
                                  customTagColors={customTagColors}
                                  depth={0}
                                  collapsedBranches={collapsedBranches}
                                  onToggleComplete={handleToggleComplete}
                                  onToggleBranch={handleToggleBranch}
                                  onAddSubtask={handleAddSubtask}
                                  onAddSequential={handleAddSequential}
                                  onEdit={openEditDialog}
                                  onDelete={handleDeleteTask}
                                  onReorder={handleReorder}
                                />
                              ))}
                            </ul>
                          </SortableContext>
                        </DndContext>
                      )}
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Creation Dialog */}
      <Dialog open={creationOpen} onOpenChange={setCreationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {creationCtx.mode === "subtask"
                ? "Add Sub-task"
                : creationCtx.mode === "sequential"
                  ? "Add Sequential Task"
                  : `Add Task for ${BUCKET_LABEL[creationCtx.bucket]}`}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <TaskForm
              onSubmit={handleCreateTask}
              defaultPriority={settings.defaultPriority}
              customTags={settings.customTags ?? []}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Day Allocation */}
      <Card className="bg-gradient-to-b from-white/[0.02] to-transparent shadow-[var(--shadow-soft)]">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle>Day Allocation</CardTitle>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowAllocation((prev) => !prev)}
          >
            {showAllocation ? "Hide" : "Show"}
          </Button>
        </CardHeader>
        {showAllocation && (
          <CardContent>
            <AllocationBar tasks={tasks} quotaMinutes={quotaMinutes} />
          </CardContent>
        )}
      </Card>

      {/* Carryover Dialog */}
      <Dialog open={carryoverOpen} onOpenChange={setCarryoverOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unfinished Tasks Found</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            You left {carryoverTasks.length} tasks unfinished yesterday.
          </p>
          <ScrollArea className="max-h-[45vh]">
            <ul className="grid list-none gap-2 p-0">
              {carryoverTasks.map((task) => (
                <li
                  key={task.id}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-1.5 rounded-md border bg-muted p-2.5"
                  style={{
                    borderLeftWidth: 3,
                    borderLeftColor:
                      (task.tag && customTagColors[task.tag]) ||
                      priorityBorderColor(task.priority),
                  }}
                >
                  <span>{task.title}</span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      carryoverAction("pending", todayKey.current, [task.id!])
                    }
                  >
                    Move to Today
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      carryoverAction("carried", task.date, [task.id!])
                    }
                  >
                    Dismiss
                  </Button>
                </li>
              ))}
            </ul>
          </ScrollArea>
          <DialogFooter className="flex-wrap gap-1.5">
            <Button
              type="button"
              onClick={() =>
                carryoverAction("pending", todayKey.current)
              }
            >
              Move All
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => carryoverAction("carried", null)}
            >
              Dismiss All
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCarryoverOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Task Dialog */}
      <Dialog
        open={editingTask !== null}
        onOpenChange={(open) => {
          if (!open) setEditingTask(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-title">Task Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={120}
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="edit-priority">Priority</Label>
                <Select
                  value={editPriority}
                  onValueChange={(v) => setEditPriority(v as Priority)}
                >
                  <SelectTrigger id="edit-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No priority</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-tag">Tag</Label>
                <Select value={editTag} onValueChange={setEditTag}>
                  <SelectTrigger id="edit-tag">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No tag</SelectItem>
                    {(settings.customTags ?? []).map((t) => (
                      <SelectItem key={t.name} value={t.name}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-estimated">Estimated Minutes</Label>
                <Input
                  id="edit-estimated"
                  type="number"
                  min={0}
                  step={5}
                  value={editEstimated}
                  onChange={(e) => setEditEstimated(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                maxLength={500}
                rows={3}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Reference Links</Label>
              {editLinks.map((link, i) => (
                <Input
                  key={i}
                  type="url"
                  value={link}
                  onChange={(e) => {
                    setEditLinks((prev) => {
                      const next = [...prev];
                      next[i] = e.target.value;
                      if (i === next.length - 1 && e.target.value.length > 0) {
                        next.push("");
                      }
                      return next;
                    });
                  }}
                  placeholder={
                    i === 0
                      ? "https://canvas.example.com/..."
                      : "Add another link..."
                  }
                />
              ))}
            </div>
            <DialogFooter>
              <Button type="submit">Save Task</Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditingTask(null)}
              >
                Cancel
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Tomorrow Planner Dialog */}
      <Dialog
        open={tomorrowPlannerOpen}
        onOpenChange={setTomorrowPlannerOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tomorrow Starts Tonight.</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            It is time to plan tomorrow. Open the Tomorrow section and add
            tasks now?
          </p>
          <DialogFooter className="flex-wrap gap-1.5">
            <Button
              type="button"
              onClick={() => {
                setTomorrowPlannerOpen(false);
                setExpandedBuckets((prev) => new Set(prev).add("tomorrow"));
                openCreation("tomorrow");
              }}
            >
              Plan Tomorrow
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setTomorrowPlannerOpen(false);
                tomorrowTimerRef.current = setTimeout(
                  () => setTomorrowPlannerOpen(true),
                  15 * 60 * 1000
                );
              }}
            >
              Snooze 15m
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setTomorrowPlannerOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
