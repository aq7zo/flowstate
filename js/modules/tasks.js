import { createTask, deleteTask, getTasksByDate, updateTask, bulkUpdateTasks } from "../db.js";
import { formatLongDate, minutesToClock } from "../utils/dates.js";

const BUCKETS = ["today", "tomorrow", "upcoming"];
const MAX_DEPTH = 3;
const BUCKET_LABEL = {
  today: "Today",
  tomorrow: "Tomorrow",
  upcoming: "Upcoming",
};

function getPriorityClass(priority) {
  if (priority === "high") return "priority-high";
  if (priority === "low") return "priority-low";
  return "priority-medium";
}

function getPriorityColor(priority) {
  if (priority === "high") return "var(--priority-high)";
  if (priority === "low") return "var(--priority-low)";
  return "var(--priority-medium)";
}

function normalizeBucket(bucket) {
  return BUCKETS.includes(bucket) ? bucket : "today";
}

export function createTasksModule({ dateKey, quotaMinutes: rawQuota, onTaskMutated }) {
  const quotaMinutes = rawQuota || 480;
  const formNode = document.querySelector("#task-form");
  const titleNode = document.querySelector("#task-title");
  const priorityNode = document.querySelector("#task-priority");
  const estimatedNode = document.querySelector("#task-estimated");
  const notesNode = document.querySelector("#task-notes");
  const linkNode = document.querySelector("#task-link");

  const listNodeByBucket = {
    today: document.querySelector("#task-list-today"),
    tomorrow: document.querySelector("#task-list-tomorrow"),
    upcoming: document.querySelector("#task-list-upcoming"),
  };
  const bucketToggleNodes = Array.from(document.querySelectorAll("[data-bucket-toggle]"));
  const bucketAddNodes = Array.from(document.querySelectorAll("[data-bucket-add]"));
  const bucketCountNodes = Array.from(document.querySelectorAll("[data-bucket-count]"));

  const summaryNode = document.querySelector("#task-summary");
  const dateLabelNode = document.querySelector("#today-date-label");
  const warningNode = document.querySelector("#planning-warning");
  const feedbackNode = document.querySelector("#task-inline-feedback");
  const allocationView = document.querySelector("#allocation-view");
  const allocationBar = document.querySelector("#allocation-bar");
  const allocationContainer = document.querySelector(".allocation-container");
  const quotaMarkerEl = document.querySelector("#allocation-quota-marker");
  const quotaLabelEl = document.querySelector("#allocation-quota-label");
  const allocationLegend = document.querySelector("#allocation-legend");
  const toggleAllocationBtn = document.querySelector("#toggle-allocation-btn");

  const editModal = document.querySelector("#task-edit-modal");
  const editForm = document.querySelector("#task-edit-form");
  const editTitleNode = document.querySelector("#task-edit-title");
  const editPriorityNode = document.querySelector("#task-edit-priority");
  const editEstimatedNode = document.querySelector("#task-edit-estimated");
  const editNotesNode = document.querySelector("#task-edit-notes");
  const editLinkNode = document.querySelector("#task-edit-link");
  const editCancelNode = document.querySelector("#task-edit-cancel");
  const creationPanelNode = document.querySelector(".creation-panel");
  const appMainNode = document.querySelector(".app-main");

  const collapsedMap = new Map();
  const collapsedBuckets = new Map([
    ["today", false],
    ["tomorrow", true],
    ["upcoming", true],
  ]);
  const undoStack = [];
  let editingTaskId = null;
  let tasks = [];
  let showTimeline = true;
  let createContext = { mode: "root", parentId: null, dependsOn: null, insertAfterId: null, bucket: "today" };

  if (dateLabelNode) dateLabelNode.textContent = formatLongDate(dateKey);

  function taskById(id) {
    return tasks.find((task) => task.id === id) || null;
  }

  function childrenOf(parentId) {
    return tasks
      .filter((task) => (task.parentId || null) === (parentId || null))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  function descendantIds(id) {
    const ids = [];
    const queue = [id];
    while (queue.length > 0) {
      const current = queue.shift();
      const children = childrenOf(current);
      children.forEach((child) => {
        ids.push(child.id);
        queue.push(child.id);
      });
    }
    return ids;
  }

  function getDepth(taskId) {
    let depth = 0;
    let current = taskById(taskId);
    while (current?.parentId) {
      depth++;
      current = taskById(current.parentId);
    }
    return depth;
  }

  function descendantsProgress(taskId) {
    const ids = descendantIds(taskId);
    if (ids.length === 0) return null;
    const done = ids.filter((id) => taskById(id)?.status === "done").length;
    return { done, total: ids.length };
  }

  function isLocked(task) {
    if (task.type !== "sequential" || !task.dependsOn) return false;
    const dependency = taskById(task.dependsOn);
    if (!dependency) return false;
    return dependency.status !== "done";
  }

  function showFeedback(message, tone = "danger") {
    feedbackNode.dataset.visible = "true";
    feedbackNode.dataset.tone = tone;
    feedbackNode.textContent = message;
  }

  function clearFeedback() {
    feedbackNode.dataset.visible = "false";
    feedbackNode.textContent = "";
  }

  function validateDependency(parentId, dependsOn) {
    if (!dependsOn) return { valid: true };
    const dependency = taskById(dependsOn);
    if (!dependency) {
      return { valid: false, message: "Dependency task not found." };
    }
    if ((dependency.parentId || null) !== (parentId || null)) {
      return { valid: false, message: "Sequential dependencies must stay within same-level siblings." };
    }
    return { valid: true };
  }

  async function normalizeSiblingOrder(parentId) {
    const siblings = childrenOf(parentId);
    const updates = siblings.map((task, index) => ({
      id: task.id,
      changes: { order: index + 1 },
    }));
    if (updates.length > 0) {
      await bulkUpdateTasks(updates);
    }
  }

  async function insertTask(payload, options) {
    const parentId = options.parentId || null;
    const parentTask = parentId ? taskById(parentId) : null;
    const bucket = normalizeBucket(parentTask?.bucket || options.bucket || "today");
    const siblings = childrenOf(parentId);
    let targetOrder = siblings.length + 1;
    if (options.insertAfterId) {
      const index = siblings.findIndex((task) => task.id === options.insertAfterId);
      targetOrder = index >= 0 ? index + 2 : targetOrder;
    }

    const created = await createTask({
      ...payload,
      parentId,
      bucket,
      dependsOn: options.dependsOn || null,
      type: payload.type || "standard",
      date: dateKey,
    });
    await updateTask(created.id, { order: targetOrder });

    const shifted = siblings
      .filter((task) => (task.order || 0) >= targetOrder)
      .map((task) => ({ id: task.id, changes: { order: (task.order || 0) + 1 } }));
    if (shifted.length > 0) {
      await bulkUpdateTasks(shifted);
    }

    await refresh();
    return created;
  }

  async function syncAncestorCompletion(fromParentId) {
    let currentParentId = fromParentId || null;
    while (currentParentId) {
      const parent = taskById(currentParentId);
      if (!parent) break;
      const descendant = descendantIds(parent.id);
      if (descendant.length > 0) {
        const allDone = descendant.every((id) => taskById(id)?.status === "done");
        await updateTask(parent.id, {
          status: allDone ? "done" : "pending",
          completedAt: allDone ? new Date() : null,
        });
      }
      currentParentId = parent.parentId || null;
    }
  }

  function setSummary() {
    const total = tasks.length;
    const done = tasks.filter((task) => task.status === "done").length;
    summaryNode.textContent = `${done}/${total} completed`;
  }

  function setWarning() {
    const estimated = tasks.reduce((sum, task) => sum + (Number(task.estimatedMin) || 0), 0);
    if (estimated > quotaMinutes) {
      warningNode.dataset.visible = "true";
      warningNode.textContent = `You've planned ${minutesToClock(estimated)} against a ${minutesToClock(quotaMinutes)} quota.`;
      return;
    }
    warningNode.dataset.visible = "false";
    warningNode.textContent = "";
  }

  function openPopover(context) {
    createContext = {
      ...createContext,
      ...context,
      bucket: normalizeBucket(context.bucket || "today"),
    };
    creationPanelNode.classList.add("is-open");
    appMainNode.classList.add("has-creation-panel");
    titleNode.focus();
  }

  function closePopover() {
    creationPanelNode.classList.remove("is-open");
    appMainNode.classList.remove("has-creation-panel");
    createContext = { mode: "root", parentId: null, dependsOn: null, insertAfterId: null, bucket: "today" };
  }

  function setBucketExpanded(bucket, expanded) {
    collapsedBuckets.set(bucket, !expanded);
    const targetNode = listNodeByBucket[bucket];
    if (targetNode) targetNode.hidden = !expanded;
    const toggle = bucketToggleNodes.find((node) => node.dataset.bucketToggle === bucket);
    if (toggle) {
      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.textContent = `${BUCKET_LABEL[bucket]} ${expanded ? "[-]" : "[+]"}`;
    }
  }

  function setBucketCount(bucket, count) {
    const node = bucketCountNodes.find((entry) => entry.dataset.bucketCount === bucket);
    if (!node) return;
    node.hidden = count <= 0;
    node.textContent = String(count);
  }

  function expandBucket(bucket) {
    setBucketExpanded(normalizeBucket(bucket), true);
  }

  function renderAllocationBar() {
    if (!allocationView) return;
    if (!showTimeline) {
      allocationView.hidden = true;
      return;
    }
    allocationView.hidden = false;

    const todayRoots = childrenOf(null).filter((t) => normalizeBucket(t.bucket) === "today");
    const timedTasks = todayRoots.filter((t) => (Number(t.estimatedMin) || 0) > 0);
    const totalMinutes = timedTasks.reduce((sum, t) => sum + (Number(t.estimatedMin) || 0), 0);

    let state = "healthy";
    if (totalMinutes > 1440) state = "impossible";
    else if (totalMinutes > quotaMinutes) state = "over-quota";

    allocationBar.dataset.state = state;
    allocationContainer.dataset.state = state;

    const barPercent = totalMinutes > 0 ? Math.min((totalMinutes / 1440) * 100, 101) : 0;
    allocationBar.style.width = barPercent > 0 ? `${barPercent}%` : "0";

    allocationBar.innerHTML = "";
    timedTasks.forEach((task) => {
      const seg = document.createElement("div");
      seg.className = "alloc-segment";
      if (task.status === "done") seg.classList.add("is-done");
      const segPercent = totalMinutes > 0 ? (task.estimatedMin / totalMinutes) * 100 : 0;
      seg.style.flex = `0 0 ${segPercent}%`;
      seg.title = `${task.title} · ${minutesToClock(task.estimatedMin)}`;
      allocationBar.append(seg);
    });

    const quotaPercent = (quotaMinutes / 1440) * 100;
    quotaMarkerEl.style.left = `${quotaPercent}%`;
    quotaLabelEl.textContent = minutesToClock(quotaMinutes);

    const allocStr = minutesToClock(totalMinutes);
    const quotaStr = minutesToClock(quotaMinutes);
    let stateLabel = "Within capacity.";
    if (state === "over-quota") stateLabel = "Exceeding your daily goal.";
    if (state === "impossible") stateLabel = "Exceeding physical limits of a 24h day.";
    allocationLegend.textContent = `Allocated: ${allocStr} / 24h (Quota: ${quotaStr}) \u2014 ${stateLabel}`;
    allocationLegend.dataset.state = state;
  }

  function openEditModal(task) {
    editingTaskId = task.id;
    editTitleNode.value = task.title;
    editPriorityNode.value = task.priority;
    editEstimatedNode.value = String(task.estimatedMin || 0);
    editNotesNode.value = task.notes || "";
    editLinkNode.value = task.link || "";
    editModal.showModal();
  }

  async function toggleTaskCompletion(task) {
    if (isLocked(task)) return;
    const nextStatus = task.status === "done" ? "pending" : "done";
    const targetIds = [task.id, ...descendantIds(task.id)];
    const completedAt = nextStatus === "done" ? new Date() : null;
    undoStack.push({
      id: task.id,
      snapshot: { status: task.status, completedAt: task.completedAt || null },
    });
    if (undoStack.length > 10) undoStack.shift();

    await bulkUpdateTasks(
      targetIds.map((id) => ({
        id,
        changes: { status: nextStatus, completedAt },
      })),
    );
    await refresh();
    await syncAncestorCompletion(task.parentId || null);
    await refresh();
    onTaskMutated?.();
  }

  function renderBranch(task, mountNode, depth = 0) {
    const item = document.createElement("li");
    const locked = isLocked(task);
    item.className = "task-item";
    item.dataset.depth = String(Math.min(depth, 3));
    item.style.borderLeftColor = getPriorityColor(task.priority);
    item.classList.toggle("is-done", task.status === "done");
    item.classList.toggle("is-locked", locked);

    const children = childrenOf(task.id);
    const hasChildren = children.length > 0;
    if (hasChildren && !collapsedMap.has(task.id)) {
      collapsedMap.set(task.id, false);
    }
    const collapsed = collapsedMap.get(task.id) ?? false;

    const completeBtn = document.createElement("button");
    completeBtn.type = "button";
    completeBtn.className = "task-check-btn";
    completeBtn.setAttribute("aria-label", task.status === "done" ? "Mark task pending" : "Mark task done");
    completeBtn.textContent = "✓";
    completeBtn.disabled = locked;
    completeBtn.addEventListener("click", () => toggleTaskCompletion(task));

    const content = document.createElement("div");
    content.className = "task-title-wrap";

    const titleRow = document.createElement("div");
    titleRow.className = "task-title-row";
    if (hasChildren) {
      const branchToggle = document.createElement("button");
      branchToggle.type = "button";
      branchToggle.className = "icon-btn branch-toggle";
      branchToggle.setAttribute("aria-label", "Toggle sub-tasks");
      branchToggle.textContent = collapsed ? ">" : "v";
      branchToggle.addEventListener("click", () => {
        collapsedMap.set(task.id, !collapsed);
        render();
      });
      titleRow.append(branchToggle);
    }
    const title = document.createElement("p");
    title.className = "task-title";
    title.textContent = task.title;
    titleRow.append(title);

    const meta = document.createElement("div");
    meta.className = "task-meta";
    const priority = document.createElement("span");
    priority.className = `chip ${getPriorityClass(task.priority)}`;
    priority.textContent = task.priority;
    meta.append(priority);
    if (task.estimatedMin > 0) {
      const estimate = document.createElement("span");
      estimate.className = "chip mono";
      estimate.textContent = minutesToClock(task.estimatedMin);
      meta.append(estimate);
    }
    if (task.type === "sequential") {
      const seq = document.createElement("span");
      seq.className = "chip mono";
      seq.textContent = locked ? "locked" : "sequential";
      meta.append(seq);
    }
    if (hasChildren && collapsed) {
      const progress = descendantsProgress(task.id);
      if (progress) {
        const chip = document.createElement("span");
        chip.className = "chip mono";
        chip.textContent = `${progress.done}/${progress.total}`;
        meta.append(chip);
      }
    }
    content.append(titleRow, meta);

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const addSub = document.createElement("button");
    addSub.type = "button";
    addSub.className = "icon-btn";
    addSub.setAttribute("aria-label", "Add sub-task");
    addSub.textContent = "Sub";
    const taskDepth = depth;
    if (taskDepth >= MAX_DEPTH) {
      addSub.disabled = true;
      addSub.title = `Cannot nest deeper than ${MAX_DEPTH} levels`;
    }
    addSub.addEventListener("click", (event) => {
      event.stopPropagation();
      if (taskDepth >= MAX_DEPTH) return;
      openPopover({
        mode: "subtask",
        parentId: task.id,
        dependsOn: null,
        insertAfterId: null,
        bucket: normalizeBucket(task.bucket),
      });
      expandBucket(normalizeBucket(task.bucket));
    });

    const addSeq = document.createElement("button");
    addSeq.type = "button";
    addSeq.className = "icon-btn";
    addSeq.setAttribute("aria-label", "Add sequential task");
    addSeq.textContent = "Seq";
    addSeq.addEventListener("click", (event) => {
      event.stopPropagation();
      openPopover({
        mode: "sequential",
        parentId: task.parentId || null,
        dependsOn: task.id,
        insertAfterId: task.id,
        bucket: normalizeBucket(task.bucket),
      });
      expandBucket(normalizeBucket(task.bucket));
    });

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "icon-btn";
    edit.setAttribute("aria-label", "Edit task");
    edit.textContent = "✎";
    edit.addEventListener("click", () => openEditModal(task));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-btn";
    remove.setAttribute("aria-label", "Delete task");
    remove.textContent = "✕";
    remove.addEventListener("click", async () => {
      const removeIds = [task.id, ...descendantIds(task.id)];
      for (const id of removeIds) {
        await deleteTask(id);
      }
      await refresh();
      onTaskMutated?.();
    });

    actions.append(addSub, addSeq, edit, remove);
    item.append(completeBtn, content, actions);

    if (task.notes || task.link) {
      const details = document.createElement("div");
      details.className = "task-details";
      if (task.notes) {
        const notes = document.createElement("p");
        notes.textContent = task.notes;
        details.append(notes);
      }
      if (task.link) {
        const link = document.createElement("a");
        link.className = "task-link";
        link.href = task.link;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = task.link;
        details.append(link);
      }
      item.append(details);
    }

    mountNode.append(item);
    if (hasChildren && !collapsed) {
      children.forEach((child) => renderBranch(child, mountNode, depth + 1));
    }
  }

  function renderBucket(bucket) {
    const listNode = listNodeByBucket[bucket];
    if (!listNode) return;
    listNode.innerHTML = "";
    const roots = childrenOf(null).filter((task) => normalizeBucket(task.bucket) === bucket);
    setBucketCount(bucket, roots.length);
    if (roots.length === 0) {
      const empty = document.createElement("li");
      empty.className = "bucket-empty";
      empty.textContent = "No tasks yet.";
      listNode.append(empty);
      return;
    }
    roots.forEach((task) => renderBranch(task, listNode, 0));
  }

  function render() {
    clearFeedback();
    setSummary();
    setWarning();
    BUCKETS.forEach((bucket) => {
      setBucketExpanded(bucket, !collapsedBuckets.get(bucket));
      renderBucket(bucket);
    });
    renderAllocationBar();
  }

  formNode.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = titleNode.value.trim();
    if (!title) return;

    if (createContext.parentId) {
      const parentDepth = getDepth(createContext.parentId);
      if (parentDepth >= MAX_DEPTH) {
        showFeedback(`Cannot nest deeper than ${MAX_DEPTH} levels.`, "danger");
        return;
      }
    }

    const dependencyCheck = validateDependency(createContext.parentId, createContext.dependsOn);
    if (!dependencyCheck.valid) {
      showFeedback(dependencyCheck.message, "danger");
      return;
    }

    await insertTask(
      {
        title,
        priority: priorityNode.value,
        estimatedMin: Math.max(0, Number(estimatedNode.value) || 0),
        notes: notesNode.value.trim(),
        link: linkNode.value.trim(),
        type: createContext.mode === "sequential" ? "sequential" : "standard",
        bucket: createContext.bucket,
      },
      createContext,
    );

    formNode.reset();
    priorityNode.value = "medium";
    if (createContext.mode === "root") {
      titleNode.focus();
    } else {
      closePopover();
    }
    onTaskMutated?.();
  });

  bucketAddNodes.forEach((button) => {
    button.addEventListener("click", () => {
      const bucket = normalizeBucket(button.dataset.bucketAdd || "today");
      expandBucket(bucket);
      if (creationPanelNode.classList.contains("is-open") && createContext.mode === "root" && createContext.bucket === bucket) {
        closePopover();
        return;
      }
      openPopover({ mode: "root", parentId: null, dependsOn: null, insertAfterId: null, bucket });
    });
  });

  bucketToggleNodes.forEach((button) => {
    button.addEventListener("click", () => {
      const bucket = normalizeBucket(button.dataset.bucketToggle || "today");
      const currentlyExpanded = !collapsedBuckets.get(bucket);
      setBucketExpanded(bucket, !currentlyExpanded);
    });
  });

  document.addEventListener("click", (event) => {
    if (!creationPanelNode.classList.contains("is-open")) return;
    if (creationPanelNode.contains(event.target)) return;
    const clickPath = typeof event.composedPath === "function" ? event.composedPath() : [];
    const clickedBucketAdd = clickPath.some(
      (node) => node instanceof HTMLElement && node.hasAttribute("data-bucket-add"),
    );
    if (clickedBucketAdd) return;
    const clickedTaskAction = clickPath.some(
      (node) => node instanceof HTMLElement && (node.getAttribute("aria-label") === "Add sub-task" || node.getAttribute("aria-label") === "Add sequential task"),
    );
    if (clickedTaskAction) return;
    closePopover();
  });

  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!editingTaskId) return;
    const nextTitle = editTitleNode.value.trim();
    if (!nextTitle) return;
    await updateTask(editingTaskId, {
      title: nextTitle,
      priority: editPriorityNode.value,
      estimatedMin: Math.max(0, Number(editEstimatedNode.value) || 0),
      notes: editNotesNode.value.trim(),
      link: editLinkNode.value.trim(),
    });
    editingTaskId = null;
    editModal.close();
    await refresh();
    onTaskMutated?.();
  });

  editCancelNode.addEventListener("click", () => {
    editingTaskId = null;
    editModal.close();
  });

  toggleAllocationBtn.addEventListener("click", () => {
    showTimeline = !showTimeline;
    toggleAllocationBtn.textContent = showTimeline ? "Hide" : "Show";
    renderAllocationBar();
  });

  async function refresh() {
    tasks = await getTasksByDate(dateKey);
    render();
  }

  function isFieldFocused() {
    const tag = document.activeElement?.tagName ?? "";
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      document.activeElement?.isContentEditable
    );
  }

  function bindShortcuts() {
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (editModal.open) {
          editModal.close();
          editingTaskId = null;
        }
        if (creationPanelNode.classList.contains("is-open")) closePopover();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        if (isFieldFocused()) return;
        const undo = undoStack.pop();
        if (undo) updateTask(undo.id, undo.snapshot).then(() => refresh());
      }
      if (event.key.toLowerCase() === "n" && !event.metaKey && !event.ctrlKey) {
        if (!isFieldFocused()) {
          event.preventDefault();
          openBucketComposer("today");
        }
      }
      if (event.key.toLowerCase() === "t" && !event.metaKey && !event.ctrlKey) {
        if (!isFieldFocused()) window.location.href = "./tasks.html";
      }
      if (event.key.toLowerCase() === "f" && !event.metaKey && !event.ctrlKey) {
        if (!isFieldFocused()) window.location.href = "./focus.html";
      }
      if (event.key.toLowerCase() === "c" && !event.metaKey && !event.ctrlKey) {
        if (!isFieldFocused()) window.location.href = "./calendar.html";
      }
    });
  }

  function openBucketComposer(bucket) {
    const normalized = normalizeBucket(bucket);
    expandBucket(normalized);
    openPopover({
      mode: "root",
      parentId: null,
      dependsOn: null,
      insertAfterId: null,
      bucket: normalized,
    });
  }

  return {
    refresh,
    bindShortcuts,
    expandBucket,
    openBucketComposer,
  };
}
