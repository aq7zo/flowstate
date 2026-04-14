import { getSettings, patchSettings } from "../db.js";

export function createSettingsModule({ onSettingsChanged }) {
  const defaultPriorityNode = document.querySelector("#default-priority-setting");
  const carryThresholdNode = document.querySelector("#carry-threshold-setting");
  const tomorrowPromptTimeNode = document.querySelector("#tomorrow-prompt-time-setting");
  const tomorrowPromptEnabledNode = document.querySelector("#tomorrow-prompt-enabled-setting");
  const dailyQuotaNode = document.querySelector("#daily-quota-setting");
  const weatherCityNode = document.querySelector("#weather-city-setting");
  const weatherLatNode = document.querySelector("#weather-lat-setting");
  const weatherLonNode = document.querySelector("#weather-lon-setting");
  const customTagForm = document.querySelector("#custom-tag-form");
  const customTagNameNode = document.querySelector("#custom-tag-name");
  const customTagColorNode = document.querySelector("#custom-tag-color");
  const customTagListNode = document.querySelector("#custom-tag-list");

  let settingsCache = null;

  function renderCustomTags() {
    customTagListNode.innerHTML = "";
    const tags = settingsCache.customTags || [];
    tags.forEach((tag, index) => {
      const li = document.createElement("li");
      li.className = "task-item";
      li.style.borderLeftColor = tag.color;
      li.innerHTML = `<p class="task-title">${tag.name}</p><p class="chip mono">${tag.color}</p>`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-btn";
      remove.setAttribute("aria-label", `Delete ${tag.name}`);
      remove.textContent = "✕";
      remove.addEventListener("click", async () => {
        const next = tags.filter((_, tagIndex) => tagIndex !== index);
        settingsCache = await patchSettings({ customTags: next });
        renderCustomTags();
      });
      li.append(remove);
      customTagListNode.append(li);
    });
  }

  async function load() {
    settingsCache = await getSettings();
    defaultPriorityNode.value = settingsCache.defaultPriority || "medium";
    carryThresholdNode.value = String(settingsCache.carryOverThreshold || 1);
    dailyQuotaNode.value = String((settingsCache.dailyQuota || 480) / 60);
    tomorrowPromptTimeNode.value = settingsCache.tomorrowPromptTime || "20:30";
    tomorrowPromptEnabledNode.checked = Boolean(settingsCache.tomorrowPromptEnabled);
    weatherCityNode.value = settingsCache.weatherCity || "";
    weatherLatNode.value = settingsCache.weatherLat ?? "";
    weatherLonNode.value = settingsCache.weatherLon ?? "";
    renderCustomTags();
  }

  async function saveNumericSettings() {
    settingsCache = await patchSettings({
      defaultPriority: defaultPriorityNode.value,
      carryOverThreshold: Math.max(1, Number(carryThresholdNode.value) || 1),
      dailyQuota: Math.max(60, Math.round((Number(dailyQuotaNode.value) || 8) * 60)),
      tomorrowPromptTime: tomorrowPromptTimeNode.value || "20:30",
      tomorrowPromptEnabled: tomorrowPromptEnabledNode.checked,
      weatherCity: weatherCityNode.value.trim(),
      weatherLat: weatherLatNode.value ? Number(weatherLatNode.value) : null,
      weatherLon: weatherLonNode.value ? Number(weatherLonNode.value) : null,
    });
    await onSettingsChanged?.(settingsCache);
  }

  [defaultPriorityNode, carryThresholdNode, dailyQuotaNode, tomorrowPromptTimeNode, tomorrowPromptEnabledNode, weatherCityNode, weatherLatNode, weatherLonNode].forEach((node) => {
    node.addEventListener("change", saveNumericSettings);
  });

  customTagForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = customTagNameNode.value.trim();
    if (!name) return;
    const next = [...(settingsCache.customTags || []), { name, color: customTagColorNode.value }];
    settingsCache = await patchSettings({ customTags: next });
    customTagNameNode.value = "";
    renderCustomTags();
    await onSettingsChanged?.(settingsCache);
  });

  return {
    init: load,
  };
}
