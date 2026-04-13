# Flowstate — App Blueprint

> A local-first personal productivity app for DLSU students combining next-day planning, Pomodoro focus, and a smart academic calendar.

---

## Stack

| Layer | Technology | Rationale |
|---|---|---|
| UI | HTML / CSS / Vanilla JS | No build toolchain needed; ships as a single folder |
| Storage | IndexedDB via **Dexie.js** | Handles structured data, queries, and large records; far beyond localStorage's 5MB flat limit |
| Backup | JSON export / import | Local-first; no backend, no account, full user ownership |
| Calendar APIs | Canvas LMS API + DLSU UniCalendar (iCal/RSS) | Pull academic data directly into the planner |
| Audio | YouTube IFrame API + Web Audio API | Flexible alarm sources — YouTube audio or local file |

---

## Data Architecture (Dexie.js Schema)

```js
db.version(1).stores({
  tasks:       '++id, date, status, type, priority, parentId, templateId',
  templates:   '++id, name, createdAt',
  pomodoroLogs:'++id, taskId, date, duration, type', // type: 'work' | 'break'
  calendarEvents: '++id, date, source, type',        // source: 'canvas'|'unical'|'manual'
  settings:    'key',                                // single-row KV store
  dailySummary:'date',                               // indexed by date string YYYY-MM-DD
});
```

**Key design decisions:**
- `tasks.date` stores `YYYY-MM-DD` — allows range queries for calendar view
- `tasks.parentId` enables sub-tasks (null = top-level, set = child of parent)
- `tasks.templateId` tracks which template a task originated from
- `dailySummary` is pre-computed at end-of-day for fast heatmap rendering

---

## Module Map

```
flowstate/
├── index.html                  ← App shell, router target
├── css/
│   ├── tokens.css              ← All CSS variables (colors, spacing, type)
│   ├── base.css                ← Reset, body, typography
│   ├── components.css          ← Cards, pills, buttons, modals
│   └── animations.css          ← All keyframes and transition classes
├── js/
│   ├── db.js                   ← Dexie schema + all DB helper functions
│   ├── router.js               ← Hash-based SPA router (#today, #calendar, #focus)
│   ├── state.js                ← Reactive app state (Observer pattern)
│   ├── modules/
│   │   ├── planner.js          ← Next-day planning module
│   │   ├── tasks.js            ← Task CRUD, sub-tasks, dependencies
│   │   ├── templates.js        ← Template save / load / preview / partial apply
│   │   ├── pomodoro.js         ← Timer logic, alarm, session tracking
│   │   ├── calendar.js         ← Calendar view, heatmap, streak
│   │   ├── integrations.js     ← Canvas API + UniCalendar fetch + parse
│   │   └── backup.js           ← JSON export / import
│   └── utils/
│       ├── dates.js            ← Date helpers (today, tomorrow, range)
│       ├── notifications.js    ← Browser Notification API wrapper
│       └── audio.js            ← YouTube IFrame + Web Audio alarm handler
└── assets/
    └── icons/                  ← SVG icon set
```

---

## Feature Specifications

---

### 1. Next-Day Planning

**Purpose:** Build tomorrow's task list before bed. The primary daily-use view.

#### Task Object Schema
```js
{
  id:           Number,        // auto-increment
  date:         'YYYY-MM-DD',  // the day this task belongs to
  title:        String,
  notes:        String,        // freeform note
  link:         String,        // URL attachment (Canvas doc, Google Doc, etc.)
  priority:     'high' | 'medium' | 'low' | String,  // custom tag allowed
  estimatedMin: Number,        // time block duration in minutes (optional)
  status:       'pending' | 'done' | 'carried',
  type:         'standard' | 'sequential',
  parentId:     Number | null, // null = top-level task
  dependsOn:    Number | null, // ID of task that must complete first (sequential only)
  templateId:   Number | null,
  order:        Number,        // drag-to-reorder index
  createdAt:    Date,
  completedAt:  Date | null,
}
```

#### Priority Tagging
- Three built-in levels: `high` (red), `medium` (amber), `low` (green)
- Custom tags: user can define color + label (stored in `settings` table as JSON array)
- Priority pill renders as: `● HIGH` with background tint at 15% opacity of the tag color

