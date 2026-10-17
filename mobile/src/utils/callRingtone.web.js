let audioContext = null;
let chimeTimer = null;
const activeOscillators = new Set();

const getAudioContext = () => {
  if (!audioContext && typeof globalThis.AudioContext === "function") {
    audioContext = new globalThis.AudioContext();
  }
  return audioContext;
};

const playChime = (context) => {
  const startAt = context.currentTime;
  [523.25, 659.25].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.16, startAt + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.65 + index * 0.08);
    oscillator.connect(gain);
    gain.connect(context.destination);
    activeOscillators.add(oscillator);
    oscillator.onended = () => activeOscillators.delete(oscillator);
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.75 + index * 0.08);
  });
};

export const prepareIncomingRingtone = () => {
  if (typeof globalThis.document === "undefined") return undefined;
  const unlock = () => getAudioContext()?.resume().catch(() => {});
  globalThis.document.addEventListener("pointerdown", unlock, { once: true });
  globalThis.document.addEventListener("keydown", unlock, { once: true });
  return () => {
    globalThis.document.removeEventListener("pointerdown", unlock);
    globalThis.document.removeEventListener("keydown", unlock);
  };
};

export const startIncomingRingtone = () => {
  if (chimeTimer) return;
  const context = getAudioContext();
  if (!context) return;
  context.resume().then(() => playChime(context)).catch(() => {});
  chimeTimer = globalThis.setInterval(() => {
    if (context.state === "running") playChime(context);
  }, 2500);
};

export const stopIncomingRingtone = () => {
  if (chimeTimer) globalThis.clearInterval(chimeTimer);
  chimeTimer = null;
  activeOscillators.forEach((oscillator) => {
    try {
      oscillator.stop();
    } catch {}
  });
  activeOscillators.clear();
};