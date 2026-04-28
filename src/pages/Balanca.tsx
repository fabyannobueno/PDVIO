import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Scale,
  Cable,
  CheckCircle2,
  XCircle,
  Loader2,
  Printer,
  RefreshCw,
  Search,
  Tags,
  Plus,
  Minus,
} from "lucide-react";
import { toast } from "sonner";

import { useCompany } from "@/contexts/CompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

import * as scale from "@/lib/scale";
import {
  buildPriceLabelBarcode,
  productScaleCode,
} from "@/lib/weighBarcode";
import { printWeighLabel } from "@/lib/labelPrinter";
import { Barcode } from "@/components/Barcode";

// Unidades aceitas para etiquetagem por peso.
const WEIGHT_UNITS = ["kg", "g"];

interface WeighProduct {
  id: string;
  numeric_id: number | null;
  name: string;
  sale_price: number;
  is_promotion: boolean;
  promotion_price: number | null;
  stock_unit: string;
  barcode: string | null;
}

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtKg = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export default function Balanca() {
  const { activeCompany } = useCompany();

  // ── Settings ──────────────────────────────────────────────────────────────
  const [settings, setSettings] = useState<scale.ScaleSettings>(() => scale.getSettings());
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState<boolean>(scale.isConnected());

  useEffect(() => {
    if (!activeCompany?.id) return;
    let cancelled = false;
    void scale.hydrateSettingsFromDB(activeCompany.id).then((s) => {
      if (!cancelled) setSettings(s);
    });
    return () => { cancelled = true; };
  }, [activeCompany?.id]);

  function updateSettings(patch: Partial<scale.ScaleSettings>) {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      scale.saveSettings(next);
      if (activeCompany?.id) void scale.saveSettingsToDB(activeCompany.id, next);
      return next;
    });
  }

  // ── Live weight subscription ──────────────────────────────────────────────
  const [liveWeight, setLiveWeight] = useState<number | null>(scale.getLastWeight());
  useEffect(() => {
    return scale.subscribe((w) => setLiveWeight(w));
  }, []);

  async function handleConnect() {
    setConnecting(true);
    try {
      const label = await scale.connect(settings);
      updateSettings({ deviceLabel: label, mode: "serial" });
      setConnected(true);
      toast.success("Balança conectada", { description: label });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao conectar à balança");
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    try {
      await scale.disconnect();
      setConnected(false);
      updateSettings({ deviceLabel: undefined });
      toast.success("Balança desconectada");
    } catch {
      // ignore
    }
  }

  // ── Product picker ────────────────────────────────────────────────────────
  const { data: products = [], isLoading } = useQuery<WeighProduct[]>({
    queryKey: ["/api/balanca/products", activeCompany?.id],
    enabled: !!activeCompany?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,numeric_id,name,sale_price,is_promotion,promotion_price,stock_unit,barcode")
        .eq("company_id", activeCompany!.id)
        .eq("is_active", true)
        .in("stock_unit", WEIGHT_UNITS)
        .order("name");
      if (error) throw error;
      return (data ?? []) as WeighProduct[];
    },
  });

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.barcode ?? "").toLowerCase().includes(q),
    );
  }, [products, search]);

  const selected = useMemo(
    () => products.find((p) => p.id === selectedId) ?? null,
    [products, selectedId],
  );

  // ── Weight handling ───────────────────────────────────────────────────────
  // Peso usado para a etiqueta (em kg). Enquanto o operador não trava, segue
  // o stream da balança automaticamente.
  const [weightKg, setWeightKg] = useState(0);
  const [tare, setTare] = useState(0);     // kg subtraídos da leitura
  const [followLive, setFollowLive] = useState(true);

  useEffect(() => {
    if (followLive && liveWeight !== null) {
      const net = Math.max(0, Math.round((liveWeight - tare) * 1000) / 1000);
      setWeightKg(net);
    }
  }, [liveWeight, followLive, tare]);

  function captureWeight() {
    if (liveWeight === null) {
      toast.error("Nenhum peso disponível. Verifique a conexão da balança.");
      return;
    }
    const net = Math.max(0, Math.round((liveWeight - tare) * 1000) / 1000);
    setWeightKg(net);
    setFollowLive(false);
    toast.success(`Peso capturado: ${fmtKg(net)} kg`);
  }

  function setTareFromLive() {
    if (liveWeight === null) {
      toast.error("Nenhum peso disponível para tara.");
      return;
    }
    setTare(Math.round(liveWeight * 1000) / 1000);
    toast.success(`Tara definida: ${fmtKg(liveWeight)} kg`);
  }

  function clearTare() {
    setTare(0);
    toast.success("Tara zerada");
  }

  // ── Price + label ─────────────────────────────────────────────────────────
  const pricePerKgRaw = selected
    ? (selected.is_promotion && selected.promotion_price != null
        ? selected.promotion_price
        : selected.sale_price)
    : 0;
  // Para produtos cadastrados em "g", o sale_price é por grama — convertemos.
  const pricePerKg = selected?.stock_unit === "g" ? pricePerKgRaw * 1000 : pricePerKgRaw;
  const totalPrice = Math.floor(pricePerKg * weightKg * 100) / 100;

  const productCode = selected ? productScaleCode(selected.numeric_id) : null;

  let barcode: string | null = null;
  let barcodeError: string | null = null;
  if (selected && totalPrice > 0 && productCode) {
    try {
      barcode = buildPriceLabelBarcode(productCode, totalPrice);
    } catch (e: any) {
      barcodeError = e?.message ?? "Não foi possível gerar o código";
    }
  }

  function handlePrint() {
    if (!selected) return toast.error("Selecione um produto.");
    if (weightKg <= 0) return toast.error("Capture o peso na balança.");
    if (!barcode) return toast.error(barcodeError ?? "Não foi possível gerar a etiqueta.");
    try {
      printWeighLabel({
        productName: selected.name,
        productCode: productCode ?? undefined,
        weightKg,
        pricePerKg,
        totalPrice,
        barcode,
        companyName: activeCompany?.name ?? undefined,
        printedAt: new Date(),
      });
      // Limpa peso para próximo item
      setFollowLive(true);
      setWeightKg(liveWeight !== null ? Math.max(0, liveWeight - tare) : 0);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao imprimir etiqueta");
    }
  }

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Scale className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Balança</h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Pese, calcule e imprima etiquetas com código de barras (preço embutido).
            </p>
          </div>
        </div>
      </div>

      {/* ── Connection card ──────────────────────────────────────────────── */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cable className="h-4 w-4" />
            Conexão da balança
          </CardTitle>
          <CardDescription>
            Conecte uma balança comercial via cabo USB-Serial (Toledo, Filizola, Urano e similares).
            Funciona apenas em Chrome ou Edge no computador.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!scale.capabilities.serial && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              Este navegador não suporta Web Serial. Use Chrome ou Edge no computador.
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Marca / protocolo</Label>
              <Select
                value={settings.protocol}
                onValueChange={(v) => {
                  const preset = scale.SCALE_PRESETS.find((p) => p.id === v);
                  if (!preset) return;
                  updateSettings({
                    protocol: preset.id,
                    baudRate: preset.baudRate,
                    dataBits: preset.dataBits,
                    stopBits: preset.stopBits,
                    parity: preset.parity,
                  });
                }}
              >
                <SelectTrigger data-testid="select-scale-protocol">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {scale.SCALE_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Os parâmetros (baud rate, paridade etc.) são ajustados automaticamente.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Velocidade (baud rate)</Label>
              <Select
                value={String(settings.baudRate)}
                onValueChange={(v) => updateSettings({ baudRate: Number(v) })}
              >
                <SelectTrigger data-testid="select-scale-baud">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1200, 2400, 4800, 9600, 19200, 38400].map((b) => (
                    <SelectItem key={b} value={String(b)}>{b} bps</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              {connected ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm font-medium" data-testid="text-scale-status">Balança conectada</p>
                    <p className="text-xs text-muted-foreground">{settings.deviceLabel ?? "Dispositivo autorizado"}</p>
                  </div>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Nenhuma balança conectada</p>
                    <p className="text-xs text-muted-foreground">Clique em "Conectar" para autorizar.</p>
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-2">
              {connected && (
                <Button variant="outline" onClick={handleDisconnect} data-testid="button-disconnect-scale">
                  Desconectar
                </Button>
              )}
              <Button
                onClick={handleConnect}
                disabled={connecting || !scale.capabilities.serial}
                data-testid="button-connect-scale"
              >
                {connecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Cable className="mr-2 h-4 w-4" />}
                {connected ? "Reconectar" : "Conectar balança"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Weighing + Label ─────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        {/* Picker + scale display */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4" />
              Produto e peso
            </CardTitle>
            <CardDescription>
              Selecione um produto pesável (kg ou g) e capture o peso da balança.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Buscar produto</Label>
              <Input
                placeholder="Nome ou código de barras do produto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-balanca-search"
              />
              <div className="max-h-56 overflow-y-auto rounded-lg border">
                {isLoading ? (
                  <div className="flex items-center justify-center p-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : filtered.length === 0 ? (
                  <p className="p-4 text-center text-sm text-muted-foreground">
                    {products.length === 0
                      ? "Nenhum produto cadastrado em kg ou g."
                      : "Nenhum produto encontrado."}
                  </p>
                ) : (
                  <ul className="divide-y">
                    {filtered.slice(0, 50).map((p) => {
                      const price = p.is_promotion && p.promotion_price != null ? p.promotion_price : p.sale_price;
                      const display = p.stock_unit === "g" ? price * 1000 : price;
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedId(p.id)}
                            className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted ${
                              selectedId === p.id ? "bg-primary/10 font-medium text-foreground" : "text-foreground"
                            }`}
                            data-testid={`row-balanca-product-${p.id}`}
                          >
                            <span className="truncate">{p.name}</span>
                            <span className="shrink-0 font-mono text-xs text-muted-foreground">
                              {fmtBRL(display)}/kg
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* Live weight display */}
            <div className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-4 text-center">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Leitura da balança
              </p>
              <p
                className="mt-1 font-mono text-4xl font-bold tabular-nums text-foreground"
                data-testid="text-live-weight"
              >
                {liveWeight === null ? "—" : `${fmtKg(Math.max(0, liveWeight - tare))} kg`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {liveWeight === null
                  ? connected
                    ? "Aguardando peso estável..."
                    : "Conecte a balança ou digite o peso manualmente."
                  : tare > 0
                    ? `Bruto: ${fmtKg(liveWeight)} kg · Tara: ${fmtKg(tare)} kg`
                    : `Peso bruto`}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={setTareFromLive}
                disabled={liveWeight === null}
                data-testid="button-tare-set"
              >
                <Minus className="mr-2 h-4 w-4" /> Tara
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={clearTare}
                disabled={tare === 0}
                data-testid="button-tare-clear"
              >
                Zerar tara
              </Button>
            </div>

            <Separator />

            {/* Manual override */}
            <div className="space-y-2">
              <Label>Peso para a etiqueta (kg)</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={0}
                  step={0.001}
                  value={weightKg === 0 ? "" : weightKg}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    setWeightKg(Math.max(0, Math.round(v * 1000) / 1000));
                    setFollowLive(false);
                  }}
                  placeholder="0,000"
                  data-testid="input-balanca-weight"
                  className="font-mono text-base"
                />
                <Button
                  type="button"
                  variant="default"
                  onClick={captureWeight}
                  disabled={liveWeight === null}
                  data-testid="button-capture-weight"
                >
                  <Plus className="mr-2 h-4 w-4" /> Capturar
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {followLive
                    ? "Acompanhando leitura ao vivo"
                    : "Peso travado para impressão"}
                </p>
                {!followLive && (
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => setFollowLive(true)}
                  >
                    <RefreshCw className="mr-1 inline h-3 w-3" /> Voltar para leitura ao vivo
                  </button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Label preview */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Tags className="h-4 w-4" />
              Etiqueta
            </CardTitle>
            <CardDescription>
              Pré-visualização do que será impresso. O código de barras vai com o
              preço total embutido (padrão de balança).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selected ? (
              <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                Selecione um produto para ver a etiqueta.
              </div>
            ) : (
              <>
                <div className="rounded-xl border bg-white p-4 text-black shadow-sm">
                  {activeCompany?.name && (
                    <p className="border-b border-black pb-1 text-center text-xs font-bold uppercase">
                      {activeCompany.name}
                    </p>
                  )}
                  <p className="mt-2 line-clamp-2 text-base font-bold leading-tight">
                    {selected.name}
                  </p>
                  {productCode && (
                    <p className="text-[11px] text-neutral-500">Cód.: {productCode}</p>
                  )}

                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-y border-black/40 py-1">
                    <div>
                      <p className="text-[10px] uppercase text-neutral-500">Peso líq.</p>
                      <p className="font-mono text-sm font-semibold">{fmtKg(weightKg)} kg</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-neutral-500">Preço/kg</p>
                      <p className="font-mono text-sm font-semibold">{fmtBRL(pricePerKg)}</p>
                    </div>
                  </div>

                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-xs font-semibold uppercase">Total</span>
                    <span className="font-mono text-2xl font-extrabold tabular-nums">
                      {fmtBRL(totalPrice)}
                    </span>
                  </div>

                  <div className="mt-2 flex justify-center">
                    {barcode ? (
                      <Barcode value={barcode} format="EAN13" height={50} width={1.6} />
                    ) : (
                      <p className="py-4 text-xs text-destructive">
                        {barcodeError ?? "Capture um peso para gerar o código."}
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Como funciona no caixa</p>
                  <p className="mt-1">
                    Quando o leitor do PDV escanear esta etiqueta, o sistema vai
                    identificar o produto pelo código <strong>{productCode}</strong> e
                    cobrar exatamente <strong>{fmtBRL(totalPrice)}</strong>, ajustando
                    a quantidade pela divisão entre o total e o preço atual por kg.
                  </p>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handlePrint}
                  disabled={!barcode || weightKg <= 0}
                  data-testid="button-print-label"
                >
                  <Printer className="mr-2 h-4 w-4" /> Imprimir etiqueta
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
