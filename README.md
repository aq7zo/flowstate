# Flowstate

Local-first productivity app MVP for DLSU students, built with HTML/CSS/Vanilla JS + Dexie.

## Run

- Open `tasks.html` in a modern browser (`index.html` redirects there).
- Keep DevTools open on first run to verify IndexedDB + module loading.

## Implemented Features

- Planner: task CRUD, priority tags, notes/link attachments, time-block timeline, sequential dependencies, and sub-task progress.
- Task Queue UX: single-card `Today` / `Tomorrow` / `Upcoming` buckets with collapsible sections and completion circles.
- Carry-over: daily unfinished-task modal with per-task and bulk actions.
- Focus mode: Pomodoro cycle with file or YouTube alarm, fade, and session logging.
- Calendar analytics: month view, heatmap toggle, streak counter, week summary, and tag filtering.
- Integrations: Canvas credentials storage + sync placeholder and UniCalendar `.ics` sync parser.
- Data: JSON export/import (`Merge`/`Replace`) and clear-all data action.
- PWA base: `manifest.json` and `service-worker.js` for install/offline caching.
- Multi-page app split: `tasks.html`, `focus.html`, `calendar.html`, and `settings.html`.

## Quick Smoke Test

- Add top-level + sub-tasks; verify parent auto-completes after all sub-tasks are done.
- Create a sequential task with dependency; verify lock state/unlock when dependency completes.
- Add tasks to each bucket and verify collapse/expand plus completion circles.
- Toggle month/heatmap in Calendar and validate streak + week summary updates.
- Run UniCalendar sync with an `.ics` feed URL and confirm events are ingested.
- In Focus mode, test both file alarm and YouTube alarm preview.
- Export then import backup using `Merge` and `Replace`.
