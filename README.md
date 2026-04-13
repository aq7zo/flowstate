# Flowstate

Local-first productivity app MVP for DLSU students, built with HTML/CSS/Vanilla JS + Dexie.

## Run

- Open `index.html` in a modern browser.
- Keep DevTools open on first run to verify IndexedDB + module loading.

## Implemented Features

- Planner: task CRUD, priority tags, notes/link attachments, time-block timeline, sequential dependencies, and sub-task progress.
- Templates: save current day, preview template tasks, apply all or selected tasks.
- Carry-over: daily unfinished-task modal with per-task and bulk actions.
- Focus mode: Pomodoro cycle with file or YouTube alarm, fade, and session logging.
- Calendar analytics: month view, heatmap toggle, streak counter, week summary, and tag filtering.
- Integrations: Canvas credentials storage + sync placeholder and UniCalendar `.ics` sync parser.
- Data: JSON export/import (`Merge`/`Replace`) and clear-all data action.
- PWA base: `manifest.json` and `service-worker.js` for install/offline caching.

## Quick Smoke Test

- Add top-level + sub-tasks; verify parent auto-completes after all sub-tasks are done.
- Create a sequential task with dependency; verify lock state/unlock when dependency completes.
- Save a template from current tasks; preview and apply only selected rows.
- Toggle month/heatmap in Calendar and validate streak + week summary updates.
- Run UniCalendar sync with an `.ics` feed URL and confirm events are ingested.
- In Focus mode, test both file alarm and YouTube alarm preview.
- Export then import backup using `Merge` and `Replace`.
