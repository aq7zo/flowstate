"use client";

import {
  DndContext,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Check,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Link2,
  Pencil,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { cn } from "@/lib/utils";
import { minutesToClock } from "@/lib/dates";

import SubIcon from "../../assets/icons/sub.svg";
import SeqIcon from "../../assets/icons/seq.svg";

import type { Task, Bucket } from "@/types";

type DragHandleProps = {
  listeners: ReturnType<typeof useSortable>["listeners"];
  attributes: ReturnType<typeof useSortable>["attributes"];
};

const INDENT_PX = 28;

/* ================================================================
   Utility functions (exported for tasks/page.tsx & allocation-bar)
   ================================================================ */

function priorityBorderColor(priority: string): string {
  if (priority === "high") return "hsl(var(--priority-high))";
  if (priority === "low") return "hsl(var(--priority-low))";
  if (priority === "medium") return "hsl(var(--priority-medium))";
  return "hsl(var(--border))";
}

function accentBorderColor(task: Task, customTagColors: Record<string, string>): string {
  if (task.tag && customTagColors[task.tag]) {
    return customTagColors[task.tag];
  }
  return priorityBorderColor(task.priority);
}

function badgeSnippet(text: string, maxLen = 32): string {
  const t = text.trim() || "…";
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

export function getChildren(allTasks: Task[], parentId: number | null): Task[] {
  return allTasks
    .filter((t) => (t.parentId ?? null) === parentId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
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

export function getSequentialChain(
  leaderId: number,
  siblings: Task[]
): Task[] {
  const chain: Task[] = [];
  let currentId = leaderId;
  for (;;) {
    const next = siblings.find(
      (t) => t.type === "sequential" && t.dependsOn === currentId
    );
    if (!next) break;
    chain.push(next);
    currentId = next.id!;
  }
  return chain;
}

export function getLeaders(siblings: Task[]): Task[] {
  return siblings.filter((t) => t.type !== "sequential");
}

/** All tasks in the same sibling set reachable from root via sequential dependsOn (depth-first). */
function collectSequentialGroup(
  rootId: number,
  siblings: Task[],
  visited: Set<number>
): Task[] {
  const root = siblings.find((t) => t.id === rootId);
  if (!root || visited.has(rootId)) return [];
  visited.add(rootId);
  const result: Task[] = [root];
  const followers = siblings
    .filter(
      (s) =>
        s.type === "sequential" &&
        s.dependsOn === rootId &&
        s.id != null &&
        !visited.has(s.id)
    )
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  for (const f of followers) {
    result.push(...collectSequentialGroup(f.id!, siblings, visited));
  }
  return result;
}

/** Partition siblings into reorderable groups (leader + full sequential subtree each). */
export function buildSiblingGroups(siblings: Task[]): Task[][] {
  const ordered = [...siblings].sort(
    (a, b) => (a.order || 0) - (b.order || 0)
  );
  const leaders = getLeaders(ordered);
  const consumed = new Set<number>();
  const groups: Task[][] = [];
  for (const L of leaders) {
    if (L.id == null || consumed.has(L.id)) continue;
    const visited = new Set<number>();
    const group = collectSequentialGroup(L.id, ordered, visited);
    for (const t of group) {
      if (t.id != null) consumed.add(t.id);
    }
    groups.push(group);
  }
  for (const t of ordered) {
    if (t.id != null && !consumed.has(t.id)) {
      groups.push([t]);
      consumed.add(t.id);
    }
  }
  return groups;
}

/* ================================================================
   Sequential tree data structure
   ================================================================ */

interface SeqTreeNode {
  task: Task;
  parentChildren: Task[];
  seqChildren: SeqTreeNode[];
}

function buildSeqTree(
  task: Task,
  allTasks: Task[],
  siblings: Task[],
  visited = new Set<number>()
): SeqTreeNode {
  visited.add(task.id!);
  const parentChildren = getChildren(allTasks, task.id ?? null);
  const seqFollowers = siblings
    .filter(
      (s) =>
        s.type === "sequential" &&
        s.dependsOn === task.id &&
        !visited.has(s.id!)
    )
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  return {
    task,
    parentChildren,
    seqChildren: seqFollowers.map((f) =>
      buildSeqTree(f, allTasks, siblings, visited)
    ),
  };
}

/* ================================================================
   Internal callback bundle
   ================================================================ */

interface TaskCallbacks {
  allTasks: Task[];
  customTagColors: Record<string, string>;
  depth: number;
  collapsedBranches: Set<number>;
  onToggleComplete: (task: Task) => void;
  onToggleBranch: (taskId: number) => void;
  onAddSubtask: (parentId: number, bucket: Bucket) => void;
  onAddSequential: (afterTask: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onReorder: (
    parentId: number | null,
    activeId: number,
    overId: number
  ) => void;
}

/* ================================================================
   Shared sub-components
   ================================================================ */

function TaskCheckbox({
  task,
  onToggle,
  size = "md",
}: {
  task: Task;
  onToggle: (task: Task) => void;
  size?: "md" | "sm";
}) {
  const dim = size === "sm" ? "h-5 w-5" : "h-[22px] w-[22px]";
  const icon = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  return (
    <button
      type="button"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border-2 border-border transition-colors",
        dim,
        task.status === "done" && "border-primary bg-primary text-background"
      )}
      onClick={() => onToggle(task)}
      aria-label={
        task.status === "done" ? "Mark task pending" : "Mark task done"
      }
    >
      {task.status === "done" && <Check className={icon} />}
    </button>
  );
}

function TaskBadges({
  task,
  collapsed,
  allTasks,
  className,
}: {
  task: Task;
  collapsed: boolean;
  allTasks: Task[];
  className?: string;
}) {
  const parentTask =
    task.parentId != null
      ? allTasks.find((t) => t.id === task.parentId)
      : undefined;
  const priorTask =
    task.type === "sequential" && task.dependsOn != null
      ? allTasks.find((t) => t.id === task.dependsOn)
      : undefined;

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {task.tag && (
        <Badge
          variant="outline"
          className="max-w-full text-[0.7rem] px-1.5 py-0 border-primary/35 bg-primary/10 text-primary normal-case tracking-normal"
          title={task.tag}
        >
          <span className="truncate">tag: "{task.tag}"</span>
        </Badge>
      )}
      {task.priority !== "none" && (
        <Badge
          variant="outline"
          className={cn(
            "animate-settle-in text-[0.7rem] uppercase tracking-wider px-1.5 py-0",
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
      )}
      {task.estimatedMin > 0 && (
        <Badge variant="outline" className="mono text-[0.7rem] px-1.5 py-0">
          {minutesToClock(task.estimatedMin)}
        </Badge>
      )}
      {task.dueDate && (
        <Badge
          variant="outline"
          className="mono text-[0.7rem] px-1.5 py-0 border-accent/30 bg-accent/10 text-accent"
        >
          due: {task.dueDate}
        </Badge>
      )}
      {parentTask && (
        <Badge
          variant="outline"
          className="max-w-full text-[0.7rem] px-1.5 py-0 border-muted-foreground/25 bg-muted/40 text-muted-foreground normal-case tracking-normal"
          title={parentTask.title}
        >
          <span className="truncate">
            parent: "{badgeSnippet(parentTask.title)}"
          </span>
        </Badge>
      )}
      {task.type === "sequential" && task.dependsOn != null && (
        <Badge
          variant="outline"
          className="max-w-full text-[0.7rem] px-1.5 py-0 border-success/30 bg-success/10 text-success normal-case tracking-normal"
          title={priorTask?.title ?? "Unknown prior task"}
        >
          <span className="truncate">
            after: "
            {badgeSnippet(priorTask?.title ?? "…")}
            "
          </span>
        </Badge>
      )}
      {collapsed &&
        (() => {
          const p = descendantsProgress(task.id!, allTasks);
          return p ? (
            <Badge
              variant="outline"
              className="mono text-[0.7rem] px-1.5 py-0"
            >
              {p.done}/{p.total}
            </Badge>
          ) : null;
        })()}
    </div>
  );
}

function TaskMeta({ task }: { task: Task }) {
  if (!task.notes && task.links.length === 0) return null;
  return (
    <div className="mt-1.5 grid gap-1 rounded border border-border/40 p-2 text-xs">
      {task.notes && (
        <p className="whitespace-pre-wrap break-words text-muted-foreground">
          {task.notes}
        </p>
      )}
      {task.links.map((link) => (
        <a
          key={link}
          href={link}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-accent no-underline hover:underline"
        >
          <Link2 className="h-3 w-3 shrink-0" />
          <span className="truncate">{link}</span>
        </a>
      ))}
    </div>
  );
}

function TaskActions({
  task,
  cb,
}: {
  task: Task;
  cb: TaskCallbacks;
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-0.5 opacity-0 group-hover/card:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() =>
                task.id != null && cb.onAddSubtask(task.id, task.bucket)
              }
              aria-label="Create sub-task"
            >
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 bg-current"
                style={{
                  WebkitMaskImage: `url(${SubIcon.src})`,
                  maskImage: `url(${SubIcon.src})`,
                  WebkitMaskRepeat: "no-repeat",
                  maskRepeat: "no-repeat",
                  WebkitMaskPosition: "center",
                  maskPosition: "center",
                  WebkitMaskSize: "contain",
                  maskSize: "contain",
                }}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Create sub-task</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => cb.onAddSequential(task)}
              aria-label="Add next step"
            >
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 bg-current"
                style={{
                  WebkitMaskImage: `url(${SeqIcon.src})`,
                  maskImage: `url(${SeqIcon.src})`,
                  WebkitMaskRepeat: "no-repeat",
                  maskRepeat: "no-repeat",
                  WebkitMaskPosition: "center",
                  maskPosition: "center",
                  WebkitMaskSize: "contain",
                  maskSize: "contain",
                }}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add next step</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => cb.onEdit(task)}
              aria-label="Edit task"
            >
              <Pencil className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => cb.onDelete(task)}
              aria-label="Delete task"
            >
              <X className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

/* ================================================================
   LeafCard — flat task card (spec §3)
   ================================================================ */

function LeafCard({
  task,
  cb,
  showCollapseToggle,
  dragHandle,
  dragProps,
}: {
  task: Task;
  cb: TaskCallbacks;
  showCollapseToggle?: boolean;
  dragHandle?: boolean;
  dragProps?: DragHandleProps;
}) {
  const collapsed = task.id != null && cb.collapsedBranches.has(task.id);

  return (
    <div
      className={cn(
        "group/card rounded-md border border-border bg-card",
        "px-3.5 py-[9px] min-h-[40px]",
        task.status === "done" && "opacity-60"
      )}
      style={{ borderLeftWidth: 3, borderLeftColor: accentBorderColor(task, cb.customTagColors) }}
    >
      <div className="flex items-center gap-2.5">
        {dragHandle && dragProps ? (
          <button
            type="button"
            className="flex cursor-grab touch-none items-center text-muted-foreground/40 hover:text-muted-foreground"
            aria-label="Drag to reorder"
            {...dragProps.listeners}
            {...dragProps.attributes}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        ) : dragHandle ? (
          <span className="w-3.5" aria-hidden />
        ) : null}

        <TaskCheckbox task={task} onToggle={cb.onToggleComplete} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {showCollapseToggle && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0 text-muted-foreground"
                onClick={() => task.id != null && cb.onToggleBranch(task.id)}
                aria-label="Toggle children"
              >
                {collapsed ? (
                  <ChevronRight className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
            <p className="flex-1 min-w-0 truncate text-[13px] leading-snug">
              {task.title}
            </p>
            <TaskBadges
              task={task}
              collapsed={!!showCollapseToggle && collapsed}
              allTasks={cb.allTasks}
              className="shrink-0 flex-nowrap opacity-0 group-hover/card:opacity-100 focus-within:opacity-100 transition-opacity duration-150"
            />
          </div>
        </div>

        <TaskActions task={task} cb={cb} />
      </div>
      <TaskMeta task={task} />
    </div>
  );
}

/* ================================================================
   ParentContainer — container wrapping children (spec §4)

   The parent visually "swallows" everything inside it: child
   tasks, nested parent containers, AND sequential chains among
   children are all rendered within the container boundary.
   ================================================================ */

function ParentContainer({
  task,
  parentChildren,
  cb,
  dragHandle,
  dragProps,
}: {
  task: Task;
  parentChildren: Task[];
  cb: TaskCallbacks;
  dragHandle?: boolean;
  dragProps?: DragHandleProps;
}) {
  const collapsed = task.id != null && cb.collapsedBranches.has(task.id);

  function handleChildDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    cb.onReorder(task.id!, Number(active.id), Number(over.id));
  }

  const childLeaders = getLeaders(parentChildren);
  const childTrees = childLeaders.map((leader) =>
    buildSeqTree(leader, cb.allTasks, parentChildren)
  );
  const childCb = { ...cb, depth: cb.depth + 1 };

  return (
    <div className="rounded-lg border border-border bg-muted p-2 pb-2.5">
      {/* Header card */}
      <div
        className={cn(
          "group/card rounded-md border border-border bg-card",
          "px-3.5 py-[9px] min-h-[40px]",
          !collapsed && "mb-1.5",
          task.status === "done" && "opacity-60"
        )}
      style={{
          borderLeftWidth: 3,
          borderLeftColor: accentBorderColor(task, cb.customTagColors),
        }}
      >
        <div className="flex items-center gap-2.5">
          {dragHandle && dragProps ? (
            <button
              type="button"
              className="flex cursor-grab touch-none items-center text-muted-foreground/40 hover:text-muted-foreground"
              aria-label="Drag to reorder"
              {...dragProps.listeners}
              {...dragProps.attributes}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          ) : dragHandle ? (
            <span className="w-3.5" aria-hidden />
          ) : null}

          <TaskCheckbox task={task} onToggle={cb.onToggleComplete} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0 text-muted-foreground"
                onClick={() =>
                  task.id != null && cb.onToggleBranch(task.id)
                }
                aria-label="Toggle sub-tasks"
              >
                {collapsed ? (
                  <ChevronRight className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </Button>
              <p className="flex-1 min-w-0 truncate text-[13px] font-medium leading-snug">
                {task.title}
              </p>
              <TaskBadges
                task={task}
                collapsed={collapsed}
                allTasks={cb.allTasks}
                className="shrink-0 flex-nowrap opacity-0 group-hover/card:opacity-100 focus-within:opacity-100 transition-opacity duration-150"
              />
            </div>
          </div>

          <TaskActions task={task} cb={cb} />
        </div>
        <TaskMeta task={task} />
      </div>

      {/* Child zone — sequential trees swallowed inside the parent */}
      {!collapsed && childTrees.length > 0 && (
        <DndContext
          collisionDetection={closestCenter}
          onDragEnd={handleChildDragEnd}
        >
          <SortableContext
            items={childLeaders.map((c) => c.id!)}
            strategy={verticalListSortingStrategy}
          >
            <div className="relative pl-3.5 flex flex-col gap-[3px] rounded-md">
              {childTrees.map((tree) => (
                <SortableSeqGroup
                  key={tree.task.id}
                  node={tree}
                  cb={childCb}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

/** One sortable unit = leader task + full sequential subtree (nested DnD inside parent only). */
function SortableSeqGroup({
  node,
  cb,
}: {
  node: SeqTreeNode;
  cb: TaskCallbacks;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.task.id! });

  return (
    <div
      ref={setNodeRef}
      className={cn(isDragging && "z-20 rounded-md opacity-90 shadow-lg")}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <SequentialNodeRenderer
        node={node}
        cb={cb}
        dragHandle
        dragProps={{ listeners: listeners ?? {}, attributes }}
      />
    </div>
  );
}

/* ================================================================
   SequentialNodeRenderer — recursive tree renderer (spec §5-7)

   Each sequential child row is a flex container:
     [ConnectorColumn 28px] [Content flex-1]

   The ConnectorColumn has three stacked pieces:
     1. stem-top   (flex-1, connects upward)
     2. → glyph    (shrink-0)
     3. stem-bottom (flex-1 or fixed stub for last sibling)

   Because the Content area includes both the card AND any deeper
   sequential children (recursive), the connector column stretches
   to match the full height, keeping the stem visually continuous
   through all descendants (spec §6 stem-span rule).
   ================================================================ */

function SequentialNodeRenderer({
  node,
  cb,
  dragHandle,
  dragProps,
}: {
  node: SeqTreeNode;
  cb: TaskCallbacks;
  dragHandle?: boolean;
  dragProps?: DragHandleProps;
}) {
  const hasSeqChildren = node.seqChildren.length > 0;
  const collapsed =
    node.task.id != null && cb.collapsedBranches.has(node.task.id);

  function renderNodeCard(
    target: SeqTreeNode,
    rowDragHandle?: boolean,
    rowDragProps?: DragHandleProps
  ) {
    const targetIsParent = target.parentChildren.length > 0;
    const targetHasSeqChildren = target.seqChildren.length > 0;
    return targetIsParent ? (
      <ParentContainer
        task={target.task}
        parentChildren={target.parentChildren}
        cb={cb}
        dragHandle={rowDragHandle}
        dragProps={rowDragProps}
      />
    ) : (
      <LeafCard
        task={target.task}
        cb={cb}
        showCollapseToggle={targetHasSeqChildren}
        dragHandle={rowDragHandle}
        dragProps={rowDragProps}
      />
    );
  }

  function renderSequentialChildren(target: SeqTreeNode) {
    if (
      target.task.id != null &&
      cb.collapsedBranches.has(target.task.id)
    ) {
      return null;
    }
    if (target.seqChildren.length === 0) return null;

    return (
      <div>
        {target.seqChildren.map((child, i) => {
          const isLast = i === target.seqChildren.length - 1;
          return (
            <div key={child.task.id}>
              <div className="flex items-stretch min-h-0">
                <div
                  className="shrink-0 flex flex-col items-center"
                  style={{ width: `${INDENT_PX}px` }}
                >
                  <div className="w-[1.5px] flex-1 min-h-[10px] rounded-full bg-border" />
                  <span className="text-[13px] leading-none text-muted-foreground shrink-0 select-none py-px">
                    →
                  </span>
                  <div
                    className={cn(
                      "w-[1.5px] rounded-full bg-border",
                      isLast ? "h-[10px]" : "flex-1 min-h-[10px]"
                    )}
                  />
                </div>

                <div className="flex-1 min-w-0 py-px">
                  {renderNodeCard(child)}
                </div>
              </div>

              <div className="pl-7">
                {renderSequentialChildren(child)}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      {/* Resolved card component */}
      {renderNodeCard(node, dragHandle, dragProps)}

      {/* Sequential children (spec §5 depth-first, pre-order) */}
      {!collapsed && hasSeqChildren && renderSequentialChildren(node)}
    </div>
  );
}

/* ================================================================
   TaskItem — public entry-point (wraps DnD + tree build)
   ================================================================ */

export interface TaskItemProps {
  task: Task;
  allTasks: Task[];
  customTagColors: Record<string, string>;
  depth: number;
  collapsedBranches: Set<number>;
  onToggleComplete: (task: Task) => void;
  onToggleBranch: (taskId: number) => void;
  onAddSubtask: (parentId: number, bucket: Bucket) => void;
  onAddSequential: (afterTask: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onReorder: (
    parentId: number | null,
    activeId: number,
    overId: number
  ) => void;
}

export function TaskItem({
  task,
  allTasks,
  customTagColors,
  depth,
  collapsedBranches,
  onToggleComplete,
  onToggleBranch,
  onAddSubtask,
  onAddSequential,
  onEdit,
  onDelete,
  onReorder,
}: TaskItemProps) {
  const siblings = getChildren(allTasks, task.parentId ?? null);
  const treeNode = buildSeqTree(task, allTasks, siblings);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id! });

  const cb: TaskCallbacks = {
    allTasks,
    customTagColors,
    depth,
    collapsedBranches,
    onToggleComplete,
    onToggleBranch,
    onAddSubtask,
    onAddSequential,
    onEdit,
    onDelete,
    onReorder,
  };

  return (
    <li
      ref={setNodeRef}
      className={cn(
        "list-none",
        isDragging && "z-10 rounded-lg opacity-80 shadow-lg"
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? undefined,
      }}
    >
      <SequentialNodeRenderer
        node={treeNode}
        cb={cb}
        dragHandle
        dragProps={{ listeners: listeners ?? {}, attributes }}
      />
    </li>
  );
}
