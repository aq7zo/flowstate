import { initDb, getSettings } from "../db.js";
import { createSettingsModule } from "../modules/settings.js";
import { createIntegrationsModule } from "../modules/integrations.js";
import { createBackupModule } from "../modules/backup.js";

async function initSettingsPage() {
  await initDb();
  await getSettings();

  createSettingsModule({
    onSettingsChanged: async () => {},
  }).init();

  createIntegrationsModule({
    onCalendarChanged: async () => {},
  }).init();

  createBackupModule({
    onImported: async () => {},
  });
}

initSettingsPage().catch(() => {});
