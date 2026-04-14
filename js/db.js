const db = new Dexie("flowstateDB");

db.version(1).stores({
  tasks: "++id, date, status, type, priority, parentId, templateId, order",
  templates: "++id, name, createdAt",
  pomodoroLogs: "++id, taskId, date, duration, type",
  calendarEvents: "++id, date, source, type",
  settings: "key",
  dailySummary: "date",
});

const DEFAULT_SETTINGS = {
  key: "app",
  lastSessionDate: null,
  defaultPriority: "medium",
  workMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  sessionsBeforeLong: 4,
  alarmType: "file",
  alarmFile: "",
  alarmVolume: 0.8,
  alarmFade: false,
  streakCompletionThreshold: 80,
  priorityColors: {
    high: "#f87171",
    medium: "#f5a623",
    low: "#4ade80",
  },
  dailyQuota: 480,
  tomorrowPromptTime: "20:30",
  tomorrowPromptEnabled: false,
};

export async function initDb() {
  await db.open();
  const current = await db.settings.get("app");
  if (!current) {
    await db.settings.put(DEFAULT_SETTINGS);
  }
}

export async function getSettings() {
  const settings = await db.settings.get("app");
  return settings || { ...DEFAULT_SETTINGS };
}

export async function patchSettings(partialSettings) {
  const current = await getSettings();
  const next = { ...current, ...partialSettings, key: "app" };
  await db.settings.put(next);
  return next;
}

export async function createTask(taskInput) {
  const dateTasks = await db.tasks.where("date").equals(taskInput.date).toArray();
  const nextOrder = dateTasks.length > 0 ? Math.max(...dateTasks.map((task) => task.order || 0)) + 1 : 1;
  const payload = {
    title: taskInput.title,
    date: taskInput.date,
    notes: taskInput.notes || "",
    link: taskInput.link || "",
    priority: taskInput.priority || "medium",
    estimatedMin: taskInput.estimatedMin || 0,
    status: taskInput.status || "pending",
    type: taskInput.type || "standard",
    bucket: taskInput.bucket || "today",
    parentId: taskInput.parentId || null,
    dependsOn: taskInput.dependsOn || null,
    templateId: taskInput.templateId || null,
    order: nextOrder,
    createdAt: new Date(),
    completedAt: null,
  };
  const id = await db.tasks.add(payload);
  return { ...payload, id };
}

export async function getTasksByDate(date) {
  const tasks = await db.tasks.where("date").equals(date).toArray();
  return tasks.sort((a, b) => (a.order || 0) - (b.order || 0));
}

export async function getAllTasks() {
  const tasks = await db.tasks.toArray();
  return tasks.sort((a, b) => {
    if (a.date === b.date) return (a.order || 0) - (b.order || 0);
    return a.date.localeCompare(b.date);
  });
}

export async function updateTask(id, updates) {
  await db.tasks.update(id, updates);
  return db.tasks.get(id);
}

export async function deleteTask(id) {
  await db.tasks.delete(id);
}

export async function getTaskById(id) {
  return db.tasks.get(id);
}

export async function bulkUpdateTasks(updates) {
  await db.transaction("rw", db.tasks, async () => {
    for (const entry of updates) {
      await db.tasks.update(entry.id, entry.changes);
    }
  });
}

export async function getUnfinishedTasksByDate(date) {
  return db.tasks.where("date").equals(date).and((task) => task.status !== "done").toArray();
}

export async function addPomodoroLog(logInput) {
  const payload = {
    taskId: logInput.taskId || null,
    date: logInput.date,
    startTime: logInput.startTime || new Date(),
    duration: logInput.duration,
    type: logInput.type,
    completed: Boolean(logInput.completed),
  };
  await db.pomodoroLogs.add(payload);
}

export async function getPomodoroLogsByDateRange(startDate, endDate) {
  const logs = await db.pomodoroLogs.where("date").between(startDate, endDate, true, true).toArray();
  return logs;
}

