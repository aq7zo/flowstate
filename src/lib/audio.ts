let activeAudio: HTMLAudioElement | null = null;
let fadeInterval: ReturnType<typeof setInterval> | null = null;
let activeOscillator: OscillatorNode | null = null;
let activeAudioContext: AudioContext | null = null;

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
  if (activeOscillator) {
    activeOscillator.stop();
    activeOscillator.disconnect();
    activeOscillator = null;
  }
  if (activeAudioContext) {
    activeAudioContext.close();
    activeAudioContext = null;
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

export async function playPresetAlarm(
  preset: "digital" | "soft-bell" | "uplift",
  volume = 0.8
): Promise<void> {
  stopAudio();
  const context = new AudioContext();
  const gain = context.createGain();
  gain.gain.value = Math.max(0, Math.min(1, volume)) * 0.2;
  gain.connect(context.destination);

  const osc = context.createOscillator();
  osc.type = preset === "soft-bell" ? "sine" : "triangle";
  osc.frequency.value =
    preset === "digital" ? 880 : preset === "soft-bell" ? 660 : 520;
  osc.connect(gain);
  osc.start();

  if (preset === "uplift") {
    osc.frequency.setValueAtTime(520, context.currentTime);
    osc.frequency.linearRampToValueAtTime(880, context.currentTime + 0.7);
  }

  activeOscillator = osc;
  activeAudioContext = context;
  setTimeout(() => {
    stopAudio();
  }, 900);
}
