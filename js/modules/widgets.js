import { getSettings } from "../db.js";

const SYMBOL_MAP = {
  clearsky_day: "☀️",
  clearsky_night: "🌙",
  fair_day: "🌤️",
  fair_night: "🌤️",
  partlycloudy_day: "⛅",
  partlycloudy_night: "⛅",
  cloudy: "☁️",
  rain: "🌧️",
  heavyrain: "⛈️",
  lightrain: "🌦️",
  lightrainshowers_day: "🌦️",
  lightrainshowers_night: "🌦️",
  rainshowers_day: "🌧️",
  rainshowers_night: "🌧️",
  heavyrainshowers_day: "⛈️",
  heavyrainshowers_night: "⛈️",
  snow: "❄️",
  lightsnow: "🌨️",
  heavysnow: "❄️",
  fog: "🌫️",
  sleet: "🌨️",
};

function symbolToEmoji(code) {
  if (!code) return "🌤️";
  for (const [key, emoji] of Object.entries(SYMBOL_MAP)) {
    if (code.startsWith(key)) return emoji;
  }
  return "🌤️";
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function windChill(temp, wind) {
  if (temp > 10 || wind < 1.3) return Math.round(temp);
  return Math.round(
    13.12 +
      0.6215 * temp -
      11.37 * Math.pow(wind * 3.6, 0.16) +
      0.3965 * temp * Math.pow(wind * 3.6, 0.16),
  );
}

function formatTime(date) {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function buildCalendarDotGrid(now) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (firstDay + 6) % 7; // Mon=0

  let html = '<div class="cal-dot-grid">';
  for (let i = 0; i < offset; i++) {
    html += '<span class="cal-dot cal-dot-empty"></span>';
  }
  for (let d = 1; d <= daysInMonth; d++) {
    if (d < today) {
      html += '<span class="cal-dot cal-dot-past"></span>';
    } else if (d === today) {
      html += '<span class="cal-dot cal-dot-today"></span>';
    } else {
      html += '<span class="cal-dot cal-dot-future"></span>';
    }
  }
  html += "</div>";
  return html;
}

function buildDateWidget(panel) {
  const now = new Date();
  const dayName = now.toLocaleDateString(undefined, { weekday: "long" });
  const fullDate = now.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  const weekNum = getWeekNumber(now);

  panel.innerHTML = `
    <div class="widget-head">
      <span class="widget-label muted">Date</span>
      <span class="widget-dots">···</span>
    </div>
    <div class="widget-date-body">
      <div class="widget-date-text">
        <p class="widget-dayname">${dayName}</p>
        <p class="widget-fulldate">${fullDate}</p>
        <p class="widget-week">Week ${weekNum}</p>
        <p class="widget-time" id="widget-live-time">${formatTime(now)}</p>
      </div>
      <div class="widget-date-dots">
        ${buildCalendarDotGrid(now)}
      </div>
    </div>
  `;

  const timeEl = panel.querySelector("#widget-live-time");
  setInterval(() => {
    timeEl.textContent = formatTime(new Date());
  }, 1000);
}

async function fetchWeather(lat, lon) {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Flowstate/1.0 flowstate-app@github.com" },
  });
  if (!res.ok) throw new Error(`Weather API ${res.status}`);
  return res.json();
}

function parseForecastDays(timeseries) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const dayMap = new Map();

  for (const entry of timeseries) {
    const dateStr = entry.time.slice(0, 10);
    if (dateStr <= todayStr) continue;
    if (!dayMap.has(dateStr)) dayMap.set(dateStr, []);
    dayMap.get(dateStr).push(entry);
  }

  const days = [];
  for (const [dateStr, entries] of dayMap) {
    if (days.length >= 4) break;

    const temps = entries.map((e) => e.data.instant.details.air_temperature);
    const winds = entries.map((e) => e.data.instant.details.wind_speed);

    let noonEntry = entries[0];
    let minDiff = Infinity;
    for (const e of entries) {
      const diff = Math.abs(new Date(e.time).getHours() - 12);
      if (diff < minDiff) {
        minDiff = diff;
        noonEntry = e;
      }
    }

    const precipEntries = entries.filter(
      (e) => e.data.next_1_hours?.details?.precipitation_amount != null,
    );
    const totalPrecip = precipEntries.reduce(
      (sum, e) => sum + (e.data.next_1_hours.details.precipitation_amount || 0),
      0,
    );

    const symbolCode =
      noonEntry.data.next_1_hours?.summary?.symbol_code ||
      noonEntry.data.next_6_hours?.summary?.symbol_code ||
      "";

    const d = new Date(dateStr + "T12:00:00");
    days.push({
      dayName: d.toLocaleDateString(undefined, { weekday: "long" }),
      low: Math.round(Math.min(...temps)),
      high: Math.round(Math.max(...temps)),
      emoji: symbolToEmoji(symbolCode),
      rain: Math.round(totalPrecip * 10) / 10,
      wind: Math.round((winds.reduce((a, b) => a + b, 0) / winds.length) * 10) / 10,
    });
  }

  return days;
}