export async function getTemplates() {
  return db.templates.orderBy("createdAt").reverse().toArray();
}

export async function saveTemplate(templateInput) {
  const payload = {
    name: templateInput.name,
    tasks: templateInput.tasks || [],
    createdAt: templateInput.createdAt || new Date(),
    lastUsed: templateInput.lastUsed || null,
  };
  const id = await db.templates.add(payload);
  return { ...payload, id };
}

export async function updateTemplate(id, updates) {
  await db.templates.update(id, updates);
  return db.templates.get(id);
}

export async function deleteTemplate(id) {
  await db.templates.delete(id);
}

export async function addCalendarEvents(events) {
  if (!Array.isArray(events) || events.length === 0) return;
  await db.calendarEvents.bulkPut(events);
}

export async function getCalendarEventsByDateRange(startDate, endDate) {
  return db.calendarEvents.where("date").between(startDate, endDate, true, true).toArray();
}

export async function replaceCalendarEventsBySource(source, events) {
  await db.transaction("rw", db.calendarEvents, async () => {
    const existing = await db.calendarEvents.where("source").equals(source).toArray();
    if (existing.length > 0) {
      await db.calendarEvents.bulkDelete(existing.map((entry) => entry.id).filter(Boolean));
    }
    if (events.length > 0) {
      await db.calendarEvents.bulkAdd(events);
    }
  });
}

export async function upsertDailySummary(summary) {
  await db.dailySummary.put(summary);
}

export async function getDailySummaryRange(startDate, endDate) {
  return db.dailySummary.where("date").between(startDate, endDate, true, true).toArray();
}

export async function exportSnapshot() {
  const [tasks, templates, pomodoroLogs, calendarEvents, settings, dailySummary] = await Promise.all([
    db.tasks.toArray(),
    db.templates.toArray(),
    db.pomodoroLogs.toArray(),
    db.calendarEvents.toArray(),
    getSettings(),
    db.dailySummary.toArray(),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    version: "1.0",
    tasks,
    templates,
    pomodoroLogs,
    calendarEvents,
    settings,
    dailySummary,
  };
}

export async function importSnapshot(payload, mode = "merge") {
  const tables = ["tasks", "templates", "pomodoroLogs", "calendarEvents", "dailySummary"];
  const map = {
    tasks: payload.tasks || [],
    templates: payload.templates || [],
    pomodoroLogs: payload.pomodoroLogs || [],
    calendarEvents: payload.calendarEvents || [],
    dailySummary: payload.dailySummary || [],
  };

  if (mode === "replace") {
    await db.transaction("rw", db.tasks, db.templates, db.pomodoroLogs, db.calendarEvents, db.dailySummary, db.settings, async () => {
      await Promise.all([
        db.tasks.clear(),
        db.templates.clear(),
        db.pomodoroLogs.clear(),
        db.calendarEvents.clear(),
        db.dailySummary.clear(),
      ]);
      for (const tableName of tables) {
        if (map[tableName].length > 0) {
          await db[tableName].bulkPut(map[tableName]);
        }
      }
      if (payload.settings) {
        await db.settings.put({ ...payload.settings, key: "app" });
      }
    });
    return;
  }

  await db.transaction("rw", db.tasks, db.templates, db.pomodoroLogs, db.calendarEvents, db.dailySummary, db.settings, async () => {
    for (const tableName of tables) {
      if (map[tableName].length > 0) {
        await db[tableName].bulkPut(map[tableName]);
      }
    }
    if (payload.settings) {
      const current = await getSettings();
      await db.settings.put({ ...current, ...payload.settings, key: "app" });
    }
  });
}

export async function clearAllData() {
  await db.transaction("rw", db.tasks, db.templates, db.pomodoroLogs, db.calendarEvents, db.dailySummary, async () => {
    await Promise.all([
      db.tasks.clear(),
      db.templates.clear(),
      db.pomodoroLogs.clear(),
      db.calendarEvents.clear(),
      db.dailySummary.clear(),
    ]);
  });
}
