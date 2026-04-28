let cachedCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (cachedCtx) return cachedCtx;
  const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  try {
    cachedCtx = new Ctor();
  } catch {
    cachedCtx = null;
  }
  return cachedCtx;
}

export function playBeep(opts?: { freq?: number; duration?: number; volume?: number }) {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = opts?.freq ?? 880;
    gain.gain.value = opts?.volume ?? 0.18;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    const dur = (opts?.duration ?? 200) / 1000;
    gain.gain.setValueAtTime(opts?.volume ?? 0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.start(now);
    osc.stop(now + dur);
  } catch {
    // ignore
  }
}

export function playLowStockAlert() {
  playBeep({ freq: 880, duration: 180, volume: 0.2 });
  setTimeout(() => playBeep({ freq: 660, duration: 220, volume: 0.2 }), 200);
}
