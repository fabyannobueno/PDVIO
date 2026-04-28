import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Link } from "react-router-dom";
import { Copy, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { generatePixPayload, generateTxId, type PixKeyType } from "@/lib/pixPayload";

interface Props {
  pixKey: string | null | undefined;
  pixKeyType: PixKeyType | null | undefined;
  merchantName: string;
  merchantCity: string;
  amount: number;
  description?: string;
}

export function PixQrCard({
  pixKey,
  pixKeyType,
  merchantName,
  merchantCity,
  amount,
  description,
}: Props) {
  const { toast } = useToast();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const txid = useMemo(() => generateTxId(16), [pixKey, amount]);

  const payload = useMemo(() => {
    if (!pixKey || !pixKeyType) return "";
    try {
      return generatePixPayload({
        pixKey,
        pixKeyType,
        merchantName,
        merchantCity,
        amount,
        txid,
        description,
      });
    } catch {
      return "";
    }
  }, [pixKey, pixKeyType, merchantName, merchantCity, amount, txid, description]);

  useEffect(() => {
    if (!payload) { setQrDataUrl(null); return; }
    let cancelled = false;
    QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: 280 })
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch(() => { if (!cancelled) setQrDataUrl(null); });
    return () => { cancelled = true; };
  }, [payload]);

  if (!pixKey || !pixKeyType) {
    return (
      <div
        className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-warning"
        data-testid="pix-key-missing"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="flex-1 text-xs leading-relaxed">
          <p className="font-semibold">Chave PIX não cadastrada</p>
          <p className="text-warning/80">
            Cadastre uma chave PIX em{" "}
            <Link
              to="/configuracoes"
              className="underline underline-offset-2 hover:text-warning"
              data-testid="link-configurar-pix"
            >
              Configurações &gt; Banco
            </Link>{" "}
            para gerar o QR Code.
          </p>
        </div>
      </div>
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      toast({ title: "Código copiado!", description: "Cole no app do banco para pagar." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4" data-testid="pix-qr-card">
      <div className="flex flex-col items-center gap-3">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt="QR Code PIX"
            className="h-44 w-44 rounded-md bg-white p-2"
            data-testid="img-pix-qr"
          />
        ) : (
          <div className="flex h-44 w-44 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
            Gerando QR…
          </div>
        )}
        <div className="w-full">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            PIX Copia e Cola
          </p>
          <div className="flex gap-2">
            <code
              className="flex-1 max-h-24 overflow-y-auto break-all whitespace-pre-wrap rounded-md border bg-muted/40 px-2 py-2 text-[11px] leading-snug"
              data-testid="text-pix-payload"
            >
              {payload}
            </code>
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={handleCopy}
              data-testid="button-copy-pix"
              title="Copiar código"
            >
              {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
