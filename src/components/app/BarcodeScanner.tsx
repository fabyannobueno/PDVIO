import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import {
  BarcodeFormat,
  DecodeHintType,
  NotFoundException,
} from "@zxing/library";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, ScanLine, Camera, AlertCircle, Zap, ZapOff } from "lucide-react";

interface ProductLookupResult {
  name?: string;
  description?: string;
  category?: string;
  barcode: string;
}

async function lookupBarcode(barcode: string): Promise<ProductLookupResult | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status !== 1 || !json.product) return null;

    const p = json.product;
    const rawCategory: string = p.categories_tags?.[0] ?? p.categories ?? "";
    const category = rawCategory
      .replace(/^(en:|pt:)/, "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c: string) => c.toUpperCase())
      .trim();

    return {
      barcode,
      name: p.product_name_pt || p.product_name || p.product_name_en || "",
      description: p.ingredients_text_pt || p.ingredients_text || "",
      category: category || "",
    };
  } catch {
    return null;
  }
}

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onResult: (result: ProductLookupResult) => void;
}

// Restrict to the formats that actually appear on retail products.
// The default "MultiFormatReader" tries every format on every frame,
// which makes scanning very slow. Limiting to ~8 formats makes decoding
// dramatically faster.
const SUPPORTED_FORMATS: BarcodeFormat[] = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
];

function buildHints() {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, SUPPORTED_FORMATS);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return hints;
}

// Try to coerce the camera into the best mode for barcode reading:
// continuous autofocus + macro focus distance + image-stabilization-off,
// guarded by capability checks so it silently no-ops on devices that
// don't support each constraint.
async function tuneCameraForBarcodes(track: MediaStreamTrack) {
  const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
    focusMode?: string[];
    focusDistance?: { min: number; max: number; step: number };
    exposureMode?: string[];
    whiteBalanceMode?: string[];
  };

  const advanced: MediaTrackConstraintSet[] = [];

  if (Array.isArray(caps.focusMode)) {
    if (caps.focusMode.includes("continuous")) {
      advanced.push({ focusMode: "continuous" } as MediaTrackConstraintSet);
    } else if (caps.focusMode.includes("single-shot")) {
      advanced.push({ focusMode: "single-shot" } as MediaTrackConstraintSet);
    }
  }

  if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes("continuous")) {
    advanced.push({ exposureMode: "continuous" } as MediaTrackConstraintSet);
  }

  if (
    Array.isArray(caps.whiteBalanceMode) &&
    caps.whiteBalanceMode.includes("continuous")
  ) {
    advanced.push({ whiteBalanceMode: "continuous" } as MediaTrackConstraintSet);
  }

  if (advanced.length > 0) {
    try {
      await track.applyConstraints({ advanced });
    } catch {
      // ignore — best-effort tuning
    }
  }
}

