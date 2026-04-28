import { scrollAppToTop } from "@/lib/scrollToTop";
import { fmtPct, cn } from "@/lib/utils";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Package,
  Pencil,
  Trash2,
  Loader2,
  TrendingUp,
  AlertCircle,
  Filter,
  Wand2,
  ChevronLeft,
  ChevronRight,
  ScanBarcode,
  X,
  ChevronsUpDown,
  Check,
  Receipt,
} from "lucide-react";
import { BarcodeScanner } from "@/components/app/BarcodeScanner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { searchNcm, formatNcm, type BrasilApiNcm } from "@/lib/brasilApiNcm";

// ── Constants ─────────────────────────────────────────────────────────────────

const PREDEFINED_CATEGORIES = [
  // Mercado / supermercado
  "Mercearia",
  "Hortifruti",
  "Frutas",
  "Legumes",
  "Verduras",
  "Açougue",
  "Peixaria",
  "Padaria",
  "Confeitaria",
  "Frios",
  "Frios e Laticínios",
  "Laticínios",
  "Congelados",
  "Bebidas",
  "Bebidas Alcoólicas",
  "Doces e Sobremesas",
  "Biscoitos e Snacks",
  "Salgadinhos & Snacks",
  "Matinais",

  // Lanchonete / restaurante
  "Lanches",
  "Pizzaria",
  "Pratos",
  "Marmitas",
  "Porções",
  "Saladas",
  "Sopas",
  "Salgados",
  "Sorveteria",
  "Açaí e Sucos",
  "Cafeteria",
  "Combos e Promoções",

  // Limpeza e higiene
  "Limpeza",
  "Higiene Pessoal",
  "Perfumaria",
  "Cosméticos",
  "Cuidados com Bebê",
  "Descartáveis",

  // Farmácia / saúde
  "Farmácia",
  "Suplementos",
  "Saúde e Bem-estar",

  // Pet
  "Pet Shop",

  // Loja / departamentos
  "Bebê e Infantil",
  "Brinquedos",
  "Papelaria",
  "Eletrônicos",
  "Eletrodomésticos",
  "Informática",
  "Telefonia e Acessórios",
  "Cama, Mesa e Banho",
  "Utilidades Domésticas",
  "Ferramentas",
  "Material de Construção",
  "Elétrica e Hidráulica",
  "Tintas e Acessórios",
  "Jardinagem",
  "Automotivo",
  "Calçados",
  "Vestuário",
  "Acessórios",
  "Joias e Bijuterias",
  "Esporte e Lazer",
  "Livraria",
  "Games",
  "Decoração",
  "Presentes",
  "Festas",

  // Operacional
  "Embalagens",
  "Tabacaria",
  "Recargas",
  "Serviços",
  "Outros",
];

// ── Types ──────────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  numeric_id: number;
  company_id: string;
  name: string;
  description: string | null;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  cost_price: number;
  sale_price: number;
  stock_quantity: number;
  stock_unit: string;
  is_active: boolean;
  is_promotion: boolean;
  is_prepared: boolean;
  promotion_price: number | null;
  promotion_start: string | null;
  promotion_end: string | null;
  image_url: string | null;
  ncm: string | null;
  created_at: string;
  updated_at: string;
}

interface ProductAddon {
  id: string;
  product_id: string;
  name: string;
  price: number;
  sort_order: number;
}

type AddonDraft = {
  id?: string;
  name: string;
  price: string;
};

type ProductForm = {
  name: string;
  description: string;
  sku: string;
  barcode: string;
  category: string;
  cost_price: string;
  sale_price: string;
  stock_quantity: string;
  stock_unit: string;
  min_stock: string;
  is_active: boolean;
  is_promotion: boolean;
  is_prepared: boolean;
  promotion_price: string;
  promotion_start: string;
  promotion_end: string;
  ncm: string;
};

const EMPTY_FORM: ProductForm = {
  name: "",
  description: "",
  sku: "",
  barcode: "",
  category: "",
  cost_price: "0,00",
  sale_price: "0,00",
  stock_quantity: "",
  stock_unit: "un",
  min_stock: "",
  is_active: true,
  is_promotion: false,
  is_prepared: false,
  promotion_price: "0,00",
  promotion_start: "",
  promotion_end: "",
  ncm: "",
};

const STOCK_UNITS = ["un", "kg", "g", "L", "mL", "cx", "pç", "m", "m²"];
const INTEGER_UNITS = ["un", "cx", "pç"];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtBRL(value: number | null | undefined) {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function calcMargin(cost: number, sale: number): number | null {
  if (sale <= 0) return null;
  return ((sale - cost) / sale) * 100;
}

function calcMarkup(cost: number, sale: number): number | null {
  if (cost <= 0) return null;
  return ((sale - cost) / cost) * 100;
}

// Converts thousandths (integer) → formatted string "1.234,567"
function formatStock3(digits: number): string {
  const abs = Math.abs(Math.round(digits));
  const str = String(abs).padStart(4, "0");
  const intPart = str.slice(0, -3).replace(/\B(?=(\d{3})+(?!\d))/g, ".") || "0";
  const decPart = str.slice(-3);
  return `${intPart},${decPart}`;
}

// Parses stock string to float according to unit type
function parseStock(value: string, unit: string): number {
  if (INTEGER_UNITS.includes(unit)) {
    return parseInt(value.replace(/\D/g, "") || "0", 10);
  }
  const digits = parseInt(value.replace(/\D/g, "") || "0", 10);
  return digits / 1000;
}

// Formats a stored stock number to the form string
function formatStockValue(qty: number, unit: string): string {
  if (INTEGER_UNITS.includes(unit)) {
    return Math.round(qty).toString();
  }
  return formatStock3(Math.round(qty * 1000));
}

// Converts cents (integer) → formatted string "1.234,56"
function fromCents(cents: number): string {
  const abs = Math.abs(Math.round(cents));
  const str = String(abs).padStart(3, "0");
  const intPart = str.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decPart = str.slice(-2);
  return `${intPart || "0"},${decPart}`;
}

// Converts formatted string "1.234,56" → float 1234.56
function parseBRL(value: string): number {
  const cents = parseInt(value.replace(/\D/g, "") || "0", 10);
  return cents / 100;
}

// Bank-style currency input: digits enter right-to-left, always 2 decimals
function CurrencyInput({
  value,
  onChange,
  ...props
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  "data-testid"?: string;
  placeholder?: string;
}) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const hasSelection =
      el.selectionStart != null &&
      el.selectionEnd != null &&
      el.selectionStart !== el.selectionEnd;
    if (e.key >= "0" && e.key <= "9") {
      e.preventDefault();
      const cents = hasSelection ? 0 : parseInt(value.replace(/\D/g, "") || "0", 10);
      onChange(fromCents(cents * 10 + parseInt(e.key, 10)));
    } else if (e.key === "Backspace") {
      e.preventDefault();
      if (hasSelection) {
        onChange("0,00");
      } else {
        const cents = parseInt(value.replace(/\D/g, "") || "0", 10);
        onChange(fromCents(Math.floor(cents / 10)));
      }
    } else if (e.key === "Delete") {
      e.preventDefault();
      onChange("0,00");
    }
  };

  return (
    <Input
      {...props}
      value={value || "0,00"}
      onKeyDown={handleKeyDown}
      onChange={() => {}}
      inputMode="numeric"
      className="font-mono tabular-nums"
    />
  );
}

