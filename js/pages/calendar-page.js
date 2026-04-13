import { initDb } from "../db.js";
import { createCalendarModule } from "../modules/calendar.js";

async function initCalendarPage() {
  await initDb();
  await createCalendarModule().init();
}

initCalendarPage().catch(() => {});
