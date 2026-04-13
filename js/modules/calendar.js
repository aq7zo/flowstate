import { getAllTasks, getPomodoroLogsByDateRange, getSettings, patchSettings, upsertDailySummary } from "../db.js";
import { toDateKey } from "../utils/dates.js";

function addDays(dateKey, delta) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + delta);
  return toDateKey(date);
}

export function createCalendarModule() {
  const monthViewNode = document.querySelector("#month-view");
  const heatmapNode = document.querySelector("#heatmap-view");
  const toggleHeatmapBtn = document.querySelector("#toggle-heatmap");
  const streakNode = document.querySelector("#streak-counter");
  const summaryNode = document.querySelector("#week-summary");
  const tagFilterNode = document.querySelector("#calendar-tag-filter");

  let showHeatmap = false;

  function completionColor(score) {
    const alpha = Math.max(0.08, Math.min(0.95, score));
    return `rgba(61, 217, 197, ${alpha})`;
  }

  async function computeDaily(tasks) {
    const map = new Map();
    tasks.forEach((task) => {
      const key = task.date;
      if (!map.has(key)) {
        map.set(key, { date: key, planned: 0, completed: 0, tags: {} });
      }
      const row = map.get(key);
      row.planned += 1;
      if (task.status === "done") row.completed += 1;
      row.tags[task.priority] = (row.tags[task.priority] || 0) + 1;
    });

    for (const summary of map.values()) {
      const completionRate = summary.planned === 0 ? 0 : Math.round((summary.completed / summary.planned) * 100);
      await upsertDailySummary({
        date: summary.date,
        planned: summary.planned,
        completed: summary.completed,
        completionRate,
        tags: summary.tags,
      });
    }
    return map;
  }

  function renderMonth(dailyMap, filterTag) {
    monthViewNode.innerHTML = "";
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startOffset = first.getDay();
    const totalSlots = startOffset + last.getDate();

    for (let slot = 0; slot < totalSlots; slot += 1) {
      const day = slot - startOffset + 1;
      const cell = document.createElement("article");
      cell.className = "calendar-cell";
      if (day < 1) {
        cell.style.visibility = "hidden";
        monthViewNode.append(cell);
        continue;
      }
      const key = toDateKey(new Date(year, month, day));
      const summary = dailyMap.get(key);
      const planned = summary?.planned || 0;
      const completed = summary?.completed || 0;
      const rate = planned > 0 ? completed / planned : 0;
      const relevant = filterTag === "all" || (summary?.tags && summary.tags[filterTag]);
      if (!relevant) cell.classList.add("is-dimmed");
      cell.innerHTML = `
        <p class="mono">${day}</p>
        <div class="meter"><span style="width:${Math.round(rate * 100)}%"></span></div>
        <p class="mono muted">${completed}/${planned}</p>
      `;
      monthViewNode.append(cell);
    }
  }

  function renderHeatmap(dailyMap, filterTag) {
    heatmapNode.innerHTML = "";
    const todayKey = toDateKey();
    for (let i = 364; i >= 0; i -= 1) {
      const key = addDays(todayKey, -i);
      const summary = dailyMap.get(key);
      const planned = summary?.planned || 0;
      const completed = summary?.completed || 0;
      const rate = planned > 0 ? completed / planned : 0;
      const relevant = filterTag === "all" || (summary?.tags && summary.tags[filterTag]);
      const cell = document.createElement("div");
      cell.className = "heatmap-cell";
      cell.style.background = relevant ? completionColor(rate) : "rgba(61, 217, 197, 0.05)";
      cell.title = `${key} · ${planned} tasks · ${Math.round(rate * 100)}% complete`;
      heatmapNode.append(cell);
    }
  }

  function renderSummary(tasks, logs, dailyMap) {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const mondayKey = toDateKey(monday);
    const sundayKey = addDays(mondayKey, 6);

    const weekTasks = tasks.filter((task) => task.date >= mondayKey && task.date <= sundayKey);
    const planned = weekTasks.length;
    const done = weekTasks.filter((task) => task.status === "done").length;
    const workMins = logs.filter((log) => log.type === "work").reduce((sum, log) => sum + log.duration, 0);

    const byDay = {};
    weekTasks.forEach((task) => {
      byDay[task.date] = byDay[task.date] || { planned: 0, done: 0 };
      byDay[task.date].planned += 1;
      if (task.status === "done") byDay[task.date].done += 1;
    });

    let mostProductive = "N/A";
    let highestRate = -1;
    Object.entries(byDay).forEach(([day, stats]) => {
      const rate = stats.planned ? stats.done / stats.planned : 0;
      if (rate > highestRate) {
        highestRate = rate;
        mostProductive = day;
      }
    });

    const tagCounts = weekTasks.reduce((acc, task) => {
      acc[task.priority] = (acc[task.priority] || 0) + 1;
      return acc;
    }, {});
    const tagBreakdown = Object.entries(tagCounts)
      .map(([tag, count]) => `${tag}: ${Math.round((count / Math.max(planned, 1)) * 100)}%`)
      .join(" · ");

    summaryNode.innerHTML = `
      <article class="summary-card"><p class="muted">Tasks Planned vs Completed</p><p class="mono">${planned} vs ${done}</p></article>
      <article class="summary-card"><p class="muted">Pomodoro Minutes</p><p class="mono">${workMins}</p></article>
      <article class="summary-card"><p class="muted">Most Productive Day</p><p class="mono">${mostProductive}</p></article>
      <article class="summary-card"><p class="muted">Tag Breakdown</p><p class="mono">${tagBreakdown || "No tagged tasks"}</p></article>
    `;

    return { dailyMap };
  }

  async function updateStreak(dailyMap) {
    const settings = await getSettings();
    const threshold = settings.streakCompletionThreshold || 80;
    const keys = Array.from(dailyMap.keys()).sort();
    let current = 0;
    let longest = settings.longestStreak || 0;

    for (let i = keys.length - 1; i >= 0; i -= 1) {
      const day = dailyMap.get(keys[i]);
      const rate = day.planned > 0 ? Math.round((day.completed / day.planned) * 100) : 0;
      if (day.planned > 0 && rate >= threshold) {
        current += 1;
      } else if (day.planned > 0) {
        break;
      }
    }
    longest = Math.max(longest, current);
    streakNode.textContent = `Streak: ${current} days`;
    await patchSettings({ currentStreak: current, longestStreak: longest });
  }

  async function refresh() {
    const filterTag = tagFilterNode.value || "all";
    const tasks = await getAllTasks();
    const priorities = new Set(tasks.map((task) => task.priority));
    tagFilterNode.innerHTML = `<option value="all">All</option>${Array.from(priorities)
      .map((priority) => `<option value="${priority}">${priority}</option>`)
      .join("")}`;
    if (filterTag !== "all" && priorities.has(filterTag)) {
      tagFilterNode.value = filterTag;
    }

    const dailyMap = await computeDaily(tasks);
    const start = addDays(toDateKey(), -365);
    const logs = await getPomodoroLogsByDateRange(start, toDateKey());
    renderMonth(dailyMap, tagFilterNode.value || "all");
    renderHeatmap(dailyMap, tagFilterNode.value || "all");
    renderSummary(tasks, logs, dailyMap);
    await updateStreak(dailyMap);
  }

  toggleHeatmapBtn.addEventListener("click", () => {
    showHeatmap = !showHeatmap;
    heatmapNode.hidden = !showHeatmap;
    monthViewNode.hidden = showHeatmap;
    toggleHeatmapBtn.textContent = showHeatmap ? "Month View" : "Heatmap View";
  });

  tagFilterNode.addEventListener("change", refresh);

  return {
    init: refresh,
    refresh,
  };
}