// Stock input: integer for "un/cx/pç", 3-decimal bank-style for the rest
function StockInput({
  value,
  unit,
  onChange,
  ...props
}: {
  value: string;
  unit: string;
  onChange: (v: string) => void;
  "data-testid"?: string;
}) {
  const isInt = INTEGER_UNITS.includes(unit);

  const handleDecimalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const hasSelection =
      el.selectionStart != null &&
      el.selectionEnd != null &&
      el.selectionStart !== el.selectionEnd;
    if (e.key >= "0" && e.key <= "9") {
      e.preventDefault();
      const digits = hasSelection ? 0 : parseInt(value.replace(/\D/g, "") || "0", 10);
      onChange(formatStock3(digits * 10 + parseInt(e.key, 10)));
    } else if (e.key === "Backspace") {
      e.preventDefault();
      if (hasSelection) {
        onChange("");
      } else {
        const digits = parseInt(value.replace(/\D/g, "") || "0", 10);
        const next = Math.floor(digits / 10);
        onChange(next === 0 ? "" : formatStock3(next));
      }
    } else if (e.key === "Delete") {
      e.preventDefault();
      onChange("");
    }
  };

  if (isInt) {
    return (
      <Input
        {...props}
        value={value}
        placeholder="0"
        inputMode="numeric"
        className="flex-1 font-mono tabular-nums"
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      />
    );
  }

  return (
    <Input
      {...props}
      value={value}
      placeholder="0,000"
      onKeyDown={handleDecimalKeyDown}
      onChange={() => {}}
      inputMode="numeric"
      className="flex-1 font-mono tabular-nums"
    />
  );
}

// Generates SKU from product name: "Hambúrguer" → "HAM-0042"
function generateSKU(name: string): string {
  const prefix = (name || "PRD")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 3)
    .padEnd(3, "X");
  const suffix = String(Math.floor(Math.random() * 9999) + 1).padStart(4, "0");
  return `${prefix}-${suffix}`;
}

// ── Auto-categorization by product name ────────────────────────────────────────
// Maps common Brazilian product/keyword terms (lowercased, no accents) to one of
// the categories from PREDEFINED_CATEGORIES. The longest matching keyword wins,
// so "vinho tinto" beats "tinto" and "agua com gas" beats "agua".
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Lanches: [
    "hamburguer", "hamburgue", "burguer", "burger", "x-burger", "x-tudo",
    "x-salada", "x-egg", "x-bacon", "x-cala", "x-frango", "x-fil", "xis",
    "hot dog", "hotdog", "cachorro quente", "sanduiche", "sanduba",
    "lanche", "misto quente", "americano", "beirute", "wrap",
  ],
  Pizzaria: ["pizza", "calzone", "esfiha", "esfirra", "broto"],
  Pratos: [
    "prato feito", "pf ", "executivo", "almoco", "refeicao",
    "filet", "file mignon a", "strogonoff", "estrogonoff", "parmegiana",
    "feijoada", "moqueca", "risoto", "tropeiro", "baiao",
  ],
  Marmitas: ["marmita", "marmitex", "quentinha"],
  "Porções": ["porcao", "batata frita", "polenta frita", "frango a passarinho", "isca de"],
  Saladas: ["salada"],
  Sopas: ["sopa", "caldo verde", "canja", "sopao", "creme de"],
  Salgados: [
    "salgado", "coxinha", "kibe", "quibe", "pastel", "empada",
    "enroladinho", "risole", "rissole", "croquete", "bolinha de queijo",
    "bolinho de bacalhau", "esfiha",
  ],
  Sorveteria: ["sorvete", "picole", "casquinha", "milkshake", "milk shake", "sundae"],
  "Açaí e Sucos": ["acai", "vitamina", "smoothie", "suco natural", "suco de"],
  Cafeteria: [
    "cafe expresso", "cafezinho", "cappuccino", "capuccino", "latte",
    "espresso", "expresso", "mocha", "chocolate quente",
  ],
  "Combos e Promoções": ["combo", "promocao", "promo", "kit ", "oferta"],

  "Doces e Sobremesas": [
    "bolo", "torta doce", "brigadeiro", "beijinho", "brownie",
    "mousse", "pudim", "trufa", "doce de", "sobremesa", "churros",
    "pacoca", "cocada", "marshmallow", "petit gateau",
  ],
  "Biscoitos e Snacks": [
    "biscoito", "bolacha", "cracker", "wafer", "cookie", "torrada",
  ],
  "Salgadinhos & Snacks": [
    "salgadinho", "chips", "doritos", "ruffles", "fandangos", "cheetos",
    "pipoca", "torcida", "fofura", "elma chips", "pringles", "tortilhas",
    "amendoim",
  ],
  Matinais: [
    "cereal", "granola", "sucrilhos", "aveia", "nescau", "toddy",
    "leite em po", "achocolatado",
  ],
  Padaria: [
    "pao frances", "pao de queijo", "pao integral", "pao de forma",
    "pao doce", "paes", " pao ", "baguete", "bisnaga", "croissant",
    "focaccia", "ciabatta", "brioche", "rosca",
  ],
  Confeitaria: ["torta ", "cupcake", "macaron", "eclair"],

  Hortifruti: ["hortifruti", "ovo ", "ovos"],
  Frutas: [
    "banana", "maca ", " maca", "laranja", "abacaxi", "uva", "melancia",
    "melao", "mamao", "manga", "abacate", "limao", "morango", "pera",
    "pessego", "kiwi", "tangerina", "mexerica", "ameixa", "goiaba",
    "maracuja", "caqui", "figo", "pitaya", "framboesa", "mirtilo",
    "amora", "coco verde", "fruta",
  ],
  Legumes: [
    "tomate", "cenoura", "batata ", "batata-", "batata doce",
    "mandioca", "abobora", "abobrinha", "pepino", "pimentao", "beterraba",
    "chuchu", "berinjela", "quiabo", "vagem", "milho verde", "ervilha",
    "alho", "gengibre",
  ],
  Verduras: [
    "alface", "couve", "espinafre", "salsa", "cebolinha", "rucula",
    "agriao", "almeirao", "acelga", "repolho", "brocolis", "couve flor",
    "couve-flor", "verdura", "folha verde", "cheiro verde",
  ],
  "Açougue": [
    "carne", "contra file", "picanha", "alcatra", "filet mignon",
    "file mignon", "costela", "cupim", "fraldinha", "maminha",
    "patinho", "acem", "musculo", "bisteca", "frango", "peito de frango",
    "coxa de frango", "sobrecoxa", "asa de frango", "peru", "lombo",
    "pernil", "linguica", "salsicha", "moida",
  ],
  Peixaria: [
    "peixe", "salmao", "atum", "sardinha", "tilapia", "bacalhau",
    "pescada", "merluza", "camarao", "lula", "polvo", "mexilhao",
    "ostra", "lagosta", "siri", "marisco",
  ],
  "Frios e Laticínios": [
    "queijo", "mussarela", "muzzarela", "parmesao", "cheddar",
    "gorgonzola", "brie", "ricota", "requeijao",
  ],
  "Laticínios": [
    "leite ", " leite", "leite integral", "leite desnatado",
    "leite semidesnatado", "leite condensado", "creme de leite",
    "manteiga", "margarina", "iogurte", "danone", "yogurte", "yakult",
    "nata ", " nata", "chantilly", "kefir", "queijinho petit",
  ],
  Frios: [
    "presunto", "peito de peru", "mortadela", "salame", "copa lombo",
    "blanquet", "bacon", "apresuntado", "salsicha tipo hot",
    "frios fatiados",
  ],
  Congelados: [
    "congelado", "polpa de fruta", "lasanha congelada", "pizza congelada",
    "nuggets", "hamburguer congelado",
  ],

  Bebidas: [
    "refrigerante", "coca cola", "coca-cola", "pepsi", "guarana", "fanta",
    "sprite", "sukita", "tubaina", "agua mineral", "agua com gas",
    "agua tonica", "agua sem gas", " agua ", "nectar", "isotonico",
    "gatorade", "powerade", "energetico", "red bull", "monster", "baly",
    " cha ", "cha gelado", "cha mate", "mate leao", "nestea", "h2o",
  ],
  "Bebidas Alcoólicas": [
    "cerveja", "chopp", "ipa", "lager", "pilsen", "weiss", "stout",
    "vinho", " tinto", " branco", "rose", "espumante", "prosecco",
    "champanhe", "champagne", "whisky", "whiskey", "vodka", "gin ",
    "cachaca", "pinga", "conhaque", " rum", "tequila", "vermute",
    "licor", "jagermeister", "baileys", "batida", "caipirinha",
    "caipiroska", "drink", "absinto",
  ],

  Limpeza: [
    "detergente", "sabao em po", "sabao liquido", "sabao de coco",
    "desinfetante", "agua sanitaria", "alvejante", "amaciante",
    "lustra movel", "multiuso", "limpa vidro", "veja ", " omo",
    "brilhante", "comfort", "ype", "pinho sol", "esponja", "vassoura",
    "rodo", "pano de chao", "saco de lixo",
  ],
  "Higiene Pessoal": [
    "shampoo", "condicionador", "sabonete", "escova de dente",
    "creme dental", "pasta de dente", "fio dental", "antisseptico bucal",
    "enxaguante", "desodorante", "antitranspirante", "papel higienico",
    "lenco umedecido", "absorvente", "fralda",
  ],
  Perfumaria: ["perfume", "colonia", "deo colonia", "body splash"],
  "Cosméticos": [
    "hidratante", "creme facial", "locao", "batom", "esmalte", "base ",
    "po facial", "maquiagem", "rimel", "sombra", "blush",
  ],
  "Cuidados com Bebê": ["mamadeira", "chupeta", "papinha", "talco"],
  "Descartáveis": [
    "copo descartavel", "prato descartavel", "talher descartavel",
    "guardanapo", "papel toalha", "papel aluminio", "filme pvc",
  ],

  "Farmácia": [
    "remedio", "dipirona", "paracetamol", "ibuprofeno", "omeprazol",
    "novalgina", "tylenol", "neosaldina", "advil", "aspirina",
    "comprimido", "capsula", "xarope", "pomada", "antialergico",
  ],
  Suplementos: [
    "whey", "creatina", "bcaa", "hipercalorico", "suplemento",
    "proteina ", "vitamina c", "vitamina d", "vitamina b",
    "polivitaminico", "termogenico",
  ],

  "Pet Shop": [
    "racao", "petisco pet", "areia para gato", "coleira",
    "antipulgas", "tapete higienico", "biscoito pet",
  ],

  "Bebê e Infantil": ["mamadeira", "chupeta", "fralda"],
  Brinquedos: ["brinquedo", "boneca", "carrinho de brinquedo", "lego", "pelucia"],
  Papelaria: [
    "caderno", "caneta", "lapis", "borracha", "regua", "mochila",
    "estojo", "papel sulfite", "cola escolar", "agenda", "marca texto",
  ],
  "Eletrônicos": [
    "fone de ouvido", "headphone", "headset", "caixa de som", "mouse",
    "teclado", "ssd ", " hd ", "pendrive", "cabo usb", "carregador",
  ],
  "Eletrodomésticos": [
    "liquidificador", "batedeira", "micro-ondas", "microondas",
    "geladeira", "fogao", "ferro de passar", "ventilador", "aspirador",
    "cafeteira",
  ],
  "Informática": ["notebook", "computador", "monitor", "impressora"],
  "Telefonia e Acessórios": [
    "capa de celular", "capinha", "pelicula", "fone bluetooth",
  ],
  "Cama, Mesa e Banho": [
    "lencol", "fronha", "toalha de banho", "toalha de rosto", "edredom",
    "cobertor", "travesseiro", "jogo de cama",
  ],
  "Utilidades Domésticas": [
    "panela", "frigideira", "tigela", "jarra", " colher ", " garfo ",
    " faca ", "concha de", "escorredor", "abridor",
  ],
  Ferramentas: [
    "martelo", "chave de fenda", "chave allen", "alicate", "furadeira",
    "parafusadeira", "serra ", "broca", "trena",
  ],
  "Material de Construção": [
    "cimento", "areia", "brita", "tijolo", "telha", "prego ", "parafuso",
    "argamassa", "rejunte",
  ],
  "Elétrica e Hidráulica": [
    "fio eletrico", "tomada", "interruptor", "cano pvc", "conexao pvc",
    "lampada", "disjuntor", "fita isolante",
  ],
  "Tintas e Acessórios": [
    "tinta acrilica", "tinta esmalte", "tinta latex", "pincel", "rolo de pintura",
    "lixa", "massa corrida", "thinner",
  ],
  Jardinagem: ["adubo", "vaso ", "semente", "fertilizante", "terra adubada"],
  Automotivo: [
    "oleo de motor", "oleo lubrificante", "filtro de oleo", "pneu",
    "bateria automotiva", "cera automotiva", "lava auto",
  ],
  "Calçados": ["tenis", "sapato", "sandalia", "chinelo", "bota", "sapatilha"],
  "Vestuário": [
    "camiseta", "camisa", "calca", "bermuda", "vestido", "saia",
    "blusa", "jaqueta", "casaco", "meia ", "cueca", "calcinha", "sutia",
  ],
  "Acessórios": ["cinto", "carteira", "boné", "bone "],
  "Joias e Bijuterias": ["anel", "colar", "brinco", "pulseira", "relogio"],
  "Esporte e Lazer": ["bola", "bicicleta", "halter", "chuteira", "luva de boxe"],
  Livraria: ["livro", "revista", "gibi", "biblia"],
  Games: ["jogo de", "xbox", "playstation", "nintendo", "controle ps", "controle xbox"],
  "Decoração": ["quadro decorativo", "vaso decorativo", "almofada"],
  Festas: ["balao", "vela de aniversario", "fantasia"],

  Embalagens: [
    "caixa de pizza", "caixa para", "embalagem", "saco para pao",
    "papelao", "fita adesiva", "papel kraft",
  ],
  Tabacaria: ["cigarro", "charuto", "isqueiro", "fumo", "papel de seda", "seda "],
  Recargas: ["recarga", "cartao presente", "gift card"],
};

