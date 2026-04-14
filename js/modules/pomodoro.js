import { addPomodoroLog, patchSettings } from "../db.js";
import { toDateKey } from "../utils/dates.js";
import { fileToDataUrl, playDataUrl, stopAudio } from "../utils/audio.js";

function formatClock(seconds) {
  const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

export function createPomodoroModule({ settings }) {
  const focusPanelNode = document.querySelector(".focus-single");
  const phaseNode = document.querySelector("#timer-phase");
  const displayNode = document.querySelector("#timer-display");
  const sessionNode = document.querySelector("#timer-session");
  const startBtn = document.querySelector("#timer-start");
  const pauseBtn = document.querySelector("#timer-pause");
  const toggleBtn = document.querySelector("#timer-toggle");
  const resetBtn = document.querySelector("#timer-reset");
  const settingsToggleBtn = document.querySelector("#focus-settings-toggle");
  const settingsBackBtn = document.querySelector("#focus-settings-back");
  const timerViewNode = document.querySelector("#focus-timer-view");
  const settingsViewNode = document.querySelector("#focus-settings-view");
  const pomoWorkNode = document.querySelector("#pomo-work-min");
  const pomoShortBreakNode = document.querySelector("#pomo-short-break-min");
  const pomoLongBreakNode = document.querySelector("#pomo-long-break-min");
  const pomoSessionsNode = document.querySelector("#pomo-sessions-before-long");
  const alarmForm = document.querySelector("#alarm-form");
  const alarmFileInput = document.querySelector("#alarm-file");
  const alarmTypeNode = document.querySelector("#alarm-type");
  const alarmYoutubeNode = document.querySelector("#alarm-youtube-url");
  const alarmVolumeInput = document.querySelector("#alarm-volume");
  const alarmFadeInput = document.querySelector("#alarm-fade");
  const alarmPreviewBtn = document.querySelector("#alarm-preview");
  const alarmStatusNode = document.querySelector("#alarm-status");

  let phase = "IDLE";
  let secondsLeft = settings.workMin * 60;
  let timerId = null;
  let sessionCount = 0;
  let lastTickStartedAt = null;
  let mutableSettings = { ...settings };
  let isTransitioning = false;
  let shouldRun = false;
  let youtubeFrame = null;

  function syncPanelMinHeightToSettings() {
    if (!focusPanelNode || !settingsViewNode) return;
    const wasHidden = settingsViewNode.hidden;
    const previousVisibility = settingsViewNode.style.visibility;
    const previousPosition = settingsViewNode.style.position;
    const previousPointerEvents = settingsViewNode.style.pointerEvents;
    const previousInset = settingsViewNode.style.inset;

    if (wasHidden) {
      settingsViewNode.hidden = false;
      settingsViewNode.style.visibility = "hidden";
      settingsViewNode.style.position = "absolute";
      settingsViewNode.style.pointerEvents = "none";
      settingsViewNode.style.inset = "0 auto auto 0";
    }

    const headerHeight = focusPanelNode.querySelector(".focus-panel-header")?.offsetHeight || 0;
    const settingsHeight = settingsViewNode.scrollHeight;
    const panelPadding = 24;
    const targetMinHeight = Math.ceil(headerHeight + settingsHeight + panelPadding);
    focusPanelNode.style.setProperty("--focus-panel-min-height", `${targetMinHeight}px`);

    if (wasHidden) {
      settingsViewNode.hidden = true;
      settingsViewNode.style.visibility = previousVisibility;
      settingsViewNode.style.position = previousPosition;
      settingsViewNode.style.pointerEvents = previousPointerEvents;
      settingsViewNode.style.inset = previousInset;
    }
  }

  function updateUi() {
    phaseNode.textContent = phase;
    displayNode.textContent = formatClock(secondsLeft);
    sessionNode.textContent = `Session ${sessionCount} of ${mutableSettings.sessionsBeforeLong}`;
    if (toggleBtn) {
      toggleBtn.textContent = timerId ? "Pause" : "Start";
      toggleBtn.setAttribute("aria-pressed", timerId ? "true" : "false");
    }
  }

  function stopTicker() {
    if (!timerId) return;
    window.clearInterval(timerId);
    timerId = null;
  }

  function stopYoutubeAudio() {
    if (youtubeFrame) {
      youtubeFrame.remove();
      youtubeFrame = null;
    }
  }

  async function onPhaseComplete() {
    const spentMinutes = Math.max(
      1,
      Math.round((Date.now() - (lastTickStartedAt || Date.now())) / 60000) || (phase === "WORK" ? mutableSettings.workMin : mutableSettings.shortBreakMin),
    );

    if (phase === "WORK") {
      sessionCount += 1;
      await addPomodoroLog({
        date: toDateKey(),
        duration: spentMinutes,
        type: "work",
        completed: true,
      });
      const longBreakDue = sessionCount > 0 && sessionCount % mutableSettings.sessionsBeforeLong === 0;
      phase = longBreakDue ? "LONG_BREAK" : "BREAK";
      secondsLeft = (longBreakDue ? mutableSettings.longBreakMin : mutableSettings.shortBreakMin) * 60;
    } else {
      await addPomodoroLog({
        date: toDateKey(),
        duration: spentMinutes,
        type: phase === "LONG_BREAK" ? "long_break" : "break",
        completed: true,
      });
      phase = "WORK";
      secondsLeft = mutableSettings.workMin * 60;
    }

    if (mutableSettings.alarmType === "youtube" && mutableSettings.alarmUrl) {
        const videoId = mutableSettings.alarmUrl.split("v=")[1]?.split("&")[0];
        if (videoId) {
          stopYoutubeAudio();
          youtubeFrame = document.createElement("iframe");
          youtubeFrame.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
          youtubeFrame.style.visibility = "hidden";
          youtubeFrame.style.position = "absolute";
          youtubeFrame.setAttribute("aria-hidden", "true");
          document.body.append(youtubeFrame);
        }
    } else if (mutableSettings.alarmType === "file" && mutableSettings.alarmFile) {
      await playDataUrl(mutableSettings.alarmFile, mutableSettings.alarmVolume, mutableSettings.alarmFade);
    }
    updateUi();
  }

  function restartTicker() {
    stopTicker();
    lastTickStartedAt = Date.now();
    timerId = window.setInterval(tick, 1000);
  }

  function tick() {
    if (isTransitioning) return;
    secondsLeft -= 1;
    if (secondsLeft <= 0) {
      isTransitioning = true;
      stopTicker();
      onPhaseComplete().finally(() => {
        isTransitioning = false;
        if (shouldRun && phase !== "IDLE") {
          restartTicker();
        }
      });
      return;
    }
    updateUi();
  }

  function start() {
    if (timerId) return;
    shouldRun = true;
    if (phase === "IDLE") {
      phase = "WORK";
      secondsLeft = mutableSettings.workMin * 60;
    }
    stopAudio();
    restartTicker();
    updateUi();
  }

  function pause() {
    shouldRun = false;
    stopTicker();
  }

  function reset() {
    shouldRun = false;
    stopTicker();
    stopAudio();
    stopYoutubeAudio();
    isTransitioning = false;
    phase = "IDLE";
    secondsLeft = mutableSettings.workMin * 60;
    updateUi();
  }

  if (startBtn) startBtn.addEventListener("click", start);
  if (pauseBtn) pauseBtn.addEventListener("click", pause);
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      if (timerId) {
        pause();
      } else {
        start();
      }
    });
  }
  if (resetBtn) resetBtn.addEventListener("click", reset);

  if (pomoWorkNode) pomoWorkNode.value = String(mutableSettings.workMin || 25);
  if (pomoShortBreakNode) pomoShortBreakNode.value = String(mutableSettings.shortBreakMin || 5);
  if (pomoLongBreakNode) pomoLongBreakNode.value = String(mutableSettings.longBreakMin || 15);
  if (pomoSessionsNode) pomoSessionsNode.value = String(mutableSettings.sessionsBeforeLong || 4);

  async function savePomoSettings() {
    mutableSettings = await patchSettings({
      workMin: Math.max(1, Number(pomoWorkNode?.value) || 25),
      shortBreakMin: Math.max(1, Number(pomoShortBreakNode?.value) || 5),
      longBreakMin: Math.max(1, Number(pomoLongBreakNode?.value) || 15),
      sessionsBeforeLong: Math.max(1, Number(pomoSessionsNode?.value) || 4),
    });
    if (phase === "IDLE") {
      secondsLeft = mutableSettings.workMin * 60;
      updateUi();
    }
    syncPanelMinHeightToSettings();
  }

  [pomoWorkNode, pomoShortBreakNode, pomoLongBreakNode, pomoSessionsNode].forEach((node) => {
    if (node) node.addEventListener("change", savePomoSettings);
  });

  if (alarmVolumeInput) alarmVolumeInput.value = String(settings.alarmVolume);
  if (alarmFadeInput) alarmFadeInput.checked = Boolean(settings.alarmFade);
  if (alarmTypeNode) alarmTypeNode.value = settings.alarmType || "file";
  if (alarmYoutubeNode) alarmYoutubeNode.value = settings.alarmUrl || "";

  if (alarmForm) {
    alarmForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const selected = alarmFileInput.files?.[0];
      let nextFile = mutableSettings.alarmFile;
      if (selected) {
        nextFile = await fileToDataUrl(selected);
      }
      mutableSettings = await patchSettings({
        alarmType: alarmTypeNode.value,
        alarmFile: nextFile,
        alarmUrl: alarmYoutubeNode.value.trim(),
        alarmVolume: Number(alarmVolumeInput.value),
        alarmFade: alarmFadeInput.checked,
      });
      alarmStatusNode.textContent = "Alarm saved locally.";
    });
  }

  if (alarmPreviewBtn) {
    alarmPreviewBtn.addEventListener("click", async () => {
      try {
        if (alarmTypeNode.value === "youtube") {
          const videoId = alarmYoutubeNode.value.split("v=")[1]?.split("&")[0];
          if (!videoId) {
            alarmStatusNode.textContent = "Add a valid YouTube URL first.";
            return;
          }
          stopYoutubeAudio();
          youtubeFrame = document.createElement("iframe");
          youtubeFrame.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
          youtubeFrame.style.visibility = "hidden";
          youtubeFrame.style.position = "absolute";
          youtubeFrame.setAttribute("aria-hidden", "true");
          document.body.append(youtubeFrame);
          alarmStatusNode.textContent = "YouTube preview playing…";
          return;
        }
        if (!mutableSettings.alarmFile) {
          alarmStatusNode.textContent = "Add and save an audio file first.";
          return;
        }
        await playDataUrl(mutableSettings.alarmFile, Number(alarmVolumeInput.value), alarmFadeInput.checked);
        alarmStatusNode.textContent = "Preview playing…";
      } catch (_error) {
        alarmStatusNode.textContent = "Add and save an audio file first.";
      }
    });
  }

  if (settingsToggleBtn && timerViewNode && settingsViewNode && settingsBackBtn) {
    const openSettings = () => {
      timerViewNode.hidden = true;
      settingsViewNode.hidden = false;
      settingsBackBtn.hidden = false;
      settingsToggleBtn.hidden = true;
      settingsToggleBtn.setAttribute("aria-expanded", "true");
    };

    const closeSettings = () => {
      timerViewNode.hidden = false;
      settingsViewNode.hidden = true;
      settingsBackBtn.hidden = true;
      settingsToggleBtn.hidden = false;
      settingsToggleBtn.setAttribute("aria-expanded", "false");
    };

    settingsToggleBtn.addEventListener("click", openSettings);
    settingsBackBtn.addEventListener("click", closeSettings);
  }

  syncPanelMinHeightToSettings();
  window.addEventListener("resize", syncPanelMinHeightToSettings);

  updateUi();
}