#### Time Blocking
- Each task optionally has `estimatedMin`
- A day view toggle shows tasks laid out on a horizontal timeline
- If total estimated time > remaining waking hours, a soft warning appears: `"You've planned 11h for a 8h day"`
- Timeline is read-only (visual only) — no drag-resize in v1

#### Notes & Link Attachment
- Each task card has an expandable bottom drawer
- `notes` field: plain text, max 500 chars, auto-saves on blur
- `link` field: URL input with favicon preview
- Links open in a new tab; Canvas links are detected and labeled with the Canvas icon

---

### 2. Task Templates

**Purpose:** Save a named set of tasks and apply them instantly to any day.

#### Template Object Schema
```js
{
  id:        Number,
  name:      String,           // e.g., "Monday School Day"
  tasks:     Array<{title, priority, estimatedMin, type, notes}>,
  createdAt: Date,
  lastUsed:  Date | null,
}
```

#### Template Preview
- Clicking "Apply Template" opens a modal *before* anything changes
- Modal shows the full task list with priority pills and time estimates
- Footer shows: `"This will add N tasks to [Tomorrow, Tuesday Apr 15]"`
- Two action buttons: `Apply All` and `Select Tasks →`

#### Partial Apply
- "Select Tasks →" enters a checkbox-selection mode within the modal
- Each task row gets a checkbox (all checked by default)
- User unchecks tasks they don't want
- `Apply Selected (N)` button applies only checked tasks
- Selected tasks are appended to the existing day — they do not replace it

---

### 3. Custom Task Types

#### A. Sequential Task

A task that is locked until a specific dependency task is completed.

**Behavior:**
- `dependsOn` field points to another task's `id`
- While the dependency is `pending`, this task renders with a lock icon and muted colors
- Hovering / long-pressing the lock shows a tooltip: `"Finish '[dependency title]' to unlock this"`
- When the dependency is marked `done`, the locked task plays the unlock animation and becomes interactive

**Unlock Animation:**
```css
@keyframes unlockSweep {
  0%   { background-position: -100% 0; }
  100% { background-position: 100% 0; }
}
/* A gradient sweep from left to right, transitioning from muted to the task's priority color */
/* Followed by a subtle box-shadow glow pulse (2 pulses, 600ms each) */
```

#### B. Sub-tasks

Tasks nested under a parent task.

**Behavior:**
- Parent task shows a chevron `›` and a progress indicator `2 / 5 ●●○○○`
- Tapping the chevron toggles the sub-task list (collapsed by default)
- Sub-tasks are full task objects with `parentId` set
- Sub-tasks support notes, links, and priority tags
- When all sub-tasks reach `status: 'done'`, the parent auto-completes after a 1.2s delay (allows undo)
- Auto-complete can be disabled per-parent in task settings

**Parent Progress Bar:**
```
Collapsed state:  [██████░░░░] 3 / 5
Expanded state:   Chevron rotates 90°, list slides down with max-height transition
```

---

### 4. Task Carry-Over

Triggered at the start of a new day (detected by comparing `today()` to the last session date in `settings`).

**Flow:**
1. App detects it's a new day and yesterday had unfinished tasks
2. A full-screen modal appears: `"You left 3 tasks unfinished yesterday."`
3. Modal lists each task with its priority pill
4. Options per task: `Move to Today` / `Dismiss` / (future: `Move to specific date`)
5. Bulk action: `Move All` / `Dismiss All`
6. Tasks moved get `status: 'carried'` reset to `'pending'` with new `date = today`
7. Tasks dismissed get `status: 'carried'` and are retained in history

---

### 5. Pomodoro Focus Mode

**Purpose:** Timed deep work sessions with customizable intervals and alarm.

#### Timer State Machine
```
IDLE → WORK → BREAK → WORK → BREAK → ... → LONG_BREAK → IDLE
```

#### Configuration (stored in `settings`):
```js
{
  workMin:       25,
  shortBreakMin: 5,
  longBreakMin:  15,
  sessionsBeforeLong: 4,
  alarmType:    'youtube' | 'file' | 'none',
  alarmUrl:     String,    // YouTube URL
  alarmFile:    String,    // base64-encoded audio (stored in settings)
  alarmVolume:  Number,    // 0.0–1.0
  alarmFade:    Boolean,   // fade-in instead of instant
}
```

