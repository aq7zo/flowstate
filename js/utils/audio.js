let activeAudio = null;
let fadeInterval = null;

export async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export function stopAudio() {
  if (fadeInterval) {
    window.clearInterval(fadeInterval);
    fadeInterval = null;
  }

  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = null;
  }
}

export async function playDataUrl(dataUrl, volume = 0.8, fade = false) {
  if (!dataUrl) {
    return;
  }

  stopAudio();
  const audio = new Audio(dataUrl);
  audio.volume = fade ? 0 : volume;
  activeAudio = audio;
  await audio.play();

  if (!fade) {
    return;
  }

  const target = Math.max(0, Math.min(1, volume));
  const steps = 16;
  const stepSize = target / steps;
  let currentStep = 0;

  fadeInterval = window.setInterval(() => {
    currentStep += 1;
    audio.volume = Math.min(target, currentStep * stepSize);
    if (currentStep >= steps) {
      window.clearInterval(fadeInterval);
      fadeInterval = null;
    }
  }, 500);
}