function normalizeForCategory(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function guessCategory(name: string): string | null {
  const n = ` ${normalizeForCategory(name)} `;
  if (n.trim().length < 3) return null;
  let bestCat: string | null = null;
  let bestLen = 0;
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      const k = normalizeForCategory(kw);
      if (n.includes(k) && k.length > bestLen) {
        bestCat = cat;
        bestLen = k.length;
      }
    }
  }
  return bestCat;
}

// ── Barcode lookup (USB/Bluetooth reader + camera) ─────────────────────────────

// Cleans a category string like "en:dairy-products" → "Dairy Products"
function cleanCategory(raw: string): string {
  return raw
    .replace(/^(en:|pt:|fr:|es:)/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c: string) => c.toUpperCase())
    .trim();
}

type LookupResult = { name: string; description: string; category: string } | null;

// Tries an Open*Facts endpoint and normalizes the response
async function tryOpenFactsAPI(url: string): Promise<LookupResult> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status !== 1 || !json.product) return null;
    const p = json.product;
    const rawCategory: string =
      p.categories_tags?.[0] ?? p.categories ?? p.brands ?? "";
    return {
      name:
        p.product_name_pt ||
        p.product_name ||
        p.product_name_en ||
        p.generic_name_pt ||
        p.generic_name ||
        "",
      description:
        p.ingredients_text_pt ||
        p.ingredients_text ||
        p.generic_name_pt ||
        p.generic_name ||
        "",
      category: cleanCategory(rawCategory),
    };
  } catch {
    return null;
  }
}

