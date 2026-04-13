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
  const titleNode = document.querySelector("#task-title");
  const priorityNode = document.querySelector("#task-priority");
  const estimatedNode = document.querySelector("#task-estimated");
  const typeNode = document.querySelector("#task-type");
  const parentNode = document.querySelector("#task-parent");
  const dependsNode = document.querySelector("#task-depends-on");
  const notesNode = document.querySelector("#task-notes");
  const linkNode = document.querySelector("#task-link");
  const formNode = document.querySelector("#task-form");
  const listNode = document.querySelector("#task-list");
  const emptyNode = document.querySelector("#task-empty-state");
  const summaryNode = document.querySelector("#task-summary");
  const planningWarningNode = document.querySelector("#planning-warning");
  const dateLabelNode = document.querySelector("#today-date-label");
  const editModal = document.querySelector("#task-edit-modal");
  const editForm = document.querySelector("#task-edit-form");
  const editTitleNode = document.querySelector("#task-edit-title");
  const editPriorityNode = document.querySelector("#task-edit-priority");
  const editEstimatedNode = document.querySelector("#task-edit-estimated");
  const editNotesNode = document.querySelector("#task-edit-notes");
  const editLinkNode = document.querySelector("#task-edit-link");
  const editCancelNode = document.querySelector("#task-edit-cancel");
  const timelineNode = document.querySelector("#timeline-view");
  const toggleTimelineBtn = document.querySelector("#toggle-timeline-btn");
  const undoStack = [];

  let tasks = [];
  let editingTaskId = null;
  const unlockedTaskIds = new Set();
  let showTimeline = true;

  dateLabelNode.textContent = formatLongDate(dateKey);

  function setSummary() {
    const complete = tasks.filter((task) => task.status === "done").length;
    const total = tasks.length;
    summaryNode.textContent = `${complete}/${total} completed`;
  }

  function updatePlanningWarning() {
    const totalEstimated = tasks.reduce((sum, task) => sum + Math.max(0, Number(task.estimatedMin) || 0), 0);
    const wakingMinutes = 8 * 60;
    if (totalEstimated > wakingMinutes) {
      planningWarningNode.dataset.visible = "true";
      planningWarningNode.textContent = `You've planned ${minutesToClock(totalEstimated)} for an 8h day.`;
      return;
    }
    planningWarningNode.dataset.visible = "false";
    planningWarningNode.textContent = "";
  }

  function isLocked(task) {
    if (task.type !== "sequential" || !task.dependsOn) return false;
    const dependency = tasks.find((entry) => entry.id === task.dependsOn);
    return dependency ? dependency.status !== "done" : false;
  }

  function updateSelectors() {
    const baseOptions = [`<option value="">None</option>`];
    tasks
      .filter((task) => !task.parentId)
      .forEach((task) => {
        baseOptions.push(`<option value="${task.id}">${task.title}</option>`);
      });
    parentNode.innerHTML = baseOptions.join("");
    dependsNode.innerHTML = baseOptions.join("");
  }

  function openEditModal(task) {
    editingTaskId = task.id;
    editTitleNode.value = task.title;
    editPriorityNode.value = task.priority;
    editEstimatedNode.value = String(task.estimatedMin || 0);
    editNotesNode.value = task.notes || "";
    editLinkNode.value = task.link || "";
    editModal.showModal();
    editTitleNode.focus();
  }

  function render() {
    listNode.innerHTML = "";
    setSummary();
    updatePlanningWarning();
    updateSelectors();
    emptyNode.hidden = tasks.length > 0;

    const topLevelTasks = tasks.filter((task) => !task.parentId);
    topLevelTasks.forEach((task) => {
      const item = document.createElement("li");
      item.className = "task-item";
      item.draggable = true;
      item.dataset.id = String(task.id);
      item.style.borderLeftColor = getPriorityColor(task.priority);
      item.classList.toggle("is-done", task.status === "done");
      const locked = isLocked(task);
      item.classList.toggle("is-locked", locked);
      if (!locked && task.type === "sequential" && !unlockedTaskIds.has(task.id)) {
        unlockedTaskIds.add(task.id);
        item.classList.add("is-unlocked");
      }

      const completeToggle = document.createElement("button");
      completeToggle.type = "button";
      completeToggle.className = "icon-btn";
      completeToggle.setAttribute("aria-label", task.status === "done" ? "Mark task pending" : "Mark task done");
      completeToggle.textContent = task.status === "done" ? "✓" : locked ? "🔒" : "○";
      completeToggle.disabled = locked;
      if (locked) {
        completeToggle.title = `Finish dependency first`;
      }

      const content = document.createElement("div");
      content.className = "task-title-wrap";
      const title = document.createElement("p");
      title.className = "task-title";
      title.textContent = task.title;
      if (task.type === "sequential") {
        const lock = document.createElement("span");
        lock.textContent = locked ? "🔒" : "✓";
        lock.setAttribute("aria-hidden", "true");
        title.prepend(lock);
      }
      const meta = document.createElement("div");
      meta.className = "task-meta";
      const priorityChip = document.createElement("span");
      priorityChip.className = `chip ${getPriorityClass(task.priority)}`;
      priorityChip.textContent = `${task.priority}`;
      meta.append(priorityChip);
      if (task.estimatedMin > 0) {
        const estimated = document.createElement("span");
        estimated.className = "chip mono";
        estimated.textContent = minutesToClock(task.estimatedMin);
        meta.append(estimated);
      }
      content.append(title, meta);

      const actions = document.createElement("div");
      actions.className = "task-actions";
      const editBtn = document.createElement("button");
      editBtn.className = "icon-btn";
      editBtn.type = "button";
      editBtn.setAttribute("aria-label", "Edit task");
      editBtn.textContent = "✎";
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "icon-btn";
      deleteBtn.type = "button";
      deleteBtn.setAttribute("aria-label", "Delete task");
      deleteBtn.textContent = "✕";
      actions.append(editBtn, deleteBtn);

      completeToggle.addEventListener("click", async () => {
        const nextStatus = task.status === "done" ? "pending" : "done";
        const completedAt = nextStatus === "done" ? new Date() : null;
        undoStack.push({
          id: task.id,
          snapshot: { status: task.status, completedAt: task.completedAt || null },
        });
        if (undoStack.length > 10) {
          undoStack.shift();
        }
        const next = await updateTask(task.id, { status: nextStatus, completedAt });
        task.status = next.status;
        task.completedAt = next.completedAt;
        render();
        onTaskMutated?.();
      });

      deleteBtn.addEventListener("click", async () => {
        await deleteTask(task.id);
        tasks = tasks.filter((entry) => entry.id !== task.id);
        render();
        onTaskMutated?.();
      });

      editBtn.addEventListener("click", async () => {
        openEditModal(task);
      });

      item.addEventListener("dragstart", () => {
        item.classList.add("is-dragging");
      });
      item.addEventListener("dragend", () => {
        item.classList.remove("is-dragging");
      });
      item.addEventListener("dragover", (event) => {
        event.preventDefault();
      });
      item.addEventListener("drop", async (event) => {
        event.preventDefault();
        const sourceId = Number(listNode.querySelector(".is-dragging")?.dataset.id);
        const targetId = Number(item.dataset.id);
        if (!sourceId || sourceId === targetId) return;
        const sourceIndex = tasks.findIndex((entry) => entry.id === sourceId);
        const targetIndex = tasks.findIndex((entry) => entry.id === targetId);
        const [moved] = tasks.splice(sourceIndex, 1);
        tasks.splice(targetIndex, 0, moved);
        tasks = tasks.map((entry, index) => ({ ...entry, order: index + 1 }));
        render();
        await bulkUpdateTasks(tasks.map((entry) => ({ id: entry.id, changes: { order: entry.order } })));
      });

      item.append(completeToggle, content, actions);
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

      const subtasks = tasks.filter((entry) => entry.parentId === task.id);
      if (subtasks.length > 0) {
        const subList = document.createElement("ul");
        subList.className = "task-sublist";
        const doneSubs = subtasks.filter((entry) => entry.status === "done").length;
        const progress = document.createElement("li");
        progress.className = "muted mono";
        progress.textContent = `${doneSubs}/${subtasks.length} sub-tasks complete`;
        subList.append(progress);
        subtasks.forEach((subtask) => {
          const sub = document.createElement("li");
          sub.className = "task-item";
          sub.style.borderLeftColor = getPriorityColor(subtask.priority);
          sub.textContent = subtask.title;
          sub.addEventListener("click", async () => {
            const nextStatus = subtask.status === "done" ? "pending" : "done";
            await updateTask(subtask.id, { status: nextStatus, completedAt: nextStatus === "done" ? new Date() : null });
            const fresh = subtasks.filter((entry) => entry.id !== subtask.id).concat([{ ...subtask, status: nextStatus }]);
            const allDone = fresh.every((entry) => entry.status === "done");
            if (allDone) {
              window.setTimeout(async () => {
                await updateTask(task.id, { status: "done", completedAt: new Date() });
                await onTaskMutated?.();
              }, 1200);
            }
            await onTaskMutated?.();
          });
          subList.append(sub);
        });
        item.append(subList);
      }

      listNode.append(item);
    });
    renderTimeline(topLevelTasks);
  }

  function renderTimeline(entries) {
    timelineNode.innerHTML = "";
    if (!showTimeline) {
      timelineNode.hidden = true;
      return;
    }
    timelineNode.hidden = false;
    const total = entries.reduce((sum, task) => sum + Math.max(0, Number(task.estimatedMin) || 0), 0);
    const safeTotal = Math.max(total, 1);
    entries.forEach((task) => {
      const row = document.createElement("article");
      row.className = "timeline-row";
      row.innerHTML = `<p class="mono">${task.title} · ${minutesToClock(task.estimatedMin || 0)}</p>`;
      const track = document.createElement("div");
      track.className = "timeline-track";
      const bar = document.createElement("span");
      bar.style.width = `${Math.round((Math.max(0, Number(task.estimatedMin) || 0) / safeTotal) * 100)}%`;
      track.append(bar);
      row.append(track);
      timelineNode.append(row);
    });
  }

  formNode.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = titleNode.value.trim();
    if (!title) return;
    const created = await createTask({
      date: dateKey,
      title,
      priority: priorityNode.value,
      estimatedMin: Math.max(0, Number(estimatedNode.value) || 0),
      type: typeNode.value,
      parentId: parentNode.value ? Number(parentNode.value) : null,
      dependsOn: dependsNode.value ? Number(dependsNode.value) : null,
      notes: notesNode.value.trim(),
      link: linkNode.value.trim(),
    });
    tasks.push(created);
    tasks = tasks.sort((a, b) => (a.order || 0) - (b.order || 0));
    formNode.reset();
    priorityNode.value = "medium";
    typeNode.value = "standard";
    titleNode.focus();
    render();
    onTaskMutated?.();
  });

  toggleTimelineBtn.addEventListener("click", () => {
    showTimeline = !showTimeline;
    toggleTimelineBtn.textContent = showTimeline ? "Hide Timeline" : "Show Timeline";
    render();
  });

  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!editingTaskId) return;
    const nextTitle = editTitleNode.value.trim();
    if (!nextTitle) return;
    const nextEstimate = Math.max(0, Number(editEstimatedNode.value) || 0);
    const nextPriority = editPriorityNode.value;
    const next = await updateTask(editingTaskId, {
      title: nextTitle,
      priority: nextPriority,
      estimatedMin: nextEstimate,
      notes: editNotesNode.value.trim(),
      link: editLinkNode.value.trim(),
    });
    const target = tasks.find((task) => task.id === editingTaskId);
    if (target) {
      target.title = next.title;
      target.priority = next.priority;
      target.estimatedMin = next.estimatedMin;
      target.notes = next.notes;
      target.link = next.link;
    }
    editingTaskId = null;
    editModal.close();
    render();
  });

  editCancelNode.addEventListener("click", () => {
    editingTaskId = null;
    editModal.close();
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
      await createTask({
        date: dateKey,
        title: templateTask.title,
        priority: templateTask.priority || "medium",
        estimatedMin: templateTask.estimatedMin || 0,
        type: templateTask.type || "standard",
        notes: templateTask.notes || "",
        link: templateTask.link || "",
        templateId,
      });
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
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        const undo = undoStack.pop();
        if (undo) {
          updateTask(undo.id, undo.snapshot).then(() => onTaskMutated?.());
        }
      }
      if (event.key.toLowerCase() === "n" && !event.metaKey && !event.ctrlKey) {
        const targetTag = event.target instanceof HTMLElement ? event.target.tagName : "";
        if (targetTag !== "INPUT" && targetTag !== "TEXTAREA") {
          event.preventDefault();
          titleNode.focus();
        }
      }
      if (event.key.toLowerCase() === "t" && !event.metaKey && !event.ctrlKey) {
        window.location.hash = "#today";
      }
      if (event.key.toLowerCase() === "f" && !event.metaKey && !event.ctrlKey) {
        window.location.hash = "#focus";
      }
      if (event.key.toLowerCase() === "c" && !event.metaKey && !event.ctrlKey) {
        window.location.hash = "#calendar";
      }
    });
  }

  return {
    refresh,
    bindShortcuts,
    getCurrentTasks,
    appendTasksFromTemplate,
  };
}
