import { useState } from "react";

/**
 * PDVIO Premium Bell
 * ─────────────────────────────────────────────────────────────────
 * Som construído com série de parciais reais de sino metálico:
 *   Hum  0.50× · Prime 1.00× · Tierce 1.20× · Quint 1.50× · Nominal 2.00×
 * + transiente brilhante + dois taps de shimmer (delay 80ms / 160ms)
 * + sub-warmth rápida em 440Hz
 * Decay natural exponencial — 1.4 segundos de ressonância total.
 */

type PartialDef = {
  ratio: number;
  gain: number;
  dur: number;
  type?: OscillatorType;
};

function playPdvioBell() {
  const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ac.state === "suspended") { ac.resume(); }

  const root = 880; // A5
  const now  = ac.currentTime;

  // Master gain (soft limiter)
  const master = ac.createGain();
  master.gain.value = 0.82;
  master.connect(ac.destination);

  function partial(
    freq: number, startAt: number, dur: number, peakGain: number,
    type: OscillatorType = "sine", attackMs = 6,
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
    env.connect(master);
    osc.start(startAt);
    osc.stop(startAt + dur + 0.05);
  }

  // ── Bell partials (serie acústica real de sino)
  const partials: PartialDef[] = [
    { ratio: 0.50, gain: 0.10, dur: 0.25 },   // hum — quente, rápido
    { ratio: 1.00, gain: 0.30, dur: 1.40 },   // prime — fundamental
    { ratio: 1.20, gain: 0.14, dur: 1.10 },   // tierce
    { ratio: 1.50, gain: 0.18, dur: 0.90 },   // quint
    { ratio: 2.00, gain: 0.10, dur: 0.65 },   // nominal (8ª)
    { ratio: 2.75, gain: 0.04, dur: 0.35 },   // superquint superior
  ];
  for (const p of partials) {
    partial(root * p.ratio, now, p.dur, p.gain, p.type ?? "sine");
  }

  // ── Transiente brilhante (ataque percussivo)
  partial(root * 4.0, now, 0.055, 0.12, "triangle", 2);

  // ── Shimmer duplo (dois eco leves — 80ms / 160ms)
  const shimmerGains = [0.18, 0.10];
  const shimmerDelays = [0.080, 0.160];
  for (let i = 0; i < 2; i++) {
    const d = shimmerDelays[i];
    const g = shimmerGains[i];
    partial(root,        now + d, 1.20 * (1 - i * 0.3), g * 0.30, "sine");
    partial(root * 1.50, now + d, 0.80 * (1 - i * 0.3), g * 0.18, "sine");
    partial(root * 2.00, now + d, 0.50 * (1 - i * 0.3), g * 0.10, "sine");
  }
}

// ────────────────────────────────────────────────────────────────

function BellIcon({ ringing }: { ringing: boolean }) {
  return (
    <svg
      width="36" height="36" viewBox="0 0 24 24" fill="none"
      stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      style={{
        transformOrigin: "50% 20%",
        animation: ringing ? "ring 0.9s ease-in-out" : "none",
      }}
    >
      <style>{`
        @keyframes ring {
          0%   { transform: rotate(0deg); }
          10%  { transform: rotate(14deg); }
          25%  { transform: rotate(-12deg); }
          40%  { transform: rotate(10deg); }
          55%  { transform: rotate(-8deg); }
          70%  { transform: rotate(5deg); }
          85%  { transform: rotate(-3deg); }
          100% { transform: rotate(0deg); }
        }
        @keyframes ripple {
          0%   { opacity: 0.7; transform: scale(1); }
          100% { opacity: 0;   transform: scale(2.2); }
        }
        @keyframes fadein {
          from { opacity:0; transform: translateY(6px); }
          to   { opacity:1; transform: translateY(0); }
        }
      `}</style>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export function Som() {
  const [ringing, setRinging] = useState(false);
  const [played, setPlayed]   = useState(false);

  function handlePlay() {
    if (ringing) return;
    playPdvioBell();
    setRinging(true);
    setPlayed(true);
    setTimeout(() => setRinging(false), 950);
  }

  return (
    <div
      style={{ background: "#09090f", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}
      className="flex flex-col items-center justify-center gap-10 px-8"
    >
      {/* Icon */}
      <div style={{ position: "relative" }}>
        {ringing && (
          <>
            <div style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              border: "2px solid #a855f7",
              animation: "ripple 0.9s ease-out forwards",
            }} />
            <div style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              border: "2px solid #a855f7",
              animation: "ripple 0.9s 0.18s ease-out forwards",
            }} />
          </>
        )}
        <div
          style={{
            width: 80, height: 80, borderRadius: 24,
            background: "linear-gradient(145deg, #7c3aed 0%, #a855f7 60%, #c084fc 100%)",
            boxShadow: ringing
              ? "0 0 40px #a855f799, 0 0 80px #7c3aed44"
              : "0 8px 32px #7c3aed55",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "box-shadow 0.2s",
          }}
        >
          <BellIcon ringing={ringing} />
        </div>
      </div>

      {/* Label */}
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "#f3f0ff", fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: -0.4 }}>
          PDVIO Bell
        </p>
        <p style={{ color: "#6b21a8", fontSize: 13, margin: "4px 0 0", fontWeight: 500 }}>
          Notificação de garçom
        </p>
      </div>

      {/* Button */}
      <button
        onClick={handlePlay}
        disabled={ringing}
        style={{
          padding: "14px 40px",
          borderRadius: 16,
          border: "none",
          cursor: ringing ? "default" : "pointer",
          fontWeight: 700,
          fontSize: 15,
          color: "white",
          letterSpacing: 0.2,
          background: ringing
            ? "linear-gradient(135deg,#5b21b6,#7c3aed)"
            : "linear-gradient(135deg,#7c3aed,#a855f7)",
          boxShadow: ringing
            ? "0 0 28px #7c3aed88"
            : "0 4px 24px #7c3aed66",
          transform: ringing ? "scale(0.97)" : "scale(1)",
          transition: "all 0.15s",
          outline: "none",
        }}
      >
        {ringing ? "♪ tocando..." : played ? "↺ Tocar novamente" : "▶ Tocar som"}
      </button>

      {/* Spec */}
      {played && (
        <div
          style={{
            background: "#12101e", border: "1px solid #2e1065",
            borderRadius: 12, padding: "12px 20px", textAlign: "center",
            animation: "fadein 0.4s ease",
          }}
        >
          <p style={{ color: "#7c3aed", fontSize: 11, fontWeight: 600, margin: 0, letterSpacing: 1, textTransform: "uppercase" }}>
            Composição
          </p>
          <p style={{ color: "#a78bfa", fontSize: 12, margin: "6px 0 0", lineHeight: 1.7 }}>
            A5 · parciais 0.5× 1× 1.2× 1.5× 2× 2.75×<br />
            Shimmer duplo · delay 80ms + 160ms<br />
            Ressonância natural · 1.4 s
          </p>
        </div>
      )}
    </div>
  );
}
