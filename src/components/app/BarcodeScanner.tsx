import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { NotFoundException } from "@zxing/library";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, ScanLine, Camera, AlertCircle } from "lucide-react";

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

export function BarcodeScanner({ open, onClose, onResult }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<"starting" | "scanning" | "looking-up" | "error">("starting");
  const [errorMsg, setErrorMsg] = useState("");
  const [scannedCode, setScannedCode] = useState("");
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
        // Request rear camera — "environment" is a preference, not strict
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });

        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        // Attach stream to video element
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setStatus("scanning");

        const reader = new BrowserMultiFormatReader();
        readerRef.current = reader;

        // Decode from the live stream
        reader.decodeFromStream(stream, videoRef.current!, async (result, err) => {
          if (detectedRef.current || stopped) return;
          if (result) {
            detectedRef.current = true;
            const code = result.getText();
            setScannedCode(code);
            setStatus("looking-up");
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
                    Aponte para o código de barras
                  </span>
                </div>
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
