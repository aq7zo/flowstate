import { getSettings, patchSettings } from "../db.js";

export function createSettingsModule({ onSettingsChanged }) {
  const defaultPriorityNode = document.querySelector("#default-priority-setting");
  const carryThresholdNode = document.querySelector("#carry-threshold-setting");
  const workNode = document.querySelector("#setting-work-min");
  const shortBreakNode = document.querySelector("#setting-short-break-min");
  const longBreakNode = document.querySelector("#setting-long-break-min");
  const sessionsNode = document.querySelector("#setting-sessions-before-long");
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
    workNode.value = String(settingsCache.workMin || 25);
    shortBreakNode.value = String(settingsCache.shortBreakMin || 5);
    longBreakNode.value = String(settingsCache.longBreakMin || 15);
    sessionsNode.value = String(settingsCache.sessionsBeforeLong || 4);
    renderCustomTags();
  }

  async function saveNumericSettings() {
    settingsCache = await patchSettings({
      defaultPriority: defaultPriorityNode.value,
      carryOverThreshold: Math.max(1, Number(carryThresholdNode.value) || 1),
      workMin: Math.max(1, Number(workNode.value) || 25),
      shortBreakMin: Math.max(1, Number(shortBreakNode.value) || 5),
      longBreakMin: Math.max(1, Number(longBreakNode.value) || 15),
      sessionsBeforeLong: Math.max(1, Number(sessionsNode.value) || 4),
    });
    await onSettingsChanged?.(settingsCache);
  }

  [defaultPriorityNode, carryThresholdNode, workNode, shortBreakNode, longBreakNode, sessionsNode].forEach((node) => {
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
