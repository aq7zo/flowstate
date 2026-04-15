export type Priority = "none" | "high" | "medium" | "low";
export type TaskStatus = "pending" | "done" | "carried";
export type TaskType = "standard" | "sequential";
export type Bucket = "today" | "tomorrow" | "upcoming";
export type PomodoroPhase = "IDLE" | "WORK" | "BREAK" | "LONG_BREAK";
export type AlarmType = "file" | "youtube" | "none";
export type ImportMode = "merge" | "replace";
export type WeekStartDay =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface Task {
  id?: number;
  title: string;
  date: string;
  notes: string;
  links: string[];
  priority: Priority;
  tag: string | null;
  estimatedMin: number;
  status: TaskStatus;
  type: TaskType;
  bucket: Bucket;
  parentId: number | null;
  dependsOn: number | null;
  templateId: number | null;
  order: number;
  createdAt: Date;
  completedAt: Date | null;
}

export interface TaskInput {
  title: string;
  date: string;
  notes?: string;
  links?: string[];
  priority?: Priority;
  tag?: string | null;
  estimatedMin?: number;
  status?: TaskStatus;
  type?: TaskType;
  bucket?: Bucket;
  parentId?: number | null;
  dependsOn?: number | null;
  templateId?: number | null;
}

export interface PomodoroLog {
  id?: number;
  taskId: number | null;
  date: string;
  startTime: Date;
  duration: number;
  type: "work" | "break" | "long_break";
  completed: boolean;
}

export interface PomodoroLogInput {
  taskId?: number | null;
  date: string;
  startTime?: Date;
  duration: number;
  type: "work" | "break" | "long_break";
  completed?: boolean;
}

export interface Template {
  id?: number;
  name: string;
  tasks: TaskInput[];
  createdAt: Date;
  lastUsed: Date | null;
}

export interface CalendarEvent {
  id?: number;
  date: string;
  source: string;
  type: string;
  title: string;
  dueAt?: string;
  url?: string;
}

export interface DailySummary {
  date: string;
  planned: number;
  completed: number;
  completionRate: number;
  tags: Record<string, number>;
}

export interface CustomTag {
  name: string;
  color: string;
}

export interface AppSettings {
  key: string;
  lastSessionDate: string | null;
  defaultPriority: Priority;
  workMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  sessionsBeforeLong: number;
  alarmType: AlarmType;
  alarmFile: string;
  alarmUrl?: string;
  alarmVolume: number;
  alarmFade: boolean;
  streakCompletionThreshold: number;
  priorityColors: Record<Priority, string>;
  dailyQuota: number;
  tomorrowPromptTime: string;
  tomorrowPromptEnabled: boolean;
  weatherCity?: string;
  weatherLat?: number | null;
  weatherLon?: number | null;
  canvasDomain?: string;
  canvasTokenEncrypted?: string;
  uniCalendarUrl?: string;
  customTags?: CustomTag[];
  currentStreak?: number;
  longestStreak?: number;
  carryOverThreshold?: number;
  maxNestingDepth?: number;
  weekStartDay?: WeekStartDay;
}

export interface ExportSnapshot {
  exportedAt: string;
  version: string;
  tasks: Task[];
  templates: Template[];
  pomodoroLogs: PomodoroLog[];
  calendarEvents: CalendarEvent[];
  settings: AppSettings;
  dailySummary: DailySummary[];
}
