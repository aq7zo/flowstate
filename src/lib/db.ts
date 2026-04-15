import Dexie, { type Table } from "dexie";

import type {
  Task,
  TaskInput,
  PomodoroLog,
  PomodoroLogInput,
  Template,
  CalendarEvent,
  DailySummary,
  AppSettings,
  ExportSnapshot,
  ImportMode,
} from "@/types";

const DEFAULT_SETTINGS: AppSettings = {
  key: "app",
  lastSessionDate: null,
  defaultPriority: "none",
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
    none: "#737373",
    high: "#f87171",
    medium: "#f5a623",
    low: "#4ade80",
  },
  dailyQuota: 480,
  tomorrowPromptTime: "20:30",
  tomorrowPromptEnabled: false,
  weekStartDay: "monday",
};

class FlowstateDB extends Dexie {
  tasks!: Table<Task, number>;
  templates!: Table<Template, number>;
  pomodoroLogs!: Table<PomodoroLog, number>;
  calendarEvents!: Table<CalendarEvent, number>;
  settings!: Table<AppSettings, string>;
  dailySummary!: Table<DailySummary, string>;

  constructor() {
    super("flowstateDB");
    this.version(1).stores({
      tasks: "++id, date, status, type, priority, parentId, templateId, order",
      templates: "++id, name, createdAt",
      pomodoroLogs: "++id, taskId, date, duration, type",
      calendarEvents: "++id, date, source, type",
      settings: "key",
      dailySummary: "date",
    });
  }
}

let _db: FlowstateDB | null = null;

function db(): FlowstateDB {
  if (!_db) {
    _db = new FlowstateDB();
  }
  return _db;
}

/** Normalise legacy records that stored a single `link` string. */
function normalizeTask(raw: Record<string, unknown>): Task {
  if (!Array.isArray(raw.links)) {
    const legacy = typeof raw.link === "string" ? raw.link : "";
    raw.links = legacy ? [legacy] : [];
    delete raw.link;
  }
  if (typeof raw.tag !== "string") {
    raw.tag = null;
  }
  return raw as unknown as Task;
}

export async function initDb() {
  const d = db();
  await d.open();
  const current = await d.settings.get("app");
  if (!current) {
    await d.settings.put(DEFAULT_SETTINGS);
  }
}

export async function getSettings(): Promise<AppSettings> {
  const settings = await db().settings.get("app");
  const s = settings ?? DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    priorityColors: {
      ...DEFAULT_SETTINGS.priorityColors,
      ...s.priorityColors,
    },
  };
}

export async function patchSettings(
  partial: Partial<AppSettings>
): Promise<AppSettings> {
  const current = await getSettings();
  const next = { ...current, ...partial, key: "app" as const };
  await db().settings.put(next);
  return next;
}

