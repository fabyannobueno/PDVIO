/**
 * PDVIO — Notificação sonora sintetizada via Web Audio API.
 * Zero dependências externas, zero arquivos MP3.
 *
 * playWaiterCallSound() — sino premium (parciais reais de sino metálico)
 * playNewComandaSound() — dois bips rápidos ascendentes
 * unlockPdvioAudio()    — chame em qualquer interação do usuário para
 *                         pré-desbloquear o AudioContext (política do browser)
 */

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!_ctx) _ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return _ctx;
}

export function unlockPdvioAudio() {
  try {
    const c = getCtx();
    if (c.state === "suspended") c.resume().catch(() => {});
  } catch {}
}

/** Toca um parcial sintético com envelope attack → exponential decay. */
function partial(
  ac: AudioContext,
  freq: number,
  startAt: number,
  dur: number,
  peakGain: number,
  type: OscillatorType = "sine",
  attackMs = 6,
) {
  const osc = ac.createOscillator();
  const env = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const a = attackMs / 1000;
  env.gain.setValueAtTime(0, startAt);
  env.gain.linearRampToValueAtTime(peakGain, startAt + a);
  env.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
  osc.connect(env);
  env.connect(ac.destination);
  osc.start(startAt);
  osc.stop(startAt + dur + 0.05);
}

/**
 * PDVIO Premium Bell — sino metálico com série de parciais reais:
 *   Hum 0.5× · Prime 1× · Tierce 1.2× · Quint 1.5× · Nominal 2× · Superquint 2.75×
 * + transiente brilhante + shimmer duplo (80ms / 160ms echo)
 * Ressonância natural de ~1.4 s.
 */
function _playBell(ac: AudioContext) {
  const root = 880; // A5
  const now  = ac.currentTime;

  const master = ac.createGain();
  master.gain.value = 0.82;
  master.connect(ac.destination);

  function p(
    freq: number, startAt: number, dur: number, gain: number,
    type: OscillatorType = "sine", atkMs = 6,
  ) {
    const osc = ac.createOscillator();
    const env = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const a = atkMs / 1000;
    env.gain.setValueAtTime(0, startAt);
    env.gain.linearRampToValueAtTime(gain, startAt + a);
    env.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
    osc.connect(env);
    env.connect(master);
    osc.start(startAt);
    osc.stop(startAt + dur + 0.05);
  }

  // Parciais da campânula
  p(root * 0.50, now, 0.25, 0.10);
  p(root * 1.00, now, 1.40, 0.30);
  p(root * 1.20, now, 1.10, 0.14);
  p(root * 1.50, now, 0.90, 0.18);
  p(root * 2.00, now, 0.65, 0.10);
  p(root * 2.75, now, 0.35, 0.04);

  // Transiente brilhante
  p(root * 4.0, now, 0.055, 0.12, "triangle", 2);

  // Shimmer duplo (eco leve)
  const delays = [0.080, 0.160];
  const gains  = [0.18,  0.10];
  for (let i = 0; i < 2; i++) {
    const d = delays[i], g = gains[i], f = 1 - i * 0.3;
    p(root,        now + d, 1.20 * f, g * 0.30);
    p(root * 1.50, now + d, 0.80 * f, g * 0.18);
    p(root * 2.00, now + d, 0.50 * f, g * 0.10);
  }
}

export function playWaiterCallSound() {
  try {
    const ac = getCtx();
    if (ac.state === "suspended") {
      ac.resume().then(() => _playBell(ac)).catch(() => {});
    } else {
      _playBell(ac);
    }
  } catch {}
}

/** Dois bips rápidos ascendentes — nova comanda / novo pedido. */
function _playTwoBips(ac: AudioContext) {
  const now = ac.currentTime;
  partial(ac, 660, now,        0.18, 0.25, "sine");
  partial(ac, 880, now + 0.20, 0.25, 0.22, "sine");
}

export function playNewComandaSound() {
  try {
    const ac = getCtx();
    if (ac.state === "suspended") {
      ac.resume().then(() => _playTwoBips(ac)).catch(() => {});
    } else {
      _playTwoBips(ac);
    }
  } catch {}
}
