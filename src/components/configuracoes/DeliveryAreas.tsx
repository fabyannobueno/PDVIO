import { useEffect, useRef, useState, useCallback } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  MapPin,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Package,
  Filter,
  X,
} from "lucide-react";
import { MoneyInput, parseMoney } from "@/components/ui/money-input";

// ── Fix Leaflet default icon in bundlers ────────────────────────────────────
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const FREE_ICON = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});
const PAID_ICON = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});
const INACTIVE_ICON = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

// ── Types ───────────────────────────────────────────────────────────────────

export interface DeliveryArea {
  id: string;
  name: string;
  city: string;
  state: string;
  active: boolean;
  free_delivery: boolean;
  delivery_fee: number;
  minimum_order_for_free_delivery: number;
  estimated_delivery_time: string;
  lat: number | null;
  lng: number | null;
  notes: string;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    suburb?: string;
    neighbourhood?: string;
    quarter?: string;
    city_district?: string;
    district?: string;
    town?: string;
    village?: string;
    city?: string;
    state?: string;
  };
}

interface DeliveryAreasProps {
  companyId: string;
  cidade: string;
  estado: string;
  isOwner: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function normalizeText(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function newId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

/** Extract the most relevant name from a Nominatim result */
function extractNeighborhoodName(result: NominatimResult): string {
  const a = result.address;
  if (a) {
    const name =
      a.suburb ||
      a.neighbourhood ||
      a.quarter ||
      a.city_district ||
      a.district ||
      "";
    if (name) return name;
  }
  // Fallback: first part of display_name before comma
  return result.display_name.split(",")[0].trim();
}

type FilterType = "all" | "free" | "paid" | "inactive";

const DELIVERY_TIMES = [
  "15-20 min", "20-30 min", "30-45 min", "45-60 min",
  "1h-1h30", "1h30-2h", "Acima de 2h",
];

const EMPTY_FORM = {
  name: "",
  active: true,
  free_delivery: false,
  delivery_fee: "",
  minimum_order_for_free_delivery: "",
  estimated_delivery_time: "30-45 min",
  lat: "",
  lng: "",
  notes: "",
};
type FormState = typeof EMPTY_FORM;

// ── Component ────────────────────────────────────────────────────────────────

export function DeliveryAreas({ companyId, cidade, estado, isOwner }: DeliveryAreasProps) {
  const [areas, setAreas] = useState<DeliveryArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Nominatim autocomplete
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [searchingNom, setSearchingNom] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  const missingLocation = !cidade.trim() || !estado.trim();

  // ── Load areas ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    supabase
      .from("companies")
      .select("delivery_areas")
      .eq("id", companyId)
      .single()
      .then(({ data, error }) => {
        if (error) { toast.error("Erro ao carregar bairros."); return; }
        const raw = (data as any)?.delivery_areas;
        setAreas(Array.isArray(raw) ? (raw as DeliveryArea[]) : []);
      })
      .finally(() => setLoading(false));
  }, [companyId]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const saveAreas = useCallback(async (newAreas: DeliveryArea[]) => {
    setSaving(true);
    const { error } = await supabase
      .from("companies")
      .update({ delivery_areas: newAreas as any } as any)
      .eq("id", companyId);
    setSaving(false);
    if (error) { toast.error("Erro ao salvar bairros."); return false; }
    return true;
  }, [companyId]);

  // ── Init Leaflet ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;
    const map = L.map(mapContainerRef.current).setView([-15.7801, -47.9292], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    mapInstanceRef.current = map;

    if (cidade && estado) {
      fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          cidade + ", " + estado + ", Brasil"
        )}&format=json&limit=1`,
        { headers: { "Accept-Language": "pt-BR", "User-Agent": "PDVIO/1.0" } }
      )
        .then((r) => r.json())
        .then((res) => {
          if (res?.[0]) map.setView([parseFloat(res[0].lat), parseFloat(res[0].lon)], 13);
        })
        .catch(() => {});
    }

    return () => { map.remove(); mapInstanceRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update markers ────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    areas.forEach((area) => {
      if (area.lat == null || area.lng == null) return;
      const icon = !area.active ? INACTIVE_ICON : area.free_delivery ? FREE_ICON : PAID_ICON;
      const feeTxt = area.free_delivery
        ? `<span style="color:#16a34a;font-weight:600">Frete grátis${area.minimum_order_for_free_delivery > 0 ? " (condicional)" : ""}</span>`
        : `Taxa: ${formatBRL(area.delivery_fee)}`;
      const minTxt = area.free_delivery && area.minimum_order_for_free_delivery > 0
        ? `<br/>Mínimo: ${formatBRL(area.minimum_order_for_free_delivery)}`
        : "";
      const popup = `<div style="min-width:160px;font-size:13px">
        <b>${area.name}</b><br/>
        ${area.city} — ${area.state}<br/>
        ${area.active ? '<span style="color:#16a34a">● Ativo</span>' : '<span style="color:#9ca3af">● Inativo</span>'}<br/>
        ${feeTxt}${minTxt}
        ${area.estimated_delivery_time ? `<br/>⏱ ${area.estimated_delivery_time}` : ""}
      </div>`;
      const marker = L.marker([area.lat, area.lng], { icon }).bindPopup(popup).addTo(map);
      markersRef.current.push(marker);
    });
  }, [areas]);

  // ── Nominatim debounce search ─────────────────────────────────────────────
  useEffect(() => {
    if (!dialogOpen) return;
    const name = form.name.trim();
    if (name.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearchingNom(true);
      try {
        const query = encodeURIComponent(
          `${name}, ${cidade || "Brasil"}, ${estado || ""}, Brasil`
        );
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=8&addressdetails=1&accept-language=pt-BR`,
          { headers: { "User-Agent": "PDVIO/1.0" } }
        );
        const data: NominatimResult[] = await res.json();
        setSuggestions(data);
        setShowSuggestions(data.length > 0);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setSearchingNom(false);
      }
    }, 500);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [form.name, dialogOpen, cidade, estado]);

  // Close suggestions on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function selectSuggestion(result: NominatimResult) {
    const name = extractNeighborhoodName(result);
    setForm((f) => ({
      ...f,
      name,
      lat: parseFloat(result.lat).toFixed(6),
      lng: parseFloat(result.lon).toFixed(6),
    }));
    setSuggestions([]);
    setShowSuggestions(false);
    toast.success(`Bairro "${name}" encontrado — coordenadas preenchidas automaticamente.`);
  }

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = areas.filter((a) => {
    const matchSearch = !search || normalizeText(a.name).includes(normalizeText(search));
    const matchFilter =
      filter === "all" ||
      (filter === "free" && a.free_delivery && a.active) ||
      (filter === "paid" && !a.free_delivery && a.active) ||
      (filter === "inactive" && !a.active);
    return matchSearch && matchFilter;
  });

  // ── Dialog ────────────────────────────────────────────────────────────────
  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSuggestions([]);
    setShowSuggestions(false);
    setDialogOpen(true);
  }

  function openEdit(area: DeliveryArea) {
    setEditingId(area.id);
    setForm({
      name: area.name,
      active: area.active,
      free_delivery: area.free_delivery,
      delivery_fee: area.delivery_fee > 0 ? String(area.delivery_fee.toFixed(2)).replace(".", ",") : "",
      minimum_order_for_free_delivery: area.minimum_order_for_free_delivery > 0
        ? String(area.minimum_order_for_free_delivery.toFixed(2)).replace(".", ",") : "",
      estimated_delivery_time: area.estimated_delivery_time || "30-45 min",
      lat: area.lat != null ? String(area.lat) : "",
      lng: area.lng != null ? String(area.lng) : "",
      notes: area.notes || "",
    });
    setSuggestions([]);
    setShowSuggestions(false);
    setDialogOpen(true);
  }

  async function handleSave() {
    const name = form.name.trim();
    if (!name) { toast.error("Nome do bairro é obrigatório."); return; }

    const duplicate = areas.find(
      (a) => a.id !== editingId && normalizeText(a.name) === normalizeText(name)
    );
    if (duplicate) { toast.error("Já existe um bairro com esse nome."); return; }

    const fee = form.delivery_fee ? parseMoney(form.delivery_fee) : 0;
    const minOrder = form.minimum_order_for_free_delivery
      ? parseMoney(form.minimum_order_for_free_delivery) : 0;
    const lat = form.lat !== "" ? parseFloat(form.lat) : null;
    const lng = form.lng !== "" ? parseFloat(form.lng) : null;

    if (form.lat !== "" && (lat === null || isNaN(lat))) { toast.error("Latitude inválida."); return; }
    if (form.lng !== "" && (lng === null || isNaN(lng))) { toast.error("Longitude inválida."); return; }

    const areaData: DeliveryArea = {
      id: editingId ?? newId(),
      name, city: cidade, state: estado,
      active: form.active,
      free_delivery: form.free_delivery,
      delivery_fee: fee,
      minimum_order_for_free_delivery: minOrder,
      estimated_delivery_time: form.estimated_delivery_time,
      lat, lng,
      notes: form.notes.trim(),
    };

    const newAreas = editingId
      ? areas.map((a) => (a.id === editingId ? areaData : a))
      : [...areas, areaData];

    const ok = await saveAreas(newAreas);
    if (ok) {
      setAreas(newAreas);
      setDialogOpen(false);
      toast.success(editingId ? "Bairro atualizado!" : "Bairro adicionado!");
    }
  }

  async function handleToggleActive(id: string) {
    const newAreas = areas.map((a) => (a.id === id ? { ...a, active: !a.active } : a));
    const ok = await saveAreas(newAreas);
    if (ok) setAreas(newAreas);
  }

  async function handleDelete() {
    if (!deleteId) return;
    const newAreas = areas.filter((a) => a.id !== deleteId);
    const ok = await saveAreas(newAreas);
    if (ok) { setAreas(newAreas); setDeleteId(null); toast.success("Bairro removido."); }
  }

  function flyTo(area: DeliveryArea) {
    if (area.lat != null && area.lng != null && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([area.lat, area.lng], 15);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Bairros de entrega
        </CardTitle>
        <CardDescription>
          Configure bairros atendidos com taxa de entrega, frete grátis e horários estimados.
          As coordenadas são buscadas automaticamente via OpenStreetMap.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Location banner */}
        {missingLocation ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <span className="text-amber-800 dark:text-amber-300">
              Configure a <strong>cidade</strong> e o <strong>estado</strong> da empresa
              (aba Empresa) antes de cadastrar bairros de entrega.
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">
              Cidade: <strong className="text-foreground">{cidade}</strong> — Estado:{" "}
              <strong className="text-foreground">{estado}</strong>
            </span>
          </div>
        )}

        {/* Map */}
        <div ref={mapContainerRef} className="h-64 w-full rounded-lg overflow-hidden border border-border" style={{ zIndex: 0 }} />

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" /> Frete grátis
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" /> Frete pago
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-400" /> Inativo
          </span>
          <span className="ml-auto flex items-center gap-1 text-[10px] opacity-60">
            Mapa: OpenStreetMap (gratuito)
          </span>
        </div>

        <Separator />

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar bairro..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
            <SelectTrigger className="h-9 w-full sm:w-44 gap-1">
              <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="free">Frete grátis</SelectItem>
              <SelectItem value="paid">Frete pago</SelectItem>
              <SelectItem value="inactive">Inativos</SelectItem>
            </SelectContent>
          </Select>
          {isOwner && (
            <Button size="sm" className="h-9 gap-1.5 shrink-0" onClick={openAdd} disabled={missingLocation}>
              <Plus className="h-4 w-4" />
              Adicionar bairro
            </Button>
          )}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            <Package className="h-8 w-8 opacity-30" />
            {areas.length === 0 ? "Nenhum bairro cadastrado ainda." : "Nenhum bairro encontrado para os filtros aplicados."}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((area) => (
              <div
                key={area.id}
                className={`rounded-lg border p-3 transition-colors ${
                  area.active ? "border-border bg-card" : "border-border/50 bg-muted/30"
                }`}
              >
                <div className="flex items-start gap-3">
                  {isOwner && (
                    <Switch
                      checked={area.active}
                      onCheckedChange={() => handleToggleActive(area.id)}
                      disabled={saving}
                      className="mt-0.5 shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-medium text-sm ${!area.active ? "text-muted-foreground" : ""}`}>
                        {area.name}
                      </span>
                      {!area.active && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Inativo</Badge>
                      )}
                      {area.active && area.free_delivery && (
                        <Badge className="bg-green-500 hover:bg-green-600 text-white text-[10px] h-4 px-1.5">
                          <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> Frete grátis
                        </Badge>
                      )}
                      {area.active && !area.free_delivery && (
                        <Badge variant="outline" className="text-blue-600 border-blue-300 dark:border-blue-700 text-[10px] h-4 px-1.5">
                          {formatBRL(area.delivery_fee)}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {area.estimated_delivery_time && <span>⏱ {area.estimated_delivery_time}</span>}
                      {area.free_delivery && area.minimum_order_for_free_delivery > 0 && (
                        <span>Mínimo p/ grátis: {formatBRL(area.minimum_order_for_free_delivery)}</span>
                      )}
                      {area.lat != null && area.lng != null && (
                        <button
                          onClick={() => flyTo(area)}
                          className="flex items-center gap-0.5 text-primary hover:underline"
                          type="button"
                        >
                          <MapPin className="h-2.5 w-2.5" /> Ver no mapa
                        </button>
                      )}
                    </div>
                    {area.notes && (
                      <p className="mt-1 text-xs text-muted-foreground italic">{area.notes}</p>
                    )}
                  </div>
                  {isOwner && (
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(area)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(area.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* ── Add / Edit Dialog ──────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setSuggestions([]); setShowSuggestions(false); }}}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar bairro" : "Adicionar bairro"}</DialogTitle>
            <DialogDescription>
              Cidade: <strong>{cidade}</strong> — Estado: <strong>{estado}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">

            {/* Name with Nominatim autocomplete */}
            <div className="space-y-1.5">
              <Label htmlFor="da-name">Nome do bairro *</Label>
              <div className="relative" ref={suggestionsRef}>
                <div className="relative">
                  <Input
                    id="da-name"
                    value={form.name}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, name: e.target.value }));
                      setShowSuggestions(true);
                    }}
                    onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                    placeholder="Digite o nome do bairro..."
                    autoComplete="off"
                    className="pr-8"
                  />
                  {searchingNom ? (
                    <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : form.name ? (
                    <button
                      type="button"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => { setForm((f) => ({ ...f, name: "", lat: "", lng: "" })); setSuggestions([]); setShowSuggestions(false); }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>

                {/* Suggestions dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
                    <div className="p-1.5 text-[10px] text-muted-foreground border-b border-border px-2 py-1 flex items-center gap-1">
                      <MapPin className="h-2.5 w-2.5" />
                      Resultados via OpenStreetMap — clique para selecionar e preencher coordenadas
                    </div>
                    <ul className="max-h-48 overflow-y-auto">
                      {suggestions.map((s) => {
                        const name = extractNeighborhoodName(s);
                        const cityPart = s.address?.city || s.address?.town || s.address?.village || "";
                        const sub = s.display_name.length > 70 ? s.display_name.slice(0, 70) + "…" : s.display_name;
                        return (
                          <li key={s.place_id}>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                              onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}
                            >
                              <div className="font-medium">{name}{cityPart && cityPart !== name ? ` — ${cityPart}` : ""}</div>
                              <div className="text-[11px] text-muted-foreground truncate">{sub}</div>
                              <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                                {parseFloat(s.lat).toFixed(4)}, {parseFloat(s.lon).toFixed(4)}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Digite o nome e aguarde as sugestões do OpenStreetMap. Ao selecionar, lat/lng são preenchidos automaticamente.
              </p>
            </div>

            {/* Active + Free */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="da-active" className="cursor-pointer">Bairro ativo</Label>
                <Switch id="da-active" checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="da-free" className="cursor-pointer">Frete grátis</Label>
                <Switch id="da-free" checked={form.free_delivery} onCheckedChange={(v) => setForm((f) => ({ ...f, free_delivery: v }))} />
              </div>
            </div>

            {/* Fee + Min order */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="da-fee">
                  Taxa de entrega (R$)
                  {form.free_delivery && <span className="ml-1 text-xs text-muted-foreground">(fallback)</span>}
                </Label>
                <MoneyInput
                  id="da-fee"
                  value={form.delivery_fee}
                  onChange={(v) => setForm((f) => ({ ...f, delivery_fee: v }))}
                  placeholder="0,00"
                />
                {form.free_delivery && (
                  <p className="text-[11px] text-muted-foreground">Cobrado quando subtotal não atingir o mínimo.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="da-min">Mínimo p/ frete grátis (R$)</Label>
                <MoneyInput
                  id="da-min"
                  value={form.minimum_order_for_free_delivery}
                  onChange={(v) => setForm((f) => ({ ...f, minimum_order_for_free_delivery: v }))}
                  placeholder="0,00 = sempre grátis"
                  disabled={!form.free_delivery}
                />
              </div>
            </div>

            {/* Delivery time */}
            <div className="space-y-1.5">
              <Label>Tempo estimado de entrega</Label>
              <Select value={form.estimated_delivery_time} onValueChange={(v) => setForm((f) => ({ ...f, estimated_delivery_time: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DELIVERY_TIMES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Coordinates (auto-filled or manual) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Coordenadas</Label>
                {form.lat && form.lng && (
                  <Badge variant="outline" className="text-[10px] gap-1 text-green-600 border-green-400">
                    <CheckCircle2 className="h-2.5 w-2.5" /> Preenchidas
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="da-lat" className="text-xs text-muted-foreground">Latitude</Label>
                  <Input
                    id="da-lat"
                    value={form.lat}
                    onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
                    placeholder="-21.5565"
                    inputMode="decimal"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="da-lng" className="text-xs text-muted-foreground">Longitude</Label>
                  <Input
                    id="da-lng"
                    value={form.lng}
                    onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
                    placeholder="-45.4368"
                    inputMode="decimal"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Preenchidas automaticamente ao selecionar uma sugestão. Se necessário, edite manualmente.
              </p>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="da-notes">Observações (opcional)</Label>
              <Textarea
                id="da-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Ex.: Entrega disponível somente em dias úteis."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingId ? "Salvar alterações" : "Adicionar bairro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover bairro?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={saving}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ── Checkout helper (export for use in delivery order flow) ─────────────────

export function calculateDeliveryByNeighborhood(
  customerNeighborhood: string,
  cartSubtotal: number,
  deliveryAreas: DeliveryArea[]
): {
  available: boolean;
  deliveryFee: number | null;
  freeDelivery: boolean;
  estimatedTime: string | null;
  message: string;
} {
  const normalized = normalizeText(customerNeighborhood);
  const area = deliveryAreas.find(
    (item) => normalizeText(item.name) === normalized && item.active === true
  );

  if (!area) {
    return { available: false, deliveryFee: null, freeDelivery: false, estimatedTime: null, message: "Entrega indisponível para este bairro." };
  }

  const minimumOrder = Number(area.minimum_order_for_free_delivery || 0);
  const deliveryFee = Number(area.delivery_fee || 0);
  const estimatedTime = area.estimated_delivery_time || null;

  if (area.free_delivery) {
    if (minimumOrder > 0 && cartSubtotal < minimumOrder) {
      return {
        available: true, deliveryFee, freeDelivery: false, estimatedTime,
        message: `Frete grátis disponível acima de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(minimumOrder)}.`,
      };
    }
    return { available: true, deliveryFee: 0, freeDelivery: true, estimatedTime, message: "Frete grátis disponível para seu bairro!" };
  }

  return {
    available: true, deliveryFee, freeDelivery: false, estimatedTime,
    message: `Taxa de entrega: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(deliveryFee)}.`,
  };
}