// Cosmos (Bluesoft) — Brazilian product database, requires free API key
async function tryCosmos(barcode: string): Promise<LookupResult> {
  const token = import.meta.env.VITE_COSMOS_API_KEY as string | undefined;
  if (!token) return null;
  try {
    const res = await fetch(`https://api.cosmos.bluesoft.com.br/gtins/${barcode}.json`, {
      headers: {
        "X-Cosmos-Token": token,
        "User-Agent": "Cosmos-API-Request",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const j = await res.json();
    if (!j || (!j.description && !j.brand)) return null;
    const category =
      j.gpc?.description ||
      j.category?.description ||
      j.ncm?.description ||
      "";
    const brand = j.brand?.name ? `${j.brand.name} — ` : "";
    return {
      name: j.description || "",
      description: brand
        ? `${brand}${j.gpc?.description ?? ""}`.trim().replace(/—\s*$/, "")
        : j.gpc?.description || "",
      category: cleanCategory(category),
    };
  } catch {
    return null;
  }
}

// Tries the OpenGTINdb / EAN-Search public endpoint (no key, low rate limit but free)
async function tryUPCDatabase(barcode: string): Promise<LookupResult> {
  try {
    // Uses upcitemdb's "trial" endpoint — free, ~100 req/day per IP
    const res = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    const item = json?.items?.[0];
    if (!item) return null;
    return {
      name: item.title || "",
      description: item.description || item.brand || "",
      category: item.category || "",
    };
  } catch {
    return null;
  }
}

async function lookupBarcode(barcode: string): Promise<LookupResult> {
  const code = barcode.trim();
  if (!code) return null;

  // Cosmos (BR) first — best for Brazilian products
  const cosmosHit = await tryCosmos(code);
  if (cosmosHit && (cosmosHit.name || cosmosHit.description)) return cosmosHit;

  // Then try Open*Facts in parallel
  const sources: Promise<LookupResult>[] = [
    tryOpenFactsAPI(`https://world.openfoodfacts.org/api/v2/product/${code}.json`),
    tryOpenFactsAPI(`https://world.openbeautyfacts.org/api/v2/product/${code}.json`),
    tryOpenFactsAPI(`https://world.openproductsfacts.org/api/v2/product/${code}.json`),
    tryOpenFactsAPI(`https://world.openpetfoodfacts.org/api/v2/product/${code}.json`),
  ];

  const results = await Promise.all(sources);
  const hit = results.find((r) => r && (r.name || r.description));
  if (hit) return hit;

  // Last resort: UPC database (slower, has rate limit)
  return await tryUPCDatabase(code);
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function Produtos() {
  const { activeCompany } = useCompany();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [addons, setAddons] = useState<AddonDraft[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchScannerOpen, setSearchScannerOpen] = useState(false);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [categoryComboOpen, setCategoryComboOpen] = useState(false);
  const [ncmPopoverOpen, setNcmPopoverOpen] = useState(false);
  const [ncmQuery, setNcmQuery] = useState("");
  const [ncmResults, setNcmResults] = useState<BrasilApiNcm[]>([]);
  const [ncmLoading, setNcmLoading] = useState(false);

  useEffect(() => {
    if (!ncmPopoverOpen) return;
    const q = ncmQuery.trim();
    if (q.length < 2) {
      setNcmResults([]);
      return;
    }
    let cancelled = false;
    setNcmLoading(true);
    const t = setTimeout(async () => {
      try {
        const list = await searchNcm(q);
        if (!cancelled) setNcmResults(list);
      } catch {
        if (!cancelled) setNcmResults([]);
      } finally {
        if (!cancelled) setNcmLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
      setNcmLoading(false);
    };
  }, [ncmQuery, ncmPopoverOpen]);

  // ── Queries ────────────────────────────────────────────────────────────────

  const {
    data: products = [],
    isLoading,
    error,
  } = useQuery<Product[]>({
    queryKey: ["/api/products", activeCompany?.id],
    enabled: !!activeCompany?.id,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("company_id", activeCompany!.id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

  // ── Auto-expire promotions ─────────────────────────────────────────────────
  const checkedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!products.length || !activeCompany?.id) return;

    const now = new Date();

    // Products whose promotion just expired
    const expired = products.filter(
      (p) =>
        p.is_promotion &&
        p.promotion_end &&
        new Date(p.promotion_end) < now &&
        !checkedIdsRef.current.has(p.id)
    );

    // Products whose promotion should now start (promotion_start reached, promotion_end not yet)
    const starting = products.filter(
      (p) =>
        !p.is_promotion &&
        p.promotion_start &&
        p.promotion_end &&
        new Date(p.promotion_start) <= now &&
        new Date(p.promotion_end) > now &&
        p.promotion_price != null &&
        !checkedIdsRef.current.has(p.id)
    );

    if (expired.length === 0 && starting.length === 0) return;

    // Mark as checked so we don't run again for these products in the same session
    expired.forEach((p) => checkedIdsRef.current.add(p.id));
    starting.forEach((p) => checkedIdsRef.current.add(p.id));

    (async () => {
      const updates: Promise<unknown>[] = [];

      if (expired.length > 0) {
        updates.push(
          supabase
            .from("products")
            .update({ is_promotion: false })
            .in("id", expired.map((p) => p.id))
            .eq("company_id", activeCompany.id)
        );
      }

      if (starting.length > 0) {
        updates.push(
          supabase
            .from("products")
            .update({ is_promotion: true })
            .in("id", starting.map((p) => p.id))
            .eq("company_id", activeCompany.id)
        );
      }

      await Promise.all(updates);
      queryClient.invalidateQueries({ queryKey: ["/api/products", activeCompany.id] });

      if (expired.length > 0) {
        const names = expired.map((p) => p.name).join(", ");
        toast.info(
          expired.length === 1
            ? `Promoção encerrada: ${names}`
            : `${expired.length} promoções encerradas automaticamente`
        );
      }
      if (starting.length > 0) {
        const names = starting.map((p) => p.name).join(", ");
        toast.info(
          starting.length === 1
            ? `Promoção iniciada: ${names}`
            : `${starting.length} promoções iniciadas automaticamente`
        );
      }
    })();
  }, [products, activeCompany?.id]);

  // ── USB barcode reader → search filter ─────────────────────────────────────
  const usbSearchBufferRef = useRef("");
  const usbSearchLastKeyRef = useRef(0);

  const handleSearchBarcode = useCallback((code: string) => {
    setSearch(code);
    resetPage();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Don't intercept when the product form dialog is open (it has its own handler)
      if (dialogOpen) return;
      // Don't intercept when any input/textarea is focused
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const now = Date.now();
      const gap = now - usbSearchLastKeyRef.current;
      usbSearchLastKeyRef.current = now;
      const isScannerPace = gap < 50 || usbSearchBufferRef.current.length > 0;

      // Scanners often send Ctrl+J (LF) as terminator → opens browser downloads.
      // Treat it as Enter and swallow the shortcut.
      if (e.ctrlKey && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        const code = usbSearchBufferRef.current.trim();
        usbSearchBufferRef.current = "";
        if (code.length >= 3) handleSearchBarcode(code);
        return;
      }

      if (e.key === "Enter") {
        if (isScannerPace) e.preventDefault();
        const code = usbSearchBufferRef.current.trim();
        usbSearchBufferRef.current = "";
        if (code.length >= 3) {
          handleSearchBarcode(code);
        }
        return;
      }

      if (gap > 100) usbSearchBufferRef.current = "";
      if (e.key && e.key.length === 1) {
        if (isScannerPace) e.preventDefault();
        usbSearchBufferRef.current += e.key;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialogOpen, handleSearchBarcode]);

  const categories = useMemo(() => {
    const existing = products.map((p) => p.category).filter(Boolean) as string[];
    const merged = new Set([...PREDEFINED_CATEGORIES, ...existing]);
    return Array.from(merged).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [products]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku?.toLowerCase().includes(search.toLowerCase()) ||
        p.barcode?.toLowerCase().includes(search.toLowerCase()) ||
        p.category?.toLowerCase().includes(search.toLowerCase()) ||
        String(p.numeric_id).includes(search);
      const matchCat = categoryFilter === "all" || p.category === categoryFilter;
      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && p.is_active) ||
        (statusFilter === "inactive" && !p.is_active);
      return matchSearch && matchCat && matchStatus;
    });
  }, [products, search, categoryFilter, statusFilter]);

  const PAGE_SIZE = 8;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filters change
  const resetPage = () => setPage(1);

  // ── Mutations ──────────────────────────────────────────────────────────────

  async function saveAddons(productId: string, drafts: AddonDraft[]) {
    await supabase
      .from("product_addons" as never)
      .delete()
      .eq("product_id", productId);
    const valid = drafts
      .map((d, idx) => ({ name: d.name.trim(), price: parseBRL(d.price), idx }))
      .filter((d) => d.name.length > 0);
    if (valid.length === 0) return;
    const { error } = await supabase.from("product_addons" as never).insert(
      valid.map((d) => ({
        product_id: productId,
        name: d.name,
        price: d.price,
        sort_order: d.idx,
      })) as never,
    );
    if (error) throw error;
  }

  const createMutation = useMutation({
    mutationFn: async (values: typeof form) => {
      const { data: inserted, error } = await supabase
        .from("products")
        .insert({
        company_id: activeCompany!.id,
        name: values.name.trim(),
        description: values.description.trim() || null,
        sku: values.sku.trim() || null,
        barcode: values.barcode.trim() || null,
        category: values.category.trim() || null,
        cost_price: parseBRL(values.cost_price),
        sale_price: parseBRL(values.sale_price),
        stock_quantity: parseStock(values.stock_quantity, values.stock_unit),
        stock_unit: values.stock_unit,
        min_stock: parseStock(values.min_stock, values.stock_unit),
        is_active: values.is_active,
        is_promotion: values.is_promotion,
        is_prepared: values.is_prepared,
        promotion_price: values.is_promotion ? parseBRL(values.promotion_price) : null,
        promotion_start: values.is_promotion && values.promotion_start ? values.promotion_start : null,
        promotion_end: values.is_promotion && values.promotion_end ? values.promotion_end : null,
        ncm: values.ncm.replace(/\D/g, "").trim() || null,
      } as never)
        .select("id")
        .single();
      if (error) throw error;
      const newId = (inserted as { id: string } | null)?.id;
      if (newId) await saveAddons(newId, addons);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products", activeCompany?.id] });
      toast.success("Produto criado com sucesso!");
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async (values: typeof form) => {
      const { error } = await supabase
        .from("products")
        .update({
          name: values.name.trim(),
          description: values.description.trim() || null,
          sku: values.sku.trim() || null,
          barcode: values.barcode.trim() || null,
          category: values.category.trim() || null,
          cost_price: parseBRL(values.cost_price),
          sale_price: parseBRL(values.sale_price),
          stock_quantity: parseStock(values.stock_quantity, values.stock_unit),
          stock_unit: values.stock_unit,
          min_stock: parseStock(values.min_stock, values.stock_unit),
          is_active: values.is_active,
          is_promotion: values.is_promotion,
          is_prepared: values.is_prepared,
          promotion_price: values.is_promotion ? parseBRL(values.promotion_price) : null,
          promotion_start: values.is_promotion && values.promotion_start ? values.promotion_start : null,
          promotion_end: values.is_promotion && values.promotion_end ? values.promotion_end : null,
          ncm: values.ncm.replace(/\D/g, "").trim() || null,
        } as never)
        .eq("id", editProduct!.id);
      if (error) throw error;
      await saveAddons(editProduct!.id, addons);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products", activeCompany?.id] });
      toast.success("Produto atualizado!");
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products", activeCompany?.id] });
      toast.success("Produto removido");
      setDeleteId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Dialog helpers ─────────────────────────────────────────────────────────

  function openCreate() {
    setEditProduct(null);
    setForm(EMPTY_FORM);
    setAddons([]);
    setDialogOpen(true);
  }

  async function openEdit(product: Product) {
    setEditProduct(product);
    setAddons([]);
    const { data: addonRows } = await supabase
      .from("product_addons" as never)
      .select("*")
      .eq("product_id", product.id)
      .order("sort_order");
    if (addonRows) {
      setAddons(
        (addonRows as unknown as ProductAddon[]).map((a) => ({
          id: a.id,
          name: a.name,
          price: fromCents(Math.round((a.price ?? 0) * 100)),
        })),
      );
    }
    setForm({
      name: product.name,
      description: product.description ?? "",
      sku: product.sku ?? "",
      barcode: product.barcode ?? "",
      category: product.category ?? "",
      cost_price: fromCents(Math.round(product.cost_price * 100)),
      sale_price: fromCents(Math.round(product.sale_price * 100)),
      stock_quantity: formatStockValue(product.stock_quantity, product.stock_unit),
      stock_unit: product.stock_unit,
      min_stock: formatStockValue((product as any).min_stock ?? 0, product.stock_unit),
      is_active: product.is_active,
      is_promotion: product.is_promotion,
      is_prepared: (product as any).is_prepared ?? false,
      promotion_price: fromCents(Math.round((product.promotion_price ?? 0) * 100)),
      promotion_start: product.promotion_start ?? "",
      promotion_end: product.promotion_end ?? "",
      ncm: (product as any).ncm ?? "",
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditProduct(null);
    setForm(EMPTY_FORM);
    setAddons([]);
  }

  function handleScanResult(result: { barcode: string; name?: string; description?: string; category?: string }) {
    setForm((f) => ({
      ...f,
      barcode: result.barcode,
      ...(result.name ? { name: result.name } : {}),
      ...(result.description ? { description: result.description } : {}),
      ...(result.category ? { category: result.category } : {}),
    }));
    if (result.name) {
      toast.success(`Produto encontrado: ${result.name}`);
    }
    // Auto-fire the full barcode lookup (Cosmos / UPC / OpenFoodFacts) right
    // after a scan so the user doesn't have to focus the field and press Enter.
    void handleBarcodeLookup(result.barcode);
  }

  // ── USB scanner inside the product dialog ─────────────────────────────────
  // When the create/edit modal is open, capture rapid scanner keystrokes
  // (no matter which field is focused) and route them to the barcode field,
  // then trigger the lookup automatically.
  // Strategy: buffer every printable key and prevent default. If a terminator
  // (Enter / Ctrl+J) arrives quickly enough → treat as barcode. Otherwise,
  // after a short idle, restore the buffered chars to the focused input so
  // manual typing keeps working.
  const dialogScanBufferRef = useRef("");
  const dialogScanLastKeyRef = useRef(0);
  const dialogScanIdleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!dialogOpen) return;

    function clearIdleTimer() {
      if (dialogScanIdleTimerRef.current != null) {
        window.clearTimeout(dialogScanIdleTimerRef.current);
        dialogScanIdleTimerRef.current = null;
      }
    }

    function restoreToFocusedField(text: string) {
      if (!text) return;
      const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
      if (!el) return;
      const tag = el.tagName;
      if (tag !== "INPUT" && tag !== "TEXTAREA") return;
      try {
        el.focus();
        // Triggers React's onChange via native input event
        document.execCommand("insertText", false, text);
      } catch {
        /* ignore */
      }
    }

    function flushAsBarcode() {
      clearIdleTimer();
      const code = dialogScanBufferRef.current.trim();
      dialogScanBufferRef.current = "";
      if (code.length < 3) return;
      setForm((f) => ({ ...f, barcode: code }));
      handleBarcodeLookup(code);
    }

    function flushAsManualTyping() {
      clearIdleTimer();
      const text = dialogScanBufferRef.current;
      dialogScanBufferRef.current = "";
      restoreToFocusedField(text);
    }

    function onKeyDown(e: KeyboardEvent) {
      // Skip when an input/textarea/select/contenteditable is focused —
      // user is typing manually (price, name, etc). The scanner only fires
      // when the dialog body is focused or focus is on a button.
      const tgt = e.target as HTMLElement | null;
      const tag = tgt?.tagName;
      const isEditable =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tgt?.isContentEditable;

      // Don't interfere with modifier shortcuts (cmd/ctrl + key) except Ctrl+J terminator
      const isCtrlJ = e.ctrlKey && (e.key === "j" || e.key === "J");
      if ((e.ctrlKey || e.metaKey || e.altKey) && !isCtrlJ) return;

      // Allow Ctrl+J anywhere (scanner terminator)
      if (isEditable && !isCtrlJ && e.key !== "Enter" && e.key && e.key.length === 1) {
        // Only allow capture if the keys are coming at scanner pace already buffered.
        if (dialogScanBufferRef.current.length === 0) return;
      }

      const now = Date.now();
      const gap = now - dialogScanLastKeyRef.current;
      dialogScanLastKeyRef.current = now;

      // Scanner terminators
      if (isCtrlJ || e.key === "Enter") {
        if (dialogScanBufferRef.current.length >= 3) {
          e.preventDefault();
          e.stopPropagation();
          flushAsBarcode();
        }
        return;
      }

      // Only buffer printable single chars
      if (!e.key || e.key.length !== 1) return;

      // If too much time passed since last char, the previous buffer was manual typing
      if (gap > 200 && dialogScanBufferRef.current.length > 0) {
        flushAsManualTyping();
      }

      e.preventDefault();
      e.stopPropagation();
      dialogScanBufferRef.current += e.key;

      clearIdleTimer();
      dialogScanIdleTimerRef.current = window.setTimeout(() => {
        // No terminator → user is typing manually, restore the chars
        flushAsManualTyping();
      }, 120);
    }

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true } as any);
      clearIdleTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen]);

  async function handleBarcodeLookup(barcode: string) {
    if (!barcode.trim()) return;
    setBarcodeLoading(true);
    try {
      const info = await lookupBarcode(barcode.trim());
      if (info) {
        setForm((f) => ({
          ...f,
          ...(info.name ? { name: info.name } : {}),
          ...(info.description ? { description: info.description } : {}),
          ...(info.category ? { category: info.category } : {}),
        }));
        toast.success(info.name ? `Produto encontrado: ${info.name}` : "Código reconhecido. Verifique os campos.");
      } else {
        toast.info("Produto não encontrado na base. Preencha os campos manualmente.");
      }
    } finally {
      setBarcodeLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Informe o nome do produto");
      return;
    }
    if (editProduct) {
      updateMutation.mutate(form);
    } else {
      createMutation.mutate(form);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  // ── Computed margin/markup for form ───────────────────────────────────────

  const formCost = parseBRL(form.cost_price);
  const formSale = parseBRL(form.sale_price);
  const formMargin = calcMargin(formCost, formSale);
  const formMarkup = calcMarkup(formCost, formSale);

  // ── Render ─────────────────────────────────────────────────────────────────

  const tableNotFound =
    error &&
    (error as any)?.message?.includes("relation") &&
    (error as any)?.message?.includes("does not exist");

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4 sm:space-y-6 sm:p-6 md:p-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Produtos</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {isLoading ? "Carregando..." : `${products.length} produto${products.length !== 1 ? "s" : ""} cadastrado${products.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button onClick={openCreate} data-testid="button-novo-produto" className="w-full shrink-0 sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Novo Produto
        </Button>
      </div>

      {/* Migration banner */}
      {tableNotFound && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-foreground">Tabela de produtos não encontrada</p>
              <p className="text-muted-foreground">
                Execute o SQL do arquivo{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  supabase/migrations/20260420_products.sql
                </code>{" "}
                no editor SQL do seu projeto Supabase para criar a tabela.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              data-testid="input-search"
              placeholder="Buscar por código, nome, SKU, código de barras..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }}
              className="pl-9"
              onKeyDown={(e) => {
                if (e.key === "Enter" && search.trim().length >= 3) {
                  // If it looks like a barcode (all digits, ≥8 chars), keep as-is
                  resetPage();
                }
              }}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0"
            data-testid="button-scan-search"
            title="Escanear com câmera para pesquisar"
            onClick={() => setSearchScannerOpen(true)}
          >
            <ScanBarcode className="h-4 w-4" />
          </Button>
        </div>
        <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); resetPage(); }}>
          <SelectTrigger className="w-full sm:w-44" data-testid="select-category-filter">
            <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); resetPage(); }}>
          <SelectTrigger className="w-full sm:w-36" data-testid="select-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="border-border/60">
        {isLoading ? (
          <CardContent className="flex items-center justify-center p-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        ) : !tableNotFound && filtered.length === 0 ? (
          <CardContent className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-16 text-center">
            <div className="rounded-full bg-muted p-4">
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
            {products.length === 0 ? (
              <>
                <h3 className="text-lg font-semibold">Nenhum produto cadastrado</h3>
                <p className="max-w-xs text-sm text-muted-foreground">
                  Cadastre seus produtos com custo, preço, margem e estoque para começar a vender.
                </p>
                <Button onClick={openCreate} className="mt-2" data-testid="button-empty-add">
                  <Plus className="mr-2 h-4 w-4" />
                  Cadastrar primeiro produto
                </Button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold">Nenhum produto encontrado</h3>
                <p className="text-sm text-muted-foreground">Tente ajustar os filtros de busca.</p>
              </>
            )}
          </CardContent>
        ) : !tableNotFound ? (
          <>
          {/* Mobile cards */}
          <div className="divide-y divide-border md:hidden">
            {paginated.map((product) => {
              const margin = calcMargin(product.cost_price, product.sale_price);
              const marginColor =
                margin === null ? "" : margin >= 30 ? "text-success" : margin >= 10 ? "text-warning" : "text-destructive";
              return (
                <div key={product.id} className="p-4 space-y-2" data-testid={`row-product-${product.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground shrink-0">
                          #{product.numeric_id}
                        </span>
                        <p className="truncate font-medium">{product.name}</p>
                      </div>
                      {product.sku && (
                        <p className="mt-0.5 text-xs text-muted-foreground">SKU: {product.sku}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        data-testid={`button-edit-${product.id}`}
                        onClick={() => openEdit(product)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        data-testid={`button-delete-${product.id}`}
                        onClick={() => setDeleteId(product.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {product.category && (
                      <Badge variant="secondary" className="text-[10px]">{product.category}</Badge>
                    )}
                    <Badge variant={product.is_active ? "default" : "secondary"} className="text-[10px]">
                      {product.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                    {product.is_promotion && (
                      <Badge variant="destructive" className="text-[10px]">Promoção</Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                    <div>
                      <p className="text-muted-foreground">Custo</p>
                      <p className="font-mono font-medium">{fmtBRL(product.cost_price)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Venda</p>
                      <p className="font-mono font-semibold">
                        {product.is_promotion && product.promotion_price != null ? (
                          <>
                            <span className="text-destructive">{fmtBRL(product.promotion_price)}</span>
                          </>
                        ) : (
                          fmtBRL(product.sale_price)
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Margem</p>
                      <p className={`font-mono font-semibold ${marginColor}`}>
                        {margin !== null ? fmtPct(margin) : "—"}
                      </p>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Estoque: <span className="font-mono text-foreground">{(product.stock_quantity ?? 0).toLocaleString("pt-BR")} {product.stock_unit}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16 text-center">Cód.</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  <TableHead className="text-right">Preço venda</TableHead>
                  <TableHead className="text-right">Margem</TableHead>
                  <TableHead className="text-right">Estoque</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((product) => {
                  const margin = calcMargin(product.cost_price, product.sale_price);
                  const marginColor =
                    margin === null ? "" : margin >= 30 ? "text-success" : margin >= 10 ? "text-warning" : "text-destructive";
                  return (
                    <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                      <TableCell className="text-center">
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-muted-foreground">
                          #{product.numeric_id}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{product.name}</p>
                          {product.sku && (
                            <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {product.category ? (
                          <Badge variant="secondary">{product.category}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmtBRL(product.cost_price)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">
                        {product.is_promotion && product.promotion_price != null ? (
                          <div>
                            <span className="text-destructive">{fmtBRL(product.promotion_price)}</span>
                            <span className="ml-1 text-xs text-muted-foreground line-through">{fmtBRL(product.sale_price)}</span>
                          </div>
                        ) : (
                          fmtBRL(product.sale_price)
                        )}
                      </TableCell>
                      <TableCell className={`text-right font-mono text-sm font-semibold ${marginColor}`}>
                        {margin !== null ? fmtPct(margin) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {(product.stock_quantity ?? 0).toLocaleString("pt-BR")}{" "}
                        <span className="text-muted-foreground">{product.stock_unit}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant={product.is_active ? "default" : "secondary"} className="w-fit">
                            {product.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                          {product.is_promotion && (
                            <Badge variant="destructive" className="w-fit text-xs">
                              Promoção
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            data-testid={`button-edit-${product.id}`}
                            onClick={() => openEdit(product)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            data-testid={`button-delete-${product.id}`}
                            onClick={() => setDeleteId(product.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          </>
        ) : null}

        {/* Pagination */}
        {!tableNotFound && filtered.length > PAGE_SIZE && (
          <div className="flex flex-col items-center gap-2 border-t border-border px-4 py-3 sm:flex-row sm:justify-between">
            <p className="text-xs text-muted-foreground sm:text-sm">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length} produtos
            </p>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                data-testid="button-page-prev"
                disabled={page === 1}
                onClick={() => { setPage((p) => p - 1); scrollAppToTop(); }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 text-sm font-medium sm:hidden">
                {page} / {totalPages}
              </span>
              <div className="hidden items-center gap-1 sm:flex">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <Button
                    key={p}
                    size="icon"
                    variant={p === page ? "default" : "ghost"}
                    className="h-8 w-8 text-sm"
                    data-testid={`button-page-${p}`}
                    onClick={() => { setPage(p); scrollAppToTop(); }}
                  >
                    {p}
                  </Button>
                ))}
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                data-testid="button-page-next"
                disabled={page === totalPages}
                onClick={() => { setPage((p) => p + 1); scrollAppToTop(); }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="h-[90vh] max-h-[90vh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-x-hidden overflow-y-auto overscroll-contain p-4 [touch-action:pan-y] sm:h-auto sm:max-h-[95vh] sm:max-w-2xl sm:p-6">
          <DialogHeader>
            <DialogTitle>{editProduct ? "Editar produto" : "Novo produto"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="prod-name">Nome *</Label>
              <Input
                id="prod-name"
                data-testid="input-product-name"
                required
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value.toUpperCase();
                  setForm((f) => {
                    const next = { ...f, name };
                    // Auto-suggest the category from the name, but only if
                    // the user hasn't picked one yet (don't overwrite manual choices).
                    if (!f.category) {
                      const guess = guessCategory(name);
                      if (guess) next.category = guess;
                    }
                    return next;
                  });
                }}
                placeholder="EX: HAMBÚRGUER ARTESANAL"
                style={{ textTransform: "uppercase" }}
              />
            </div>

            {/* Category + SKU + Barcode */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Popover open={categoryComboOpen} onOpenChange={setCategoryComboOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={categoryComboOpen}
                      data-testid="select-product-category"
                      className={cn(
                        "w-full justify-between font-normal",
                        !form.category && "text-muted-foreground",
                      )}
                    >
                      <span className="truncate">
                        {form.category || "— Sem categoria —"}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[--radix-popover-trigger-width] min-w-[260px] p-0"
                    align="start"
                    onWheel={(e) => e.stopPropagation()}
                    onTouchMove={(e) => e.stopPropagation()}
                  >
                    <Command
                      filter={(value, search) => {
                        const s = search
                          .toLowerCase()
                          .normalize("NFD")
                          .replace(/[\u0300-\u036f]/g, "");
                        const vNorm = value
                          .toLowerCase()
                          .normalize("NFD")
                          .replace(/[\u0300-\u036f]/g, "");
                        return vNorm.includes(s) ? 1 : 0;
                      }}
                    >
                      <CommandInput placeholder="Buscar categoria..." />
                      <CommandList
                        className="max-h-64 overflow-y-auto overscroll-contain"
                        onWheel={(e) => e.stopPropagation()}
                      >
                        <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="— Sem categoria —"
                            onSelect={() => {
                              setForm((f) => ({ ...f, category: "" }));
                              setCategoryComboOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                !form.category ? "opacity-100" : "opacity-0",
                              )}
                            />
                            — Sem categoria —
                          </CommandItem>
                          {categories.map((c) => (
                            <CommandItem
                              key={c}
                              value={c}
                              onSelect={() => {
                                setForm((f) => ({ ...f, category: c }));
                                setCategoryComboOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  form.category === c ? "opacity-100" : "opacity-0",
                                )}
                              />
                              {c}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label htmlFor="prod-sku">SKU</Label>
                <div className="flex gap-2">
                  <Input
                    id="prod-sku"
                    data-testid="input-product-sku"
                    value={form.sku}
                    onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                    placeholder="Ex: HAMB-001"
                    className="font-mono uppercase"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    data-testid="button-generate-sku"
                    title="Gerar SKU automaticamente"
                    onClick={() =>
                      setForm((f) => ({ ...f, sku: generateSKU(f.name) }))
                    }
                  >
                    <Wand2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="prod-barcode">
                  Código de barras
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">(leitor USB ou câmera)</span>
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="prod-barcode"
                      data-testid="input-product-barcode"
                      value={form.barcode}
                      onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                      placeholder="EAN-13 — escaneie ou digite"
                      className="font-mono pr-8"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleBarcodeLookup(form.barcode);
                        }
                      }}
                      disabled={barcodeLoading}
                    />
                    {barcodeLoading && (
                      <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    data-testid="button-scan-barcode"
                    title="Escanear com câmera"
                    onClick={() => setScannerOpen(true)}
                    disabled={barcodeLoading}
                  >
                    <ScanBarcode className="h-4 w-4" />
                  </Button>
                </div>
                {form.barcode && !barcodeLoading && (
                  <p className="text-[11px] text-muted-foreground">
                    Pressione <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">Enter</kbd> para buscar informações do produto
                  </p>
                )}
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="prod-ncm">
                  NCM
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                    (Nomenclatura Comum do Mercosul — usado em nota fiscal)
                  </span>
                </Label>
                <Popover open={ncmPopoverOpen} onOpenChange={(o) => { setNcmPopoverOpen(o); if (o) setNcmQuery(form.ncm); }}>
                  <PopoverTrigger asChild>
                    <Button
                      id="prod-ncm"
                      type="button"
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal"
                      data-testid="button-product-ncm"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <Receipt className="h-4 w-4 shrink-0 text-muted-foreground" />
                        {form.ncm ? (
                          <span className="font-mono">{formatNcm(form.ncm)}</span>
                        ) : (
                          <span className="text-muted-foreground">Buscar NCM por código ou descrição…</span>
                        )}
                      </span>
                      <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Digite código ou descrição (mín. 2 caracteres)"
                        value={ncmQuery}
                        onValueChange={setNcmQuery}
                      />
                      <CommandList>
                        {ncmLoading ? (
                          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
                          </div>
                        ) : (
                          <>
                            <CommandEmpty>
                              {ncmQuery.trim().length < 2 ? "Digite ao menos 2 caracteres." : "Nenhum NCM encontrado."}
                            </CommandEmpty>
                            <CommandGroup>
                              {ncmResults.map((n) => (
                                <CommandItem
                                  key={n.codigo}
                                  value={n.codigo}
                                  onSelect={() => {
                                    setForm((f) => ({ ...f, ncm: n.codigo.replace(/\D/g, "") }));
                                    setNcmPopoverOpen(false);
                                  }}
                                  data-testid={`item-ncm-${n.codigo}`}
                                >
                                  <span className="font-mono text-xs">{formatNcm(n.codigo)}</span>
                                  <span className="ml-2 truncate text-xs text-muted-foreground">{n.descricao}</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {form.ncm && (
                  <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs">
                    <span className="truncate text-muted-foreground">
                      Código selecionado: <span className="font-mono text-foreground">{formatNcm(form.ncm)}</span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      onClick={() => setForm((f) => ({ ...f, ncm: "" }))}
                      data-testid="button-clear-ncm"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Pricing */}
            <div className="space-y-3">
              <p className="text-sm font-semibold">Preços</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="prod-cost">Preço de custo (R$)</Label>
                  <CurrencyInput
                    id="prod-cost"
                    data-testid="input-product-cost"
                    value={form.cost_price}
                    onChange={(v) => setForm((f) => ({ ...f, cost_price: v }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prod-sale">Preço de venda (R$) *</Label>
                  <CurrencyInput
                    id="prod-sale"
                    data-testid="input-product-sale"
                    value={form.sale_price}
                    onChange={(v) => setForm((f) => ({ ...f, sale_price: v }))}
                  />
                </div>
              </div>

              {/* Margin/Markup preview */}
              {(formCost > 0 || formSale > 0) && (
                <div className="flex gap-4 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                  <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="flex flex-wrap gap-x-6 gap-y-1">
                    <span>
                      Margem:{" "}
                      <strong
                        className={
                          formMargin === null
                            ? ""
                            : formMargin >= 30
                            ? "text-success"
                            : formMargin >= 10
                            ? "text-warning"
                            : "text-destructive"
                        }
                      >
                        {formMargin !== null ? fmtPct(formMargin) : "—"}
                      </strong>
                    </span>
                    <span>
                      Markup:{" "}
                      <strong>
                        {formMarkup !== null ? fmtPct(formMarkup) : "—"}
                      </strong>
                    </span>
                    <span>
                      Lucro bruto:{" "}
                      <strong>
                        {fmtBRL(Math.max(0, formSale - formCost))}
                      </strong>
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Stock */}
            <div className="space-y-2">
              <p className="text-sm font-semibold">Estoque</p>
              <div className="flex gap-3">
                <StockInput
                  data-testid="input-product-stock"
                  value={form.stock_quantity}
                  unit={form.stock_unit}
                  onChange={(v) => setForm((f) => ({ ...f, stock_quantity: v }))}
                />
                <Select
                  value={form.stock_unit}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      stock_unit: v,
                      stock_quantity: "",
                      min_stock: "",
                    }))
                  }
                >
                  <SelectTrigger className="w-24" data-testid="select-stock-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STOCK_UNITS.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                {INTEGER_UNITS.includes(form.stock_unit)
                  ? "Unidade inteira — sem decimais"
                  : "Use vírgula para decimais (ex: 1,500 = 1,5 kg)"}
              </p>

              <div className="pt-2">
                <Label htmlFor="prod-min-stock" className="text-xs">
                  Estoque mínimo (alerta)
                </Label>
                <div className="flex gap-3">
                  <StockInput
                    data-testid="input-product-min-stock"
                    value={form.min_stock}
                    unit={form.stock_unit}
                    onChange={(v) => setForm((f) => ({ ...f, min_stock: v }))}
                  />
                  <div className="flex w-24 items-center justify-center rounded-md border border-input bg-muted/50 text-sm text-muted-foreground">
                    {form.stock_unit}
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Quando o estoque ficar igual ou abaixo deste valor, aparece em "Alertas" no Estoque. Use 0 para desativar.
                </p>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="prod-desc">Descrição</Label>
              <Textarea
                id="prod-desc"
                data-testid="input-product-description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Descrição do produto (opcional)"
                rows={2}
              />
            </div>

            {/* Adicionais */}
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Adicionais</p>
                  <p className="text-xs text-muted-foreground">
                    Itens extras que o cliente pode adicionar (ex: bacon, queijo).
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="button-add-addon"
                  onClick={() =>
                    setAddons((arr) => [...arr, { name: "", price: "0,00" }])
                  }
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Adicionar
                </Button>
              </div>

              {addons.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
                  Nenhum adicional cadastrado.
                </p>
              ) : (
                <div className="space-y-2">
                  {addons.map((addon, idx) => (
                    <div
                      key={idx}
                      className="flex items-end gap-2"
                      data-testid={`row-addon-${idx}`}
                    >
                      <div className="flex-1 space-y-1">
                        {idx === 0 && (
                          <Label className="text-[11px] text-muted-foreground">
                            Nome
                          </Label>
                        )}
                        <Input
                          data-testid={`input-addon-name-${idx}`}
                          value={addon.name}
                          onChange={(e) =>
                            setAddons((arr) =>
                              arr.map((a, i) =>
                                i === idx
                                  ? { ...a, name: e.target.value.toUpperCase() }
                                  : a,
                              ),
                            )
                          }
                          placeholder="EX: BACON EXTRA"
                          style={{ textTransform: "uppercase" }}
                        />
                      </div>
                      <div className="w-32 space-y-1">
                        {idx === 0 && (
                          <Label className="text-[11px] text-muted-foreground">
                            Preço (R$)
                          </Label>
                        )}
                        <CurrencyInput
                          data-testid={`input-addon-price-${idx}`}
                          value={addon.price}
                          onChange={(v) =>
                            setAddons((arr) =>
                              arr.map((a, i) =>
                                i === idx ? { ...a, price: v } : a,
                              ),
                            )
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        data-testid={`button-remove-addon-${idx}`}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          setAddons((arr) => arr.filter((_, i) => i !== idx))
                        }
                        title="Remover adicional"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <p className="text-sm font-medium">Produto ativo</p>
                <p className="text-xs text-muted-foreground">
                  Produtos inativos não aparecem no PDV
                </p>
              </div>
              <Switch
                data-testid="switch-product-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
            </div>

            {/* Kitchen prep */}
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div className="pr-3">
                <p className="text-sm font-medium">Preparado na cozinha (Comandas/Delivery)</p>
                <p className="text-xs text-muted-foreground">
                  Quando ativado, este produto fica disponível para venda em Comandas
                  e aparece na tela da cozinha (KDS) para preparo.
                </p>
              </div>
              <Switch
                data-testid="switch-product-prepared"
                checked={form.is_prepared}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_prepared: v }))}
              />
            </div>

            {/* Promotion */}
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Em promoção</p>
                  <p className="text-xs text-muted-foreground">
                    Marque se o produto está em oferta especial
                  </p>
                </div>
                <Switch
                  data-testid="switch-product-promotion"
                  checked={form.is_promotion}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, is_promotion: v }))}
                />
              </div>
              {form.is_promotion && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-2">
                    <Label htmlFor="prod-promo-price">Preço promocional (R$)</Label>
                    <CurrencyInput
                      id="prod-promo-price"
                      data-testid="input-promotion-price"
                      value={form.promotion_price}
                      onChange={(v) => setForm((f) => ({ ...f, promotion_price: v }))}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="prod-promo-start">Início da promoção</Label>
                      <Input
                        id="prod-promo-start"
                        data-testid="input-promotion-start"
                        type="date"
                        value={form.promotion_start}
                        min={new Date().toISOString().split("T")[0]}
                        onChange={(e) => setForm((f) => ({ ...f, promotion_start: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prod-promo-end">Fim da promoção</Label>
                      <Input
                        id="prod-promo-end"
                        data-testid="input-promotion-end"
                        type="date"
                        value={form.promotion_end}
                        min={form.promotion_start || new Date().toISOString().split("T")[0]}
                        onChange={(e) => setForm((f) => ({ ...f, promotion_end: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="flex-col-reverse gap-2 pt-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={closeDialog} disabled={isPending} className="w-full sm:w-auto">
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-save-product" className="w-full sm:w-auto">
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editProduct ? "Salvar alterações" : "Criar produto"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover produto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O produto será excluído permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-delete"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Sim, remover"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Barcode Scanner — product form */}
      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onResult={(result) => {
          setScannerOpen(false);
          handleScanResult(result);
        }}
      />

      {/* Barcode Scanner — search filter */}
      <BarcodeScanner
        open={searchScannerOpen}
        onClose={() => setSearchScannerOpen(false)}
        onResult={(result) => {
          setSearchScannerOpen(false);
          handleSearchBarcode(result.barcode);
        }}
      />
    </div>
  );
}
