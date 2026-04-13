import { bulkUpdateTasks, getUnfinishedTasksByDate } from "../db.js";
import { yesterdayKey } from "../utils/dates.js";

function priorityColor(priority) {
  if (priority === "high") return "var(--priority-high)";
  if (priority === "low") return "var(--priority-low)";
  return "var(--priority-medium)";
}

export function createCarryoverModule({ todayKey, carryOverThreshold = 1, onMutated }) {
  const modal = document.querySelector("#carryover-modal");
  const copyNode = document.querySelector("#carryover-copy");
  const listNode = document.querySelector("#carryover-list");
  const moveAllBtn = document.querySelector("#carryover-move-all");
  const dismissAllBtn = document.querySelector("#carryover-dismiss-all");
  const closeBtn = document.querySelector("#carryover-close");

  let pendingTasks = [];

  function closeModal() {
    if (modal.open) {
      modal.close();
    }
  }

  closeBtn.addEventListener("click", closeModal);

  async function applyChanges(nextStatus, nextDate = null, taskIds = null) {
    const targets = taskIds ? pendingTasks.filter((task) => taskIds.includes(task.id)) : pendingTasks;
    if (targets.length === 0) return;
    const updates = targets.map((task) => ({
      id: task.id,
      changes: {
        status: nextStatus,
        date: nextDate || task.date,
        completedAt: null,
      },
    }));
    await bulkUpdateTasks(updates);
    pendingTasks = pendingTasks.filter((task) => !targets.some((target) => target.id === task.id));
    renderList();
    if (pendingTasks.length === 0) {
      closeModal();
    }
    await onMutated?.();
  }

  function createRow(task) {
    const li = document.createElement("li");
    li.className = "carryover-item";
    li.style.borderLeftColor = priorityColor(task.priority);

    const title = document.createElement("span");
    title.textContent = task.title;

    const moveBtn = document.createElement("button");
    moveBtn.type = "button";
    moveBtn.className = "btn btn-secondary";
    moveBtn.textContent = "Move to Today";
    moveBtn.addEventListener("click", () => applyChanges("pending", todayKey, [task.id]));

    const dismissBtn = document.createElement("button");
    dismissBtn.type = "button";
    dismissBtn.className = "btn btn-ghost";
    dismissBtn.textContent = "Dismiss";
    dismissBtn.addEventListener("click", () => applyChanges("carried", task.date, [task.id]));

    li.append(title, moveBtn, dismissBtn);
    return li;
  }

  function renderList() {
    listNode.innerHTML = "";
    copyNode.textContent = `You left ${pendingTasks.length} tasks unfinished yesterday.`;
    pendingTasks.forEach((task) => listNode.append(createRow(task)));
  }

  moveAllBtn.addEventListener("click", () => applyChanges("pending", todayKey));
  dismissAllBtn.addEventListener("click", () => applyChanges("carried"));

  async function openIfNeeded(lastSessionDate) {
    if (!lastSessionDate || lastSessionDate === todayKey) {
      return false;
    }
    const targetDate = yesterdayKey(todayKey);
    pendingTasks = await getUnfinishedTasksByDate(targetDate);
    if (pendingTasks.length < carryOverThreshold) {
      return false;
    }
    renderList();
    if (!modal.open) {
      modal.showModal();
    }
    return true;
  }

  return {
    openIfNeeded,
  };
}
