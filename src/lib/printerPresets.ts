import type { PaperWidth } from "@/lib/printer";

export interface PrinterPreset {
  id: string;
  brand: string;
  model: string;
  paperWidth: PaperWidth;
  cols: number;
  notes?: string;
}

export const PRINTER_PRESETS: PrinterPreset[] = [
  { id: "bematech-mp4200th",   brand: "Bematech", model: "MP-4200 TH",  paperWidth: 80, cols: 48 },
  { id: "bematech-mp2800th",   brand: "Bematech", model: "MP-2800 TH",  paperWidth: 80, cols: 48 },
  { id: "bematech-mp100sth",      brand: "Bematech", model: "MP-100S TH (58 mm)", paperWidth: 58, cols: 32 },
  { id: "bematech-mp100sth-80mm", brand: "Bematech", model: "MP-100S TH (80 mm)", paperWidth: 80, cols: 48 },
  { id: "bematech-mp2500th",   brand: "Bematech", model: "MP-2500 TH",  paperWidth: 80, cols: 48 },

  { id: "elgin-i9",            brand: "Elgin",    model: "i9",          paperWidth: 80, cols: 48 },
  { id: "elgin-i7",            brand: "Elgin",    model: "i7",          paperWidth: 80, cols: 48 },
  { id: "elgin-i8",            brand: "Elgin",    model: "i8",          paperWidth: 80, cols: 48 },
  { id: "elgin-vox",           brand: "Elgin",    model: "VOX (térmica)", paperWidth: 80, cols: 48 },
  { id: "elgin-i7-58",         brand: "Elgin",    model: "i7 58 mm",    paperWidth: 58, cols: 32 },

  { id: "epson-tmt20",         brand: "Epson",    model: "TM-T20",      paperWidth: 80, cols: 48 },
  { id: "epson-tmt20x",        brand: "Epson",    model: "TM-T20X",     paperWidth: 80, cols: 48 },
  { id: "epson-tmt88v",        brand: "Epson",    model: "TM-T88V",     paperWidth: 80, cols: 48 },
  { id: "epson-tmt88vi",       brand: "Epson",    model: "TM-T88VI",    paperWidth: 80, cols: 48 },
  { id: "epson-tmm30",         brand: "Epson",    model: "TM-M30",      paperWidth: 80, cols: 48 },
  { id: "epson-tmp20",         brand: "Epson",    model: "TM-P20 (BT)", paperWidth: 58, cols: 32 },

  { id: "daruma-dr800",        brand: "Daruma",   model: "DR800",       paperWidth: 80, cols: 48 },
  { id: "daruma-dr700",        brand: "Daruma",   model: "DR700",       paperWidth: 80, cols: 48 },
  { id: "daruma-dr600",        brand: "Daruma",   model: "DR600",       paperWidth: 80, cols: 48 },

  { id: "sweda-si300",         brand: "Sweda",    model: "SI-300",      paperWidth: 80, cols: 48 },
  { id: "sweda-si250",         brand: "Sweda",    model: "SI-250",      paperWidth: 80, cols: 48 },
  { id: "sweda-si150",         brand: "Sweda",    model: "SI-150",      paperWidth: 58, cols: 32 },

  { id: "diebold-im453",       brand: "Diebold",  model: "IM453 / IM833", paperWidth: 80, cols: 48 },
  { id: "diebold-tsp143",      brand: "Diebold/Star", model: "TSP143",  paperWidth: 80, cols: 48 },

  { id: "tanca-tp650",         brand: "Tanca",    model: "TP-650",      paperWidth: 80, cols: 48 },
  { id: "tanca-tp550",         brand: "Tanca",    model: "TP-550",      paperWidth: 80, cols: 48 },
  { id: "tanca-tp450",         brand: "Tanca",    model: "TP-450",      paperWidth: 80, cols: 48 },

  { id: "control-id-print-id", brand: "Control iD", model: "Print iD Touch", paperWidth: 80, cols: 48 },

  { id: "knup-kp1015",         brand: "Knup",     model: "KP-IM607 / KP-1015", paperWidth: 80, cols: 48 },
  { id: "knup-kp-im603",       brand: "Knup",     model: "KP-IM603",    paperWidth: 58, cols: 32 },

  { id: "generic-mini-bt-58",  brand: "Mini BT", model: "Mini Bluetooth 58 mm (POS-58/MTP-II)", paperWidth: 58, cols: 32, notes: "Modelos genéricos chineses de bolso." },
  { id: "generic-pos-80",      brand: "Genérica", model: "POS 80 mm (genérica)", paperWidth: 80, cols: 48 },
  { id: "generic-pos-58",      brand: "Genérica", model: "POS 58 mm (genérica)", paperWidth: 58, cols: 32 },
];

export const CUSTOM_PRESET_ID = "custom";

export function findPreset(id: string | undefined | null): PrinterPreset | null {
  if (!id || id === CUSTOM_PRESET_ID) return null;
  return PRINTER_PRESETS.find((p) => p.id === id) ?? null;
}

export const PRESET_BRANDS = Array.from(new Set(PRINTER_PRESETS.map((p) => p.brand))).sort((a, b) =>
  a.localeCompare(b, "pt-BR"),
);
