import { initDb, getSettings } from "../db.js";
import { createPomodoroModule } from "../modules/pomodoro.js";

async function initFocusPage() {
  await initDb();
  const settings = await getSettings();
  createPomodoroModule({ settings });
}

initFocusPage().catch(() => {});
