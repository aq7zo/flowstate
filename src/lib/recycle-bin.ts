import type { Task } from "@/types";

export interface DeletedTaskNode {
  task: Task & { id: number };
  children: DeletedTaskNode[];
  relation: "root" | "subtask" | "sequential";
}

export interface DeletedTaskTree {
  roots: DeletedTaskNode[];
  byId: Map<number, DeletedTaskNode>;
  depthById: Map<number, number>;
}

function sortTasks(a: Task, b: Task): number {
  const orderDelta = (a.order || 0) - (b.order || 0);
  if (orderDelta !== 0) return orderDelta;
  const deletedDelta =
    (b.deletedAt?.getTime() || 0) - (a.deletedAt?.getTime() || 0);
  if (deletedDelta !== 0) return deletedDelta;
  return a.title.localeCompare(b.title);
}

function buildAdjacency(tasks: Task[]): {
  childrenByParent: Map<number, number[]>;
  followersByDependsOn: Map<number, number[]>;
} {
  const childrenByParent = new Map<number, number[]>();
  const followersByDependsOn = new Map<number, number[]>();

  for (const task of tasks) {
    if (task.id == null) continue;
    if (task.parentId != null) {
      const next = childrenByParent.get(task.parentId) ?? [];
      next.push(task.id);
      childrenByParent.set(task.parentId, next);
    }
    if (task.type === "sequential" && task.dependsOn != null) {
      const next = followersByDependsOn.get(task.dependsOn) ?? [];
      next.push(task.id);
      followersByDependsOn.set(task.dependsOn, next);
    }
  }

  return { childrenByParent, followersByDependsOn };
}

export function collectCascadeIds(tasks: Task[], seedIds: number[]): number[] {
  const byId = new Map(tasks.map((task) => [task.id, task] as const));
  const { childrenByParent, followersByDependsOn } = buildAdjacency(tasks);
  const seen = new Set<number>();
  const queue = [...seedIds];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id) || !byId.get(id)) continue;
    seen.add(id);
    for (const childId of childrenByParent.get(id) ?? []) {
      if (!seen.has(childId)) queue.push(childId);
    }
    for (const followerId of followersByDependsOn.get(id) ?? []) {
      if (!seen.has(followerId)) queue.push(followerId);
    }
  }

  return Array.from(seen);
}

export function buildDeletedTaskTree(deletedTasks: Task[]): DeletedTaskTree {
  const normalized = deletedTasks
    .filter((task): task is Task & { id: number } => task.id != null)
    .sort(sortTasks);
  const deletedById = new Map(
    normalized.map((task) => [task.id, task] as const)
  );
  const nodeById = new Map<number, DeletedTaskNode>();
  for (const task of normalized) {
    nodeById.set(task.id, { task, children: [], relation: "root" });
  }

  const roots: DeletedTaskNode[] = [];
  for (const task of normalized) {
    const node = nodeById.get(task.id)!;
    const sequentialParent =
      task.type === "sequential" && task.dependsOn != null
        ? nodeById.get(task.dependsOn)
        : undefined;
    if (sequentialParent) {
      node.relation = "sequential";
      sequentialParent.children.push(node);
      continue;
    }

    const parent = task.parentId != null ? nodeById.get(task.parentId) : undefined;
    if (parent) {
      node.relation = "subtask";
      parent.children.push(node);
      continue;
    }

    roots.push(node);
  }

  const depthById = new Map<number, number>();
  function walk(nodes: DeletedTaskNode[], depth: number) {
    for (const node of nodes.sort((a, b) => sortTasks(a.task, b.task))) {
      depthById.set(node.task.id, depth);
      walk(node.children, depth + 1);
    }
  }
  walk(roots, 0);

  return { roots, byId: nodeById, depthById };
}

export function collectRestoreViolations(
  selectedIds: Set<number>,
  deletedTasks: Task[]
): string[] {
  const deletedById = new Map(
    deletedTasks
      .filter((task): task is Task & { id: number } => task.id != null)
      .map((task) => [task.id, task] as const)
  );
  const violations: string[] = [];

  for (const id of selectedIds) {
    const task = deletedById.get(id);
    if (!task) continue;

    let parentId = task.parentId;
    while (parentId != null) {
      const parent = deletedById.get(parentId);
      if (!parent) break;
      if (!selectedIds.has(parentId)) {
        violations.push(
          `"${task.title}" requires parent "${parent.title}" to be restored too.`
        );
        break;
      }
      parentId = parent.parentId;
    }

    let dependencyId = task.dependsOn;
    while (dependencyId != null) {
      const dependency = deletedById.get(dependencyId);
      if (!dependency) break;
      if (!selectedIds.has(dependencyId)) {
        violations.push(
          `"${task.title}" requires sequential predecessor "${dependency.title}" to be restored too.`
        );
        break;
      }
      dependencyId = dependency.dependsOn;
    }
  }

  return Array.from(new Set(violations));
}
