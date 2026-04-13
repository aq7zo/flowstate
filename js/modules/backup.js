import { clearAllData, exportSnapshot, importSnapshot } from "../db.js";

function toExportFileName() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `flowstate-backup-${year}-${month}-${day}.json`;
}

export function createBackupModule({ onImported }) {
  const exportBtn = document.querySelector("#export-json");
  const importBtn = document.querySelector("#import-json-trigger");
  const importFileNode = document.querySelector("#import-json-file");
  const clearBtn = document.querySelector("#clear-data-btn");
  const statusNode = document.querySelector("#export-status");
  const previewModal = document.querySelector("#import-preview-modal");
  const previewCopyNode = document.querySelector("#import-preview-copy");
  const mergeBtn = document.querySelector("#import-merge-btn");
  const replaceBtn = document.querySelector("#import-replace-btn");
  const closeBtn = document.querySelector("#import-close-btn");

  let pendingPayload = null;

  exportBtn.addEventListener("click", async () => {
    try {
      const payload = await exportSnapshot();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = toExportFileName();
      a.click();
      URL.revokeObjectURL(url);
      statusNode.textContent = "Backup exported successfully.";
    } catch (_error) {
      statusNode.textContent = "Export failed. Reload and try again.";
    }
  });

  importBtn.addEventListener("click", () => importFileNode.click());

  importFileNode.addEventListener("change", async () => {
    const file = importFileNode.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      pendingPayload = payload;
      const tasks = payload.tasks?.length || 0;
      const templates = payload.templates?.length || 0;
      const logs = payload.pomodoroLogs?.length || 0;
      previewCopyNode.textContent = `This will import ${tasks} tasks, ${templates} templates, and ${logs} Pomodoro sessions.`;
      previewModal.showModal();
    } catch (_error) {
      statusNode.textContent = "Invalid JSON backup file.";
    }
  });

  async function runImport(mode) {
    if (!pendingPayload) return;
    await importSnapshot(pendingPayload, mode);
    previewModal.close();
    statusNode.textContent = `Backup imported with ${mode} mode.`;
    pendingPayload = null;
    await onImported?.();
  }

  mergeBtn.addEventListener("click", () => runImport("merge"));
  replaceBtn.addEventListener("click", () => runImport("replace"));
  closeBtn.addEventListener("click", () => {
    pendingPayload = null;
    previewModal.close();
  });

  clearBtn.addEventListener("click", async () => {
    const ok = window.confirm("Clear all app data? This cannot be undone.");
    if (!ok) return;
    await clearAllData();
    statusNode.textContent = "All local data cleared.";
    await onImported?.();
  });
}