function buildWeatherWidget(panel, settings) {
  const lat = settings.weatherLat;
  const lon = settings.weatherLon;
  const city = settings.weatherCity || "Your City";

  if (!lat || !lon) {
    panel.innerHTML = `
      <div class="widget-head">
        <span class="widget-label muted">Weather</span>
        <span class="widget-dots">···</span>
      </div>
      <div class="widget-weather-empty">
        <p class="muted">Set your location in <a href="./settings.html">Settings</a> to see weather.</p>
      </div>
    `;
    return;
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  panel.innerHTML = `
    <div class="widget-head">
      <span class="widget-label muted">Weather</span>
      <span class="widget-dots">···</span>
    </div>
    <div class="weather-slides">
      <div class="weather-slide" id="weather-slide-0">
        <p class="muted">Loading weather…</p>
      </div>
      <div class="weather-slide" id="weather-slide-1" hidden>
        <p class="muted">Loading forecast…</p>
      </div>
    </div>
    <div class="widget-foot">
      <span class="widget-foot-text">Forecast from MET.no</span>
      <span class="weather-pager">
        <button type="button" class="weather-pager-dot active" data-slide="0" aria-label="Current conditions"></button>
        <button type="button" class="weather-pager-dot" data-slide="1" aria-label="4-day forecast"></button>
      </span>
      <span class="widget-foot-text" id="weather-updated-at">Updating…</span>
    </div>
  `;

  const slide0 = panel.querySelector("#weather-slide-0");
  const slide1 = panel.querySelector("#weather-slide-1");
  const dots = panel.querySelectorAll(".weather-pager-dot");
  const updatedEl = panel.querySelector("#weather-updated-at");

  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      const idx = Number(dot.dataset.slide);
      slide0.hidden = idx !== 0;
      slide1.hidden = idx !== 1;
      dots.forEach((d) => d.classList.toggle("active", d === dot));
    });
  });

  fetchWeather(lat, lon)
    .then((data) => {
      const ts = data.properties.timeseries;
      if (!ts || ts.length === 0) {
        slide0.innerHTML = '<p class="muted">No data available.</p>';
        return;
      }

      const current = ts[0];
      const det = current.data.instant.details;
      const temp = Math.round(det.air_temperature);
      const wind = det.wind_speed;
      const feelsLike = windChill(det.air_temperature, wind);
      const precip = current.data.next_1_hours?.details?.precipitation_amount ?? 0;
      const symbol =
        current.data.next_1_hours?.summary?.symbol_code ||
        current.data.next_6_hours?.summary?.symbol_code ||
        "";

      slide0.innerHTML = `
        <div class="weather-current">
          <div class="weather-current-left">
            <p class="weather-city">${city}</p>
            <p class="weather-date muted">${dateStr}</p>
            <div class="weather-temp-row">
              <span class="weather-emoji">${symbolToEmoji(symbol)}</span>
              <span class="weather-temp">${temp}°</span>
            </div>
          </div>
          <div class="weather-current-right">
            <p><span class="muted">Feels like</span> ${feelsLike}°</p>
            <p><span class="muted">Rain</span> ${precip} mm</p>
            <p><span class="muted">Wind</span> ${wind} m/s</p>
          </div>
        </div>
      `;

      const forecastDays = parseForecastDays(ts);
      if (forecastDays.length > 0) {
        slide1.innerHTML = `<div class="weather-forecast">${forecastDays
          .map(
            (d) => `
          <div class="forecast-row">
            <span class="forecast-day">${d.dayName}</span>
            <span class="forecast-emoji">${d.emoji}</span>
            <span class="forecast-temps"><span class="muted">${d.low}°</span> / <strong>${d.high}°</strong></span>
            <span class="forecast-rain muted">${d.rain} mm</span>
            <span class="forecast-wind muted">${d.wind} m/s</span>
          </div>`,
          )
          .join("")}</div>`;
      } else {
        slide1.innerHTML = '<p class="muted">No forecast data.</p>';
      }

      updatedEl.textContent = `Updated at ${formatTime(new Date())}`;
    })
    .catch(() => {
      slide0.innerHTML = '<p class="muted">Unable to load weather.</p>';
    });
}

export async function initWidgets(container) {
  const settings = await getSettings();

  const row = document.createElement("div");
  row.className = "widgets-row";

  const datePanel = document.createElement("div");
  datePanel.className = "panel widget-panel";

  const weatherPanel = document.createElement("div");
  weatherPanel.className = "panel widget-panel";

  row.append(datePanel, weatherPanel);
  container.appendChild(row);

  buildDateWidget(datePanel);
  buildWeatherWidget(weatherPanel, settings);
}
