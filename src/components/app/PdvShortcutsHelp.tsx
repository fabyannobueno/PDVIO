import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context?: "pdv" | "comanda";
}

const PDV_SHORTCUTS: Array<{ keys: string; desc: string }> = [
  { keys: "F2", desc: "Focar a busca de produtos" },
  { keys: "Enter", desc: "Adicionar o primeiro produto da busca (Venda rápida)" },
  { keys: "F4", desc: "Abrir leitor de código de barras (câmera)" },
  { keys: "F7", desc: "Selecionar cliente (↑↓ navega · Enter confirma)" },
  { keys: "F8", desc: "Alternar entre formas de pagamento" },
  { keys: "F9", desc: "Focar valor recebido (Dinheiro)" },
  { keys: "F10", desc: "Ativar/desativar navegação entre os produtos (setas)" },
  { keys: "← ↑ → ↓", desc: "Navegar entre os produtos (após F10)" },
  { keys: "Enter", desc: "Adicionar produto selecionado ao carrinho" },
  { keys: "F12", desc: "Finalizar venda" },
  { keys: "Esc", desc: "Limpar carrinho / fechar diálogos" },
  { keys: "?", desc: "Abrir esta ajuda" },
];

const COMANDA_SHORTCUTS: Array<{ keys: string; desc: string }> = [
  { keys: "F8", desc: "Alternar entre formas de pagamento" },
  { keys: "F9", desc: "Focar valor recebido (Dinheiro)" },
  { keys: "Enter", desc: "Confirmar fechamento da comanda" },
  { keys: "Esc", desc: "Voltar / fechar diálogo" },
  { keys: "?", desc: "Abrir esta ajuda" },
];

export function PdvShortcutsHelp({ open, onOpenChange, context = "pdv" }: Props) {
  const items = context === "comanda" ? COMANDA_SHORTCUTS : PDV_SHORTCUTS;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-primary" />
            Atalhos de teclado
          </DialogTitle>
          <DialogDescription>
            Venda rápida sem mouse. Use as teclas abaixo para acelerar o atendimento.
          </DialogDescription>
        </DialogHeader>
        <div className="divide-y divide-border rounded-lg border border-border">
          {items.map((s) => (
            <div
              key={s.keys}
              className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
            >
              <span className="text-muted-foreground">{s.desc}</span>
              <kbd className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs font-semibold">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
