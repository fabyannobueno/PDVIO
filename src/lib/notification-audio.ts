/**
 * Notificação sonora via Web Audio API.
 *
 * O HTMLAudioElement tem ~100-300ms de latência porque precisa buscar/decodificar
 * o MP3 no momento do play(). Com AudioContext + AudioBuffer pré-decodificado,
 * a latência cai para <5ms — o som começa imediatamente.
 */

let ctx: AudioContext | null = null;
let buffer: AudioBuffer | null = null;
let loadPromise: Promise<void> | null = null;
let loadedUrl = "";

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return ctx;
}

async function _load(url: string): Promise<void> {
  const context = getCtx();
  const res = await fetch(url);
  const raw = await res.arrayBuffer();
  buffer = await context.decodeAudioData(raw);
  loadedUrl = url;
}

/** Pré-carrega e decodifica o som uma única vez. Chame no mount do componente. */
export function preloadNotificationSound(url: string): void {
  if (loadPromise && loadedUrl === url) return;
  loadPromise = _load(url).catch(() => {});
}

/**
 * Toca o som de notificação.
 * Na primeira chamada aguarda o decode (~200ms na primeira vez);
 * nas seguintes a latência é <5ms.
 */
export async function playNotificationSound(url: string): Promise<void> {
  try {
    const context = getCtx();
    if (context.state === "suspended") await context.resume();
    if (!buffer || loadedUrl !== url) {
      if (!loadPromise || loadedUrl !== url) {
        loadPromise = _load(url).catch(() => {});
      }
      await loadPromise;
    }
    if (!buffer) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start(0);
  } catch {
    const a = new Audio(url);
    a.play().catch(() => {});
  }
}

/**
 * Desbloqueia o AudioContext na primeira interação do usuário.
 * Navegadores suspendem o contexto até que o usuário interaja com a página.
 * Chame isso em um listener de pointerdown/keydown.
 */
export function unlockAudio(): void {
  try {
    const context = getCtx();
    if (context.state === "suspended") context.resume().catch(() => {});
  } catch {}
}
