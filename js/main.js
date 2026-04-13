import { initDb, getSettings, patchSettings } from "./db.js";
import { initRouter } from "./router.js";
import { patchState } from "./state.js";
import { createTasksModule } from "./modules/tasks.js";
import { createCarryoverModule } from "./modules/planner.js";
import { createPomodoroModule } from "./modules/pomodoro.js";
import { createBackupModule } from "./modules/backup.js";
import { createCalendarModule } from "./modules/calendar.js";
import { createTemplatesModule } from "./modules/templates.js";
import { createIntegrationsModule } from "./modules/integrations.js";
import { createSettingsModule } from "./modules/settings.js";
import { stopAudio } from "./utils/audio.js";
import { toDateKey } from "./utils/dates.js";

async function bootstrap() {
  await initDb();
  initRouter();

  const todayKey = toDateKey();
  const settings = await getSettings();
  patchState({
    todayDate: todayKey,
    settings,
  });

  const tasksModule = createTasksModule({
    dateKey: todayKey,
    onTaskMutated: async () => {
      await tasksModule.refresh();
      await calendarModule.refresh();
    },
  });
  const calendarModule = createCalendarModule();
  tasksModule.bindShortcuts();
  await tasksModule.refresh();
  await calendarModule.init();

  const carryoverModule = createCarryoverModule({
    todayKey,
    carryOverThreshold: settings.carryOverThreshold || 1,
    onMutated: async () => {
      await tasksModule.refresh();
      await calendarModule.refresh();
    },
  });
  await carryoverModule.openIfNeeded(settings.lastSessionDate);
  await patchSettings({ lastSessionDate: todayKey });

  createPomodoroModule({ settings });
  createTemplatesModule({
    tasksModule,
    dateLabel: document.querySelector("#today-date-label")?.textContent || "today",
  }).init();

  createIntegrationsModule({
    onCalendarChanged: async () => {
      await calendarModule.refresh();
    },
  }).init();

  createSettingsModule({
    onSettingsChanged: async (nextSettings) => {
      patchState({ settings: nextSettings });
    },
  }).init();

  createBackupModule({
    onImported: async () => {
      const next = await getSettings();
      patchState({ settings: next });
      await tasksModule.refresh();
      await calendarModule.refresh();
    },
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      stopAudio();
    }
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // Silent fail; app still works offline for local data.
    });
  }
}

bootstrap().catch((error) => {
  const status = document.querySelector("#export-status");
  if (status) {
    status.textContent = `Initialization failed: ${error?.message || "unknown error"}`;
  }
});
