import { addPomodoroLog, patchSettings } from "../db.js";
import { toDateKey } from "../utils/dates.js";
import { fileToDataUrl, playDataUrl, stopAudio } from "../utils/audio.js";

function formatClock(seconds) {
  const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

export function createPomodoroModule({ settings }) {
  const phaseNode = document.querySelector("#timer-phase");
  const displayNode = document.querySelector("#timer-display");
  const sessionNode = document.querySelector("#timer-session");
  const startBtn = document.querySelector("#timer-start");
  const pauseBtn = document.querySelector("#timer-pause");
  const resetBtn = document.querySelector("#timer-reset");
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

  function updateUi() {
    phaseNode.textContent = phase;
    displayNode.textContent = formatClock(secondsLeft);
    sessionNode.textContent = `Session ${sessionCount} of ${mutableSettings.sessionsBeforeLong}`;
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

  startBtn.addEventListener("click", start);
  pauseBtn.addEventListener("click", pause);
  resetBtn.addEventListener("click", reset);

  alarmVolumeInput.value = String(settings.alarmVolume);
  alarmFadeInput.checked = Boolean(settings.alarmFade);
  alarmTypeNode.value = settings.alarmType || "file";
  alarmYoutubeNode.value = settings.alarmUrl || "";

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

  updateUi();
}
