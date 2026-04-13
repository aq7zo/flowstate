import { initDb, getSettings, patchSettings } from "../db.js";
import { createTasksModule } from "../modules/tasks.js";
import { createCarryoverModule } from "../modules/planner.js";
import { createTemplatesModule } from "../modules/templates.js";
import { toDateKey } from "../utils/dates.js";

async function initTasksPage() {
  await initDb();
  const settings = await getSettings();
  const todayKey = toDateKey();

  const tasksModule = createTasksModule({
    dateKey: todayKey,
    onTaskMutated: async () => {
      await tasksModule.refresh();
    },
  });
  tasksModule.bindShortcuts();
  await tasksModule.refresh();

  createTemplatesModule({
    tasksModule,
    dateLabel: document.querySelector("#today-date-label")?.textContent || "today",
  }).init();

  const carryover = createCarryoverModule({
    todayKey,
    carryOverThreshold: settings.carryOverThreshold || 1,
    onMutated: async () => tasksModule.refresh(),
  });
  await carryover.openIfNeeded(settings.lastSessionDate);
  await patchSettings({ lastSessionDate: todayKey });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
}

initTasksPage().catch(() => {});