export function BarcodeScanner({ open, onClose, onResult }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [status, setStatus] = useState<"starting" | "scanning" | "looking-up" | "error">("starting");
  const [errorMsg, setErrorMsg] = useState("");
  const [scannedCode, setScannedCode] = useState("");
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const detectedRef = useRef(false);

  function stopAll() {
    if (readerRef.current) {
      try { readerRef.current.reset(); } catch {}
      readerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    trackRef.current = null;
    setTorchSupported(false);
    setTorchOn(false);
  }

  async function toggleTorch() {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      // ignore
    }
  }

  // Tap-to-focus: re-applies single-shot focus on the chosen point when the
  // camera supports it. Helps when ZXing can't decode because the barcode
  // is right under the lens and continuous AF didn't catch up yet.
  async function refocus() {
    const track = trackRef.current;
    if (!track) return;
    const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
      focusMode?: string[];
    };
    if (!Array.isArray(caps.focusMode)) return;
    try {
      if (caps.focusMode.includes("single-shot")) {
        await track.applyConstraints({
          advanced: [{ focusMode: "single-shot" } as MediaTrackConstraintSet],
        });
      }
      if (caps.focusMode.includes("continuous")) {
        await track.applyConstraints({
          advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
        });
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!open) return;

    detectedRef.current = false;
    setStatus("starting");
    setErrorMsg("");
    setScannedCode("");

    let stopped = false;

    (async () => {
      try {
        // Ask for the rear camera at the highest practical resolution.
        // Higher resolution = ZXing can decode the barcode from further
        // away and with more tolerance for motion blur.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        });

        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const [track] = stream.getVideoTracks();
        trackRef.current = track ?? null;

        // Tune autofocus / exposure / white balance — fixes the "blurry
        // when close to the product" issue on phones that ship with the
        // camera in fixed-focus mode by default.
        if (track) {
          await tuneCameraForBarcodes(track);
          const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
            torch?: boolean;
          };
          if (caps.torch) setTorchSupported(true);
        }

        // Attach stream to the video element.
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setStatus("scanning");

        // Faster scan loop: 100ms between attempts (default is 500ms),
        // restricted to retail-product barcode formats.
        const reader = new BrowserMultiFormatReader(buildHints(), 100);
        readerRef.current = reader;

        reader.decodeFromStream(stream, videoRef.current!, async (result, err) => {
          if (detectedRef.current || stopped) return;
          if (result) {
            detectedRef.current = true;
            const code = result.getText();
            setScannedCode(code);
            setStatus("looking-up");
            // Vibrate on successful scan if the device supports it.
            try { navigator.vibrate?.(80); } catch {}
            const info = await lookupBarcode(code);
            if (!stopped) {
              onResult(info ?? { barcode: code });
              onClose();
            }
          } else if (err && !(err instanceof NotFoundException)) {
            // ignore scan-frame errors
          }
        });
      } catch (e: any) {
        if (stopped) return;
        setStatus("error");
        const name = e?.name ?? "";
        if (name === "NotAllowedError") {
          setErrorMsg("Permissão de câmera negada. Libere o acesso à câmera nas configurações do navegador.");
        } else if (name === "NotFoundError") {
          setErrorMsg("Nenhuma câmera encontrada no dispositivo.");
        } else {
          setErrorMsg(`Erro ao acessar câmera: ${e?.message ?? "desconhecido"}`);
        }
      }
    })();

    return () => {
      stopped = true;
      stopAll();
    };
  }, [open]);

  function handleClose() {
    stopAll();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-primary" />
            Escanear código de barras
          </DialogTitle>
          <DialogDescription>
            Aponte a câmera traseira para o código de barras do produto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Camera viewport */}
          <div
            className="relative overflow-hidden rounded-xl border-2 border-border bg-black"
            style={{ aspectRatio: "4/3" }}
            onClick={() => {
              if (status === "scanning") refocus();
            }}
          >
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              autoPlay
              muted
              playsInline
            />

            {/* Scan overlay */}
            {status === "scanning" && (
              <>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="relative h-40 w-64">
                    <span className="absolute left-0 top-0 h-8 w-8 border-l-4 border-t-4 border-primary rounded-tl-sm" />
                    <span className="absolute right-0 top-0 h-8 w-8 border-r-4 border-t-4 border-primary rounded-tr-sm" />
                    <span className="absolute bottom-0 left-0 h-8 w-8 border-b-4 border-l-4 border-primary rounded-bl-sm" />
                    <span className="absolute bottom-0 right-0 h-8 w-8 border-b-4 border-r-4 border-primary rounded-br-sm" />
                    <div className="absolute left-2 right-2 top-1/2 h-0.5 bg-primary/80 blur-[1px] animate-pulse" />
                  </div>
                </div>
                <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                  <span className="rounded-full bg-black/60 px-3 py-1 text-xs text-white backdrop-blur-sm">
                    Mantenha 10–20 cm de distância · toque na imagem para focar
                  </span>
                </div>

                {torchSupported && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTorch();
                    }}
                    className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80"
                    aria-label={torchOn ? "Desligar lanterna" : "Ligar lanterna"}
                  >
                    {torchOn ? <ZapOff className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                  </button>
                )}
              </>
            )}

            {/* Starting overlay */}
            {status === "starting" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
                <p className="text-sm text-white">Iniciando câmera...</p>
              </div>
            )}

            {/* Looking up overlay */}
            {status === "looking-up" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-medium text-white">
                  Código: <span className="font-mono">{scannedCode}</span>
                </p>
                <p className="text-xs text-white/70">Buscando informações do produto...</p>
              </div>
            )}

            {/* Error overlay */}
            {status === "error" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 bg-black/80">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <p className="text-center text-sm text-white">{errorMsg}</p>
              </div>
            )}
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Se o scanner não funcionar, você pode digitar o código manualmente no campo.
          </p>

          <div className="flex gap-2">
            {status === "error" && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  stopAll();
                  setStatus("starting");
                  setErrorMsg("");
                  // re-trigger effect by toggling — handled by parent reopening
                }}
              >
                <Camera className="mr-2 h-4 w-4" />
                Tentar novamente
              </Button>
            )}
            <Button variant="ghost" className="flex-1" onClick={handleClose}>
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
