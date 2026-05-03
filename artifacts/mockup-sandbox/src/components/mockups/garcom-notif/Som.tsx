import { useState } from "react";

function playPdvioWaiterSound() {
  try {
    const ac = new (window.AudioContext || (window as any).webkitAudioContext)();

    function tone(
      freq: number, startAt: number, dur: number, gain: number,
      type: OscillatorType = "sine",
    ) {
      const osc = ac.createOscillator();
      const env = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startAt);
      const attack = 0.008, decay = 0.06, sustain = gain * 0.55, release = dur * 0.6;
      env.gain.setValueAtTime(0, startAt);
      env.gain.linearRampToValueAtTime(gain, startAt + attack);
      env.gain.linearRampToValueAtTime(sustain, startAt + attack + decay);
      env.gain.setValueAtTime(sustain, startAt + dur - release);
      env.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
      osc.connect(env);
      env.connect(ac.destination);
      osc.start(startAt);
      osc.stop(startAt + dur + 0.05);
    }

    const now = ac.currentTime;
    tone(880,  now,        0.50, 0.22, "sine");
    tone(1760, now,        0.20, 0.035, "triangle");
    tone(1109, now + 0.13, 0.55, 0.20, "sine");
    tone(2218, now + 0.13, 0.22, 0.028, "triangle");
    tone(1320, now + 0.26, 0.70, 0.18, "sine");
    tone(2640, now + 0.26, 0.28, 0.022, "triangle");
  } catch {}
}

export function Som() {
  const [playing, setPlaying] = useState(false);

  function handlePlay() {
    setPlaying(true);
    playPdvioWaiterSound();
    setTimeout(() => setPlaying(false), 900);
  }

  return (
    <div
      style={{ background: "#0f0f14", minHeight: "100vh" }}
      className="flex flex-col items-center justify-center gap-8 p-8"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <div
          style={{ background: "linear-gradient(135deg,#7c3aed,#a855f7)" }}
          className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-900/40"
        >
          <span style={{ fontSize: 28 }}>🔔</span>
        </div>
        <p style={{ color: "#e2d9f3" }} className="text-lg font-bold tracking-tight mt-1">
          PDVIO Sound
        </p>
        <p style={{ color: "#6b7280" }} className="text-xs">
          Notificação de garçom
        </p>
      </div>

      <button
        onClick={handlePlay}
        disabled={playing}
        style={{
          background: playing
            ? "linear-gradient(135deg,#6d28d9,#9333ea)"
            : "linear-gradient(135deg,#7c3aed,#a855f7)",
          boxShadow: playing ? "0 0 24px #7c3aed99" : "0 4px 20px #7c3aed44",
          transition: "all 0.2s",
          transform: playing ? "scale(0.96)" : "scale(1)",
        }}
        className="px-8 py-4 rounded-2xl text-white font-semibold text-base cursor-pointer border-0 outline-none"
      >
        {playing ? "♪♪♪ tocando..." : "▶ Tocar som"}
      </button>

      <p style={{ color: "#374151", fontSize: 11 }} className="text-center max-w-xs">
        Arpegio Lá maior · A5 → C#6 → E6<br />
        Síntese sinusoidal + harmônico triângulo
      </p>
    </div>
  );
}
