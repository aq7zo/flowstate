# Flowstate

A local-first day tracker and Pomodoro focus app built with vanilla HTML/CSS/JS and IndexedDB (Dexie).

## Features

- **Task management** — Create, edit, and delete tasks with priority levels, time estimates, notes, and reference links. Supports sub-tasks (up to 3 levels deep) and sequential dependencies with lock states.
- **Day allocation bar** — Visual "disk-partition" bar that maps estimated task minutes against a 24-hour day. Color-coded states for within-quota, over-quota, and exceeding 24h, with a configurable daily quota marker.
- **Buckets** — Organize tasks into Today, Tomorrow, and Upcoming with collapsible sections and per-bucket counts.
- **Carry-over** — On a new day, a modal surfaces unfinished tasks with options to move or dismiss them individually or in bulk.
- **Tomorrow planner** — Scheduled evening prompt to plan the next day, with snooze support.
- **Pomodoro focus mode** — Configurable work/break cycle timer with session tracking, file or YouTube alarm, volume control, and fade-in.
- **Calendar analytics** — Month grid view, heatmap toggle, streak counter, week summary, and tag filtering.
- **Dashboard widgets** — Live date/clock with mini month dot grid, and weather widget powered by MET.no with current conditions and 4-day forecast.
- **Custom tags** — User-defined tag names and colors managed from settings.
- **Integrations** — Canvas LMS credential storage with sync placeholder, and UniCalendar .ics feed parser.
- **Data portability** — Full JSON export/import with merge and replace modes, plus a clear-all option.
- **PWA** — Manifest and service worker for install and offline caching.
