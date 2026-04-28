import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, X } from "lucide-react";
import { PixQrCard } from "@/components/app/PixQrCard";
import type { PixKeyType } from "@/lib/pixPayload";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pixKey: string | null | undefined;
  pixKeyType: PixKeyType | null | undefined;
  merchantName: string;
  merchantCity?: string;
  amount: number;
  description?: string;
  onConfirm: () => void;
  isProcessing?: boolean;
}

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PixConfirmDialog({
  open,
  onOpenChange,
  pixKey,
  pixKeyType,
  merchantName,
  merchantCity = "BRASIL",
  amount,
  description,
  onConfirm,
  isProcessing = false,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!isProcessing) onOpenChange(o); }}>
      <DialogContent className="max-w-md" data-testid="dialog-pix-confirm">
        <DialogHeader>
          <DialogTitle>Pagamento PIX</DialogTitle>
          <DialogDescription>
            Peça ao cliente para escanear o QR Code ou copiar o código abaixo.
            Confira o comprovante e confirme o recebimento para finalizar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
          <span className="text-sm font-medium">Total a receber</span>
          <span className="font-mono text-lg font-bold" data-testid="text-pix-confirm-total">
            {fmtBRL(amount)}
          </span>
        </div>

        <PixQrCard
          pixKey={pixKey ?? null}
          pixKeyType={pixKeyType ?? null}
          merchantName={merchantName}
          merchantCity={merchantCity}
          amount={amount}
          description={description}
        />

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Este é um PIX estático gratuito. A confirmação não é automática — o
          operador deve conferir o comprovante de pagamento antes de finalizar.
        </p>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
            data-testid="button-pix-cancel"
          >
            <X className="mr-2 h-4 w-4" />
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isProcessing || !pixKey || !pixKeyType}
            data-testid="button-pix-confirm"
          >
            {isProcessing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            {isProcessing ? "Finalizando..." : "Confirmar pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
