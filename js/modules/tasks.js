import { createTask, deleteTask, getTasksByDate, updateTask, bulkUpdateTasks } from "../db.js";
import { formatLongDate, minutesToClock } from "../utils/dates.js";

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

export function createTasksModule({ dateKey, onTaskMutated }) {
  const addBtn = document.querySelector("#task-queue-add-btn");
  const formNode = document.querySelector("#task-form");
  const titleNode = document.querySelector("#task-title");
  const priorityNode = document.querySelector("#task-priority");
  const estimatedNode = document.querySelector("#task-estimated");
  const notesNode = document.querySelector("#task-notes");
  const linkNode = document.querySelector("#task-link");

  const listNode = document.querySelector("#task-list");
  const summaryNode = document.querySelector("#task-summary");
  const dateLabelNode = document.querySelector("#today-date-label");
  const emptyNode = document.querySelector("#task-empty-state");
  const warningNode = document.querySelector("#planning-warning");
  const feedbackNode = document.querySelector("#task-inline-feedback");
  const timelineNode = document.querySelector("#timeline-view");
  const toggleTimelineBtn = document.querySelector("#toggle-timeline-btn");

  const editModal = document.querySelector("#task-edit-modal");
  const editForm = document.querySelector("#task-edit-form");
  const editTitleNode = document.querySelector("#task-edit-title");
  const editPriorityNode = document.querySelector("#task-edit-priority");
  const editEstimatedNode = document.querySelector("#task-edit-estimated");
  const editNotesNode = document.querySelector("#task-edit-notes");
  const editLinkNode = document.querySelector("#task-edit-link");
  const editCancelNode = document.querySelector("#task-edit-cancel");

  const collapsedMap = new Map();
  const undoStack = [];
  let editingTaskId = null;
  let tasks = [];
  let showTimeline = true;
  let createContext = { mode: "root", parentId: null, dependsOn: null, insertAfterId: null };

  dateLabelNode.textContent = formatLongDate(dateKey);

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

  function descendantsProgress(taskId) {
    const ids = descendantIds(taskId);
    if (ids.length === 0) return null;
    const done = ids.filter((id) => taskById(id)?.status === "done").length;
    return { done, total: ids.length };
  }

  function siblingsOf(task) {
    return childrenOf(task.parentId || null);
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
    const siblings = childrenOf(parentId);
    let targetOrder = siblings.length + 1;
    if (options.insertAfterId) {
      const index = siblings.findIndex((task) => task.id === options.insertAfterId);
      targetOrder = index >= 0 ? index + 2 : targetOrder;
    }
    const created = await createTask({
      ...payload,
      parentId,
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

    await normalizeSiblingOrder(parentId);
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
    if (estimated > 8 * 60) {
      warningNode.dataset.visible = "true";
      warningNode.textContent = `You've planned ${minutesToClock(estimated)} for an 8h day.`;
      return;
    }
    warningNode.dataset.visible = "false";
    warningNode.textContent = "";
  }

  function openPopover(context) {
    createContext = context;
    formNode.hidden = false;
    addBtn.setAttribute("aria-expanded", "true");
    titleNode.focus();
  }

  function closePopover() {
    formNode.hidden = true;
    addBtn.setAttribute("aria-expanded", "false");
    createContext = { mode: "root", parentId: null, dependsOn: null, insertAfterId: null };
  }

  function renderTimeline() {
    timelineNode.innerHTML = "";
    if (!showTimeline) {
      timelineNode.hidden = true;
      return;
    }
    timelineNode.hidden = false;
    const top = childrenOf(null);
    const total = top.reduce((sum, task) => sum + (Number(task.estimatedMin) || 0), 0);
    const safe = Math.max(total, 1);
    top.forEach((task) => {
      const row = document.createElement("article");
      row.className = "timeline-row";
      row.innerHTML = `<p class="mono">${task.title} · ${minutesToClock(task.estimatedMin || 0)}</p>`;
      const track = document.createElement("div");
      track.className = "timeline-track";
      const fill = document.createElement("span");
      fill.style.width = `${Math.round(((task.estimatedMin || 0) / safe) * 100)}%`;
      track.append(fill);
      row.append(track);
      timelineNode.append(row);
    });
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

  function renderBranch(task, depth = 0) {
    const item = document.createElement("li");
    const locked = isLocked(task);
    item.className = "task-item";
    item.dataset.depth = String(Math.min(depth, 3));
    item.style.marginLeft = `${depth * 16}px`;
    item.style.borderLeftColor = getPriorityColor(task.priority);
    item.classList.toggle("is-done", task.status === "done");
    item.classList.toggle("is-locked", locked);

    const children = childrenOf(task.id);
    const hasChildren = children.length > 0;
    if (hasChildren && !collapsedMap.has(task.id)) {
      collapsedMap.set(task.id, true);
    }
    const collapsed = collapsedMap.get(task.id) ?? false;

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "icon-btn branch-toggle";
    toggleBtn.setAttribute("aria-label", hasChildren ? "Toggle sub-tasks" : "Task status");
    toggleBtn.textContent = hasChildren ? (collapsed ? ">" : "v") : task.status === "done" ? "✓" : locked ? "🔒" : "○";
    if (hasChildren) {
      toggleBtn.addEventListener("click", () => {
        collapsedMap.set(task.id, !collapsed);
        render();
      });
    } else {
      toggleBtn.disabled = locked;
      toggleBtn.addEventListener("click", async () => {
        undoStack.push({ id: task.id, snapshot: { status: task.status, completedAt: task.completedAt || null } });
        if (undoStack.length > 10) undoStack.shift();
        const nextStatus = task.status === "done" ? "pending" : "done";
        await updateTask(task.id, { status: nextStatus, completedAt: nextStatus === "done" ? new Date() : null });
        await refresh();
        await syncAncestorCompletion(task.parentId || null);
        await refresh();
        onTaskMutated?.();
      });
    }

    const content = document.createElement("div");
    content.className = "task-title-wrap";
    const title = document.createElement("p");
    title.className = "task-title";
    title.textContent = task.title;

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
    content.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const addSub = document.createElement("button");
    addSub.type = "button";
    addSub.className = "icon-btn";
    addSub.setAttribute("aria-label", "Add sub-task");
    addSub.textContent = "Sub";
    addSub.addEventListener("click", (event) => {
      event.stopPropagation();
      openPopover({ mode: "subtask", parentId: task.id, dependsOn: null, insertAfterId: null });
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
      });
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

    item.append(toggleBtn, content, actions);

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

    listNode.append(item);

    if (hasChildren && !collapsed) {
      children.forEach((child) => renderBranch(child, depth + 1));
    }
  }

  function render() {
    listNode.innerHTML = "";
    clearFeedback();
    setSummary();
    setWarning();
    emptyNode.hidden = tasks.length > 0;

    childrenOf(null).forEach((task) => renderBranch(task, 0));
    renderTimeline();
  }

  formNode.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = titleNode.value.trim();
    if (!title) return;

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

  addBtn.addEventListener("click", () => {
    if (!formNode.hidden) {
      closePopover();
      return;
    }
    openPopover({ mode: "root", parentId: null, dependsOn: null, insertAfterId: null });
  });

  document.addEventListener("click", (event) => {
    if (formNode.hidden) return;
    if (formNode.contains(event.target) || addBtn.contains(event.target)) return;
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

  toggleTimelineBtn.addEventListener("click", () => {
    showTimeline = !showTimeline;
    toggleTimelineBtn.textContent = showTimeline ? "Hide Timeline" : "Show Timeline";
    renderTimeline();
  });

  async function refresh() {
    tasks = await getTasksByDate(dateKey);
    render();
  }

  function getCurrentTasks() {
    return tasks.map((task) => ({ ...task }));
  }

  async function appendTasksFromTemplate(templateTasks, templateId) {
    for (const templateTask of templateTasks) {
      await insertTask(
        {
          title: templateTask.title,
          priority: templateTask.priority || "medium",
          estimatedMin: templateTask.estimatedMin || 0,
          notes: templateTask.notes || "",
          link: templateTask.link || "",
          type: templateTask.type || "standard",
          templateId,
        },
        { parentId: null, dependsOn: null, insertAfterId: null },
      );
    }
    await refresh();
  }

  function bindShortcuts() {
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (editModal.open) {
          editModal.close();
          editingTaskId = null;
        }
        if (!formNode.hidden) closePopover();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        const undo = undoStack.pop();
        if (undo) updateTask(undo.id, undo.snapshot).then(() => refresh());
      }
      if (event.key.toLowerCase() === "n" && !event.metaKey && !event.ctrlKey) {
        const tag = event.target instanceof HTMLElement ? event.target.tagName : "";
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
          event.preventDefault();
          openPopover({ mode: "root", parentId: null, dependsOn: null, insertAfterId: null });
        }
      }
      if (event.key.toLowerCase() === "t" && !event.metaKey && !event.ctrlKey) window.location.href = "./tasks.html";
      if (event.key.toLowerCase() === "f" && !event.metaKey && !event.ctrlKey) window.location.href = "./focus.html";
      if (event.key.toLowerCase() === "c" && !event.metaKey && !event.ctrlKey) window.location.href = "./calendar.html";
    });
  }

  return {
    refresh,
    bindShortcuts,
    getCurrentTasks,
    appendTasksFromTemplate,
  };
}
