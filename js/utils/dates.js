export function toDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function yesterdayKey(referenceKey) {
  const [year, month, day] = referenceKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 1);
  return toDateKey(date);
}

export function formatLongDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function minutesToClock(totalMinutes) {
  const safe = Math.max(0, Math.floor(totalMinutes));
  const mins = safe % 60;
  const hours = Math.floor(safe / 60);
  if (hours < 1) {
    return `${mins}m`;
  }
  return `${hours}h ${mins}m`;
}
