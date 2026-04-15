# Flowstate

A local-first productivity app that combines day planning, task management, and Pomodoro focus sessions — all running entirely in the browser with zero backend.

## Purpose

Flowstate is a personal planner built for people who want a fast, private, offline-capable task system without accounts or cloud dependencies. It stores everything in the browser via IndexedDB, loads instantly, and works as a PWA you can install on any device. The workflow is opinionated: plan your day in time-blocked buckets, then execute in focused Pomodoro sprints.

## Tech Stack

| Layer | Technology |
| --- | --- |
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router, Turbopack dev server) |
| **Language** | TypeScript 6 |
| **UI** | React 19, [Radix UI](https://www.radix-ui.com/) primitives, [Lucide](https://lucide.dev/) icons |
| **Styling** | [Tailwind CSS 3](https://tailwindcss.com/) + `tailwindcss-animate` |
| **Animation** | [Motion](https://motion.dev/) (Framer Motion successor) |
| **Database** | [Dexie.js](https://dexie.org/) (IndexedDB wrapper) — fully client-side, no server |
| **Drag & Drop** | [@dnd-kit](https://dndkit.com/) (sortable lists with modifiers) |
| **Forms** | [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/) validation |
| **Notifications** | [Sonner](https://sonner.emilkowal.dev/) toast system |
| **Theming** | `next-themes` with CSS custom properties (HSL design tokens) |
| **Typography** | DM Sans, Fraunces, JetBrains Mono via `next/font` |
| **Weather API** | [MET.no Locationforecast](https://api.met.no/) + [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/) geocoding |
| **PWA** | Custom service worker + web manifest for installability and offline caching |

## Features

### Task Management
- Create, edit, and delete tasks with priority levels (high / medium / low), time estimates, notes, and reference links.
- Nested sub-tasks up to a configurable depth, with collapsible branches.
- Sequential task dependencies with lock-state visualization — a task stays locked until its predecessor is completed.
- Drag-and-drop reordering within buckets (powered by dnd-kit).
- Keyboard shortcuts: `N` to quick-add, `Ctrl+Z` to undo the last completion toggle, `Esc` to dismiss dialogs.

### Day Buckets
- Tasks are organized into **Today**, **Tomorrow**, and **Upcoming** with collapsible sections and per-bucket counts.
- Tomorrow tasks automatically roll into Today at the start of each new day.
- Upcoming tasks with a due date that has passed also roll forward.

### Day Allocation Bar
- A visual "disk-partition" bar that maps estimated task minutes against a 24-hour day.
- Color-coded states: **healthy** (within quota), **over-quota** (warning), and **impossible** (exceeds 24 hours).
- Configurable daily hour quota with a visible marker on the bar.

### Carry-over
- When unfinished tasks are detected from yesterday, a modal appears with options to move or dismiss each task individually or in bulk.
- Configurable threshold for how many leftover tasks trigger the prompt.

### Tomorrow Planner
- Scheduled evening prompt ("Tomorrow Starts Tonight") to plan the next day at a configurable time, with the ability to snooze.

### Pomodoro Focus Mode
- Configurable work / short-break / long-break cycle timer with automatic phase transitions.
- Session counter tracking progress toward a long break.
- Alarm system supporting uploaded audio files or YouTube URLs, with volume control and optional 8-second fade-in.
- All sessions are logged to IndexedDB.

### Dashboard Widgets
- **Date & Clock** — Live date/time display with a mini dot-grid of the current month.
- **Weather** — Current conditions and 4-day forecast powered by MET.no, with city geocoding via OpenStreetMap Nominatim.

### Custom Tags
- User-defined tag names and colors managed from Settings.
- Tags are displayed as colored accents on task cards.

### Data Portability
- Full JSON export/import with **merge** and **replace** modes.
- One-click **Clear All Data** with confirmation dialog.
- Everything stays local — no accounts, no telemetry, no server calls (weather aside).

### PWA Support
- Web manifest and service worker for install-to-home-screen and offline caching.
- Dark-themed standalone window when installed.

## Getting Started

```bash
# Install dependencies
npm install

# Run the dev server (Turbopack)
npm run dev

# Production build
npm run build && npm start
```

Open [http://localhost:3000](http://localhost:3000) — the app redirects to `/tasks` by default.

## Project Structure

```
src/
├── app/
│   ├── tasks/       # Main task board with buckets, allocation bar, carry-over
│   ├── focus/       # Pomodoro timer and alarm settings
│   ├── settings/    # Preferences, tags, weather, data import/export
│   └── layout.tsx   # Root layout with header, fonts, toaster
├── components/
│   ├── ui/          # Radix-based primitives (Button, Dialog, Card, etc.)
│   ├── task-item.tsx
│   ├── task-form.tsx
│   ├── allocation-bar.tsx
│   ├── date-widget.tsx
│   └── weather-widget.tsx
├── lib/
│   ├── db.ts        # Dexie database schema and all CRUD operations
│   ├── dates.ts     # Date key helpers
│   ├── weather.ts   # MET.no API client
│   ├── audio.ts     # Alarm playback utilities
│   └── utils.ts     # cn() and misc helpers
└── types/
    └── index.ts     # All shared TypeScript interfaces and type aliases
```

## License

This project is not currently published under an open-source license.
