/**
 * PDVIO — Sons de notificação sintetizados via Web Audio API.
 * Totalmente procedurais, sem arquivos MP3.
 */

let _ctx: AudioContext | null = null;

function ctx(): AudioContext {
  if (!_ctx) _ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return _ctx;
}

export function unlockPdvioAudio() {
  try {
    const c = ctx();
    if (c.state === "suspended") c.resume().catch(() => {});
  } catch {}
}

/** Toca um único tom sintético com envelope ADSR. */
function tone(
  ac: AudioContext,
  freq: number,
  startAt: number,
  duration: number,
  gain: number,
  type: OscillatorType = "sine",
) {
  const osc = ac.createOscillator();
  const env = ac.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);

  const attack  = 0.008;
  const decay   = 0.06;
  const sustain = gain * 0.55;
  const release = duration * 0.6;

  env.gain.setValueAtTime(0, startAt);
  env.gain.linearRampToValueAtTime(gain, startAt + attack);
  env.gain.linearRampToValueAtTime(sustain, startAt + attack + decay);
  env.gain.setValueAtTime(sustain, startAt + duration - release);
  env.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  osc.connect(env);
  env.connect(ac.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

/**
 * Som de "garçom chamado" — acorde em Lá maior (A-C#-E) em arpegio ascendente.
 * Três notas suaves com timbre de sino + harmônico triângulo.
 * Duração total ~0.9 s.
 */
export function playWaiterCallSound() {
  try {
    const ac = ctx();
    if (ac.state === "suspended") {
      ac.resume().then(() => _playWaiterCall(ac)).catch(() => {});
    } else {
      _playWaiterCall(ac);
    }
  } catch {}
}

function _playWaiterCall(ac: AudioContext) {
  const now = ac.currentTime;
  const notes = [
    { freq: 880,  delay: 0,    dur: 0.50, g: 0.22 },  // A5
    { freq: 1109, delay: 0.13, dur: 0.55, g: 0.20 },  // C#6
    { freq: 1320, delay: 0.26, dur: 0.70, g: 0.18 },  // E6
  ];
  for (const n of notes) {
    tone(ac, n.freq, now + n.delay, n.dur, n.g, "sine");
    tone(ac, n.freq * 2, now + n.delay, n.dur * 0.4, n.g * 0.08, "triangle");
  }
}

/**
 * Som curto de "nova comanda" — dois bips ascendentes.
 */
export function playNewComandaSound() {
  try {
    const ac = ctx();
    if (ac.state === "suspended") {
      ac.resume().then(() => _playNewComanda(ac)).catch(() => {});
    } else {
      _playNewComanda(ac);
    }
  } catch {}
}

function _playNewComanda(ac: AudioContext) {
  const now = ac.currentTime;
  tone(ac, 660, now,        0.18, 0.25, "sine");
  tone(ac, 880, now + 0.20, 0.25, 0.22, "sine");
}
