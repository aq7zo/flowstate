let activeAudio: HTMLAudioElement | null = null;
let fadeInterval: ReturnType<typeof setInterval> | null = null;

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export function stopAudio(): void {
  if (fadeInterval) {
    clearInterval(fadeInterval);
    fadeInterval = null;
  }
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = null;
  }
}

export async function playDataUrl(
  dataUrl: string,
  volume = 0.8,
  fade = false
): Promise<void> {
  if (!dataUrl) return;

  stopAudio();
  const audio = new Audio(dataUrl);
  audio.volume = fade ? 0 : volume;
  activeAudio = audio;
  await audio.play();

  if (!fade) return;

  const target = Math.max(0, Math.min(1, volume));
  const steps = 16;
  const stepSize = target / steps;
  let currentStep = 0;

  fadeInterval = setInterval(() => {
    currentStep += 1;
    audio.volume = Math.min(target, currentStep * stepSize);
    if (currentStep >= steps) {
      clearInterval(fadeInterval!);
      fadeInterval = null;
    }
  }, 500);
}
