import { initDb, getSettings, patchSettings } from "../db.js";
import { createTasksModule } from "../modules/tasks.js";
import { createCarryoverModule } from "../modules/planner.js";
import { initWidgets } from "../modules/widgets.js";
import { toDateKey } from "../utils/dates.js";

function parseTimeToDate(timeValue) {
  const [rawHour, rawMinute] = (timeValue || "").split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  const target = new Date();
  target.setHours(hour, minute, 0, 0);
  return target;
}

function setupTomorrowPrompt(tasksModule, settings) {
  if (!settings.tomorrowPromptEnabled) return;
  const modal = document.querySelector("#tomorrow-planner-modal");
  const openBtn = document.querySelector("#tomorrow-planner-open");
  const snoozeBtn = document.querySelector("#tomorrow-planner-snooze");
  const closeBtn = document.querySelector("#tomorrow-planner-close");
  if (!modal || !openBtn || !snoozeBtn || !closeBtn) return;

  let timerId = null;

  const showPrompt = () => {
    if (!modal.open) modal.showModal();
  };

  const scheduleAt = (targetDate) => {
    if (timerId) window.clearTimeout(timerId);
    const delay = Math.max(0, targetDate.getTime() - Date.now());
    timerId = window.setTimeout(showPrompt, delay);
  };

  const initialTarget = parseTimeToDate(settings.tomorrowPromptTime || "20:30");
  if (!initialTarget) return;
  if (Date.now() < initialTarget.getTime()) {
    scheduleAt(initialTarget);
  }

  openBtn.addEventListener("click", () => {
    modal.close();
    tasksModule.expandBucket("tomorrow");
    tasksModule.openBucketComposer("tomorrow");
  });
  closeBtn.addEventListener("click", () => modal.close());
  snoozeBtn.addEventListener("click", () => {
    modal.close();
    scheduleAt(new Date(Date.now() + 15 * 60 * 1000));
  });
}

async function initTasksPage() {
  await initDb();
  const settings = await getSettings();
  const todayKey = toDateKey();

  const widgetsContainer = document.querySelector("#widgets-container");
  if (widgetsContainer) initWidgets(widgetsContainer);

  const tasksModule = createTasksModule({
    dateKey: todayKey,
    quotaMinutes: settings.dailyQuota || 480,
    onTaskMutated: async () => {
      await tasksModule.refresh();
    },
  });
  tasksModule.bindShortcuts();
  await tasksModule.refresh();

  const carryover = createCarryoverModule({
    todayKey,
    carryOverThreshold: settings.carryOverThreshold || 1,
    onMutated: async () => tasksModule.refresh(),
  });
  await carryover.openIfNeeded(settings.lastSessionDate);
  await patchSettings({ lastSessionDate: todayKey });
  setupTomorrowPrompt(tasksModule, settings);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
}

initTasksPage().catch(() => {});