export async function createTask(taskInput: TaskInput): Promise<Task> {
  const d = db();
  const dateTasks = await d.tasks.where("date").equals(taskInput.date).toArray();
  const nextOrder =
    dateTasks.length > 0
      ? Math.max(...dateTasks.map((t) => t.order || 0)) + 1
      : 1;
  const payload: Task = {
    title: taskInput.title,
    date: taskInput.date,
    notes: taskInput.notes || "",
    links: taskInput.links ?? [],
    priority: taskInput.priority ?? "none",
    tag: taskInput.tag ?? null,
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
  const id = await d.tasks.add(payload);
  return { ...payload, id };
}

export async function getTasksByDate(date: string): Promise<Task[]> {
  const raw = await db().tasks.where("date").equals(date).toArray();
  return raw
    .map((t) => normalizeTask(t as unknown as Record<string, unknown>))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

export async function getAllTasks(): Promise<Task[]> {
  const raw = await db().tasks.toArray();
  return raw
    .map((t) => normalizeTask(t as unknown as Record<string, unknown>))
    .sort((a, b) => {
      if (a.date === b.date) return (a.order || 0) - (b.order || 0);
      return a.date.localeCompare(b.date);
    });
}

export async function updateTask(
  id: number,
  updates: Partial<Task>
): Promise<Task | undefined> {
  await db().tasks.update(id, updates);
  const raw = await db().tasks.get(id);
  if (!raw) return undefined;
  return normalizeTask(raw as unknown as Record<string, unknown>);
}

export async function deleteTask(id: number): Promise<void> {
  await db().tasks.delete(id);
}

export async function getTaskById(id: number): Promise<Task | undefined> {
  const raw = await db().tasks.get(id);
  if (!raw) return undefined;
  return normalizeTask(raw as unknown as Record<string, unknown>);
}

export async function bulkUpdateTasks(
  updates: { id: number; changes: Partial<Task> }[]
): Promise<void> {
  await db().transaction("rw", db().tasks, async () => {
    for (const entry of updates) {
      await db().tasks.update(entry.id, entry.changes);
    }
  });
}

export async function getUnfinishedTasksByDate(date: string): Promise<Task[]> {
  const raw = await db()
    .tasks.where("date")
    .equals(date)
    .and((task) => task.status !== "done")
    .toArray();
  return raw.map((t) => normalizeTask(t as unknown as Record<string, unknown>));
}

export async function addPomodoroLog(logInput: PomodoroLogInput): Promise<void> {
  const payload: PomodoroLog = {
    taskId: logInput.taskId || null,
    date: logInput.date,
    startTime: logInput.startTime || new Date(),
    duration: logInput.duration,
    type: logInput.type,
    completed: Boolean(logInput.completed),
  };
  await db().pomodoroLogs.add(payload);
}

export async function getPomodoroLogsByDateRange(
  startDate: string,
  endDate: string
): Promise<PomodoroLog[]> {
  return db()
    .pomodoroLogs.where("date")
    .between(startDate, endDate, true, true)
    .toArray();
}

export async function getTemplates(): Promise<Template[]> {
  return db().templates.orderBy("createdAt").reverse().toArray();
}

export async function saveTemplate(
  templateInput: Omit<Template, "id">
): Promise<Template> {
  const payload = {
    name: templateInput.name,
    tasks: templateInput.tasks || [],
    createdAt: templateInput.createdAt || new Date(),
    lastUsed: templateInput.lastUsed || null,
  };
  const id = await db().templates.add(payload);
  return { ...payload, id };
}

export async function updateTemplate(
  id: number,
  updates: Partial<Template>
): Promise<Template | undefined> {
  await db().templates.update(id, updates);
  return db().templates.get(id);
}

export async function deleteTemplate(id: number): Promise<void> {
  await db().templates.delete(id);
}

export async function addCalendarEvents(events: CalendarEvent[]): Promise<void> {
  if (!Array.isArray(events) || events.length === 0) return;
  await db().calendarEvents.bulkPut(events);
}

export async function getCalendarEventsByDateRange(
  startDate: string,
  endDate: string
): Promise<CalendarEvent[]> {
  return db()
    .calendarEvents.where("date")
    .between(startDate, endDate, true, true)
    .toArray();
}

export async function replaceCalendarEventsBySource(
  source: string,
  events: CalendarEvent[]
): Promise<void> {
  const d = db();
  await d.transaction("rw", d.calendarEvents, async () => {
    const existing = await d.calendarEvents
      .where("source")
      .equals(source)
      .toArray();
    if (existing.length > 0) {
      await d.calendarEvents.bulkDelete(
        existing.map((e) => e.id).filter(Boolean) as number[]
      );
    }
    if (events.length > 0) {
      await d.calendarEvents.bulkAdd(events);
    }
  });
}

export async function upsertDailySummary(summary: DailySummary): Promise<void> {
  await db().dailySummary.put(summary);
}

export async function getDailySummaryRange(
  startDate: string,
  endDate: string
): Promise<DailySummary[]> {
  return db()
    .dailySummary.where("date")
    .between(startDate, endDate, true, true)
    .toArray();
}

export async function exportSnapshot(): Promise<ExportSnapshot> {
  const d = db();
  const [rawTasks, templates, pomodoroLogs, calendarEvents, settings, dailySummary] =
    await Promise.all([
      d.tasks.toArray(),
      d.templates.toArray(),
      d.pomodoroLogs.toArray(),
      d.calendarEvents.toArray(),
      getSettings(),
      d.dailySummary.toArray(),
    ]);
  const tasks = rawTasks.map((t) =>
    normalizeTask(t as unknown as Record<string, unknown>)
  );
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

export async function importSnapshot(
  payload: Partial<ExportSnapshot>,
  mode: ImportMode = "merge"
): Promise<void> {
  const d = db();
  const tables = [
    "tasks",
    "templates",
    "pomodoroLogs",
    "calendarEvents",
    "dailySummary",
  ] as const;
  const map = {
    tasks: payload.tasks || [],
    templates: payload.templates || [],
    pomodoroLogs: payload.pomodoroLogs || [],
    calendarEvents: payload.calendarEvents || [],
    dailySummary: payload.dailySummary || [],
  };

  const allTables = [
    d.tasks,
    d.templates,
    d.pomodoroLogs,
    d.calendarEvents,
    d.dailySummary,
    d.settings,
  ];

  if (mode === "replace") {
    await d.transaction("rw", allTables, async () => {
      await Promise.all([
        d.tasks.clear(),
        d.templates.clear(),
        d.pomodoroLogs.clear(),
        d.calendarEvents.clear(),
        d.dailySummary.clear(),
      ]);
      for (const tableName of tables) {
        if (map[tableName].length > 0) {
          await (d[tableName] as Table).bulkPut(map[tableName]);
        }
      }
      if (payload.settings) {
        await d.settings.put({ ...payload.settings, key: "app" });
      }
    });
    return;
  }

  await d.transaction("rw", allTables, async () => {
    for (const tableName of tables) {
      if (map[tableName].length > 0) {
        await (d[tableName] as Table).bulkPut(map[tableName]);
      }
    }
    if (payload.settings) {
      const current = await getSettings();
      await d.settings.put({ ...current, ...payload.settings, key: "app" });
    }
  });
}

export async function clearAllData(): Promise<void> {
  const d = db();
  const tables = [d.tasks, d.templates, d.pomodoroLogs, d.calendarEvents, d.dailySummary];
  await d.transaction("rw", tables, async () => {
    await Promise.all([
      d.tasks.clear(),
      d.templates.clear(),
      d.pomodoroLogs.clear(),
      d.calendarEvents.clear(),
      d.dailySummary.clear(),
    ]);
  });
}
