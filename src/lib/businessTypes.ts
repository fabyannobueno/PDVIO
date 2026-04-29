import {
  UtensilsCrossed,
  ShoppingBag,
  Pizza,
  Beef,
  Coffee,
  Croissant,
  Cake,
  IceCream,
  Beer,
  Wine,
  Soup,
  Truck,
  Bike,
  ShoppingBasket,
  Apple,
  Fish,
  Store,
  Shirt,
  Footprints,
  Sparkles,
  Pill,
  PawPrint,
  Pencil,
  Smartphone,
  Scissors,
  Flower2,
  Package,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export interface BusinessType {
  value: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Tipos de negócio comuns no comércio brasileiro. A ordem é otimizada para os
 * segmentos mais comuns aparecerem primeiro (alimentação, varejo, serviços).
 *
 * IMPORTANTE: o `value` é persistido no banco em `companies.business_type`. Não
 * renomeie valores existentes sem migração — adicione novos no final.
 */
export const BUSINESS_TYPES: BusinessType[] = [
  // Alimentação
  { value: "restaurant", label: "Restaurante", icon: UtensilsCrossed },
  { value: "snack_bar", label: "Lanchonete", icon: ShoppingBag },
  { value: "pizzeria", label: "Pizzaria", icon: Pizza },
  { value: "burger", label: "Hamburgueria", icon: Beef },
  { value: "cafe", label: "Cafeteria", icon: Coffee },
  { value: "bakery", label: "Padaria", icon: Croissant },
  { value: "confectionery", label: "Confeitaria", icon: Cake },
  { value: "icecream", label: "Sorveteria", icon: IceCream },
  { value: "acai", label: "Açaí", icon: IceCream },
  { value: "bar", label: "Bar / Boteco", icon: Beer },
  { value: "marmita", label: "Marmitaria", icon: Soup },
  { value: "food_truck", label: "Food truck", icon: Truck },

  // Varejo de alimentos / mercado
  { value: "market", label: "Mercado", icon: ShoppingBasket },
  { value: "grocery", label: "Mercearia", icon: Store },
  { value: "greengrocer", label: "Hortifrúti", icon: Apple },
  { value: "butcher", label: "Açougue", icon: Beef },
  { value: "fishmonger", label: "Peixaria", icon: Fish },
  { value: "winecellar", label: "Adega", icon: Wine },

  // Atacado / logística
  { value: "distributor", label: "Distribuidora", icon: Truck },
  { value: "wholesale", label: "Atacado", icon: Warehouse },
  { value: "delivery", label: "Delivery", icon: Bike },

  // Varejo geral
  { value: "retail", label: "Loja física", icon: Store },
  { value: "clothing", label: "Roupas", icon: Shirt },
  { value: "shoes", label: "Calçados", icon: Footprints },
  { value: "cosmetics", label: "Cosméticos", icon: Sparkles },
  { value: "pharmacy", label: "Farmácia", icon: Pill },
  { value: "petshop", label: "Pet shop", icon: PawPrint },
  { value: "stationery", label: "Papelaria", icon: Pencil },
  { value: "electronics", label: "Eletrônicos", icon: Smartphone },
  { value: "florist", label: "Floricultura", icon: Flower2 },

  // Serviços
  { value: "beauty", label: "Salão / Barbearia", icon: Scissors },

  // Genérico
  { value: "other", label: "Outro", icon: Package },
];

/** Mapa rápido value → label para listagens. */
export const BUSINESS_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  BUSINESS_TYPES.map((t) => [t.value, t.label])
);

export function getBusinessTypeLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return BUSINESS_TYPE_LABEL[value] ?? value;
}