#### Alarm System

**YouTube Audio:**
- User pastes a YouTube URL
- On alarm trigger: IFrame API loads the video muted, then unmutes at `alarmVolume`
- Video is hidden (`visibility: hidden`); only audio plays
- A "Preview" button plays a 5-second sample immediately

**File Upload:**
- Accepts MP3, WAV, OGG
- Stored as base64 in `settings` table (up to ~10MB practical limit)
- Played via `Web Audio API` for volume control
- Preview button plays the file immediately

**Volume & Fade:**
- Independent volume slider (does not touch system volume)
- If `alarmFade: true`, `GainNode` ramps from 0 to `alarmVolume` over 8 seconds

#### Session Logging
Each completed work or break session is written to `pomodoroLogs`:
```js
{
  taskId:    Number | null,  // which task was focused on (optional link)
  date:      'YYYY-MM-DD',
  startTime: Date,
  duration:  Number,         // actual minutes completed
  type:      'work' | 'break' | 'long_break',
  completed: Boolean,        // false if user skipped early
}
```

---

### 6. Calendar Module

#### Views

**Month View (default):**
- Standard calendar grid
- Each day cell shows: completion percentage bar + task count
- Color intensity reflects completion rate (heatmap cells)

**Heatmap View (toggle):**
- GitHub-style grid: 52 columns × 7 rows
- Color scale: `--bg-surface` → `--accent-cool` (teal) at 100% completion
- Hover tooltip: `"Apr 13 · 7 tasks · 92% complete · 3 Pomodoros"`

**Week Summary Panel:**
Auto-computed from `dailySummary` table:
- Tasks planned vs. completed
- Total Pomodoro minutes
- Most productive day of week
- Tag breakdown (% of tasks per tag)

#### Streak Tracking
- A streak = consecutive days where completion ≥ 80% (configurable threshold)
- Stored as `currentStreak` and `longestStreak` in `settings`
- Streak counter shown in calendar header: `🔥 7 days`
- Streak breaks on a day with logged tasks but < threshold completion

#### Tag Filter
- Filter chips above the calendar: `All` · `School` · `Personal` · `Urgent`
- Filtering dims non-matching days and adjusts the heatmap to show only matching task completions

---

### 7. Integrations

#### Canvas LMS API

**Setup:**
1. User navigates to `Settings → Integrations → Canvas`
2. Inputs their institution's Canvas domain + personal access token
3. Token stored encrypted in `settings` (AES-GCM via Web Crypto API)

**Data pulled:**
- Upcoming assignments (title, due date, course name, URL)
- Announcements (flagged as non-task calendar events)

**Sync behavior:**
- Manual sync button (no auto-sync to avoid rate limit issues)
- Assignments import as `calendarEvents` with `source: 'canvas'`
- User can promote any Canvas event to a full task with one tap

#### DLSU UniCalendar

**Setup:** No auth required (public calendar feed)

**Data pulled:**
- Semester schedule (term start/end, midterms, finals weeks)
- Official holidays and non-class days
- Enrollment windows
- Grade release dates

**Holiday Auto-Block:**
- On flagged holidays, the Next-Day Planning view shows a banner: `"No Classes — EDSA People Power Day"`
- Academic tasks (tagged `school`) are visually dimmed with a warning if scheduled on holidays
- User can override the block

**Academic Milestones:**
- Key dates (enrollment, term end) render as non-editable markers in the calendar
- Styled distinctly (diamond marker, gold color) — cannot be deleted, only hidden

---

### 8. Backup System

#### JSON Export
```js
// Structure of export file
{
  exportedAt:     ISO8601 string,
  version:        '1.0',
  tasks:          [...],
  templates:      [...],
  pomodoroLogs:   [...],
  calendarEvents: [...],
  settings:       {...},
  dailySummary:   [...],
}
```
- Exported as `flowstate-backup-YYYY-MM-DD.json`
- Triggered from Settings → Data → Export

#### JSON Import
- User drops or selects a `.json` file
- App validates structure and version
- Preview modal shows: `"This will import N tasks, N templates, N Pomodoro sessions"`
- Import mode: `Merge` (add to existing, skip duplicates by ID) or `Replace` (wipe and restore)
- Progress bar shown during import (Dexie bulk operations)

---

## UI/UX Interaction Details

### Drag-to-Reorder Tasks
- Tasks in the daily planner are reorderable via drag-and-drop
- Uses native HTML5 Drag and Drop API (no library dependency)
- `order` field updates on drop; persisted to DB immediately

### Keyboard Shortcuts
| Shortcut | Action |
|---|---|
| `N` | New task (focused on title input) |
| `T` | Jump to Today view |
| `F` | Start Pomodoro Focus |
| `C` | Open Calendar |
| `Ctrl+Z` | Undo last task completion |
| `Esc` | Close modal / cancel |

### Undo System
- Last 10 task state changes stored in an in-memory `undoStack`
- `Ctrl+Z` pops the stack and reverts the DB record
- Undo stack is session-only (cleared on page refresh)

### Offline Support
- The app is fully offline-capable (no network required for core features)
- A `manifest.json` + Service Worker enables PWA install
- Canvas/UniCalendar sync gracefully fails with a toast: `"Offline — synced data from last session"`

---

## Settings Panel

```
Settings
├── General
│   ├── App name display
│   ├── First day of week (Sun / Mon)
│   ├── Default task priority
│   └── Carry-over threshold (auto-prompt if N+ unfinished)
├── Pomodoro
│   ├── Work duration
│   ├── Short break duration
│   ├── Long break duration
│   ├── Sessions before long break
│   └── Alarm configuration (type, URL/file, volume, fade)
├── Calendar
│   ├── Streak completion threshold (default 80%)
│   ├── Show holidays from UniCalendar (toggle)
│   └── Academic milestone display (toggle)
├── Integrations
│   ├── Canvas domain + token (+ sync button)
│   └── UniCalendar feed URL (pre-filled for DLSU)
├── Custom Tags
│   └── Add / edit / delete tags with color picker
└── Data
    ├── Export backup (JSON)
    ├── Import backup (JSON)
    └── Clear all data (with confirmation)
```

---

## Implementation Phases

### Phase 1 — Core Loop (MVP)
- [ ] Dexie schema setup
- [ ] Next-Day Planning: add, edit, delete, reorder tasks
- [ ] Priority tagging (3 built-in)
- [ ] Mark task complete + carry-over prompt
- [ ] Pomodoro timer with basic alarm (file upload only)
- [ ] JSON export

### Phase 2 — Task Power Features
- [ ] Sub-tasks with parent auto-complete
- [ ] Sequential tasks with dependency lock + unlock animation
- [ ] Time blocking timeline view
- [ ] Notes + link attachment per task
- [ ] Template save / load / preview / partial apply
- [ ] JSON import

### Phase 3 — Calendar & Analytics
- [ ] Month view with completion indicators
- [ ] Heatmap view
- [ ] Streak tracking
- [ ] Week summary panel
- [ ] Tag filter on calendar

### Phase 4 — Integrations & Polish
- [ ] Canvas LMS API integration
- [ ] DLSU UniCalendar feed
- [ ] Holiday auto-block + academic milestones
- [ ] YouTube alarm support
- [ ] PWA manifest + service worker
- [ ] Keyboard shortcuts
- [ ] Full Settings panel
- [ ] Custom tags

---

## Key Constraints & Decisions

| Decision | Rationale |
|---|---|
| No user accounts | Privacy-first; no server infra needed; simpler for single-user use |
| IndexedDB over localStorage | localStorage is 5MB flat string storage; IndexedDB handles structured queries, indexes, and large data |
| Dexie.js (not raw IndexedDB) | IndexedDB's native API is callback-heavy and verbose; Dexie provides a clean Promise/async wrapper |
| Canvas token stored client-side | Encrypted via Web Crypto API (AES-GCM); never leaves the device |
| YouTube audio via IFrame API | No server-side audio extraction needed; IFrame API allows programmatic control |
| JSON backup over sync | Keeps the app serverless; user owns data; simple to implement and audit |
| Vanilla JS (no framework) | Reduces complexity, faster load, no build toolchain, ships as static files |