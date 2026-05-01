# Prompt de Integração — App de Delivery (PDVIO)

## Contexto

O **PDVIO** é um sistema de PDV (Ponto de Venda) SaaS brasileiro construído com:
- **Frontend:** React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Supabase (PostgreSQL + Auth + RLS + Realtime)
- **URL Supabase:** `https://luznrsvdmlwcajoxaekn.supabase.co`

O app de delivery que você vai construir deve **ler dados do mesmo projeto Supabase** usando a chave anônima pública. Toda a segurança é garantida pelas políticas RLS do Supabase.

---

## Credenciais (somente leitura pública)

```
SUPABASE_URL=https://luznrsvdmlwcajoxaekn.supabase.co
SUPABASE_ANON_KEY=<mesma chave usada no PDVIO>
```

---

## Estrutura do Banco de Dados

### 1. `companies` — Dados da Loja

Cada loja é uma empresa (`company`). O cardápio digital é acessado pelo campo `delivery_slug`.

```sql
companies (
  id                    UUID PRIMARY KEY,
  name                  TEXT NOT NULL,              -- Nome da loja
  document              TEXT,                       -- CNPJ/CPF
  phone                 TEXT,
  email                 TEXT,
  address               TEXT,
  logo_url              TEXT,                       -- Logo principal (base64 ou URL)
  business_type         ENUM(                       -- Tipo de negócio
                          'restaurant', 'snack_bar', 'market',
                          'distributor', 'delivery', 'retail', 'other'
                        ),
  settings              JSONB,                      -- Configurações gerais (impressora, etc.)

  -- ── Cardápio Digital / Delivery ──────────────────────────────────
  delivery_enabled      BOOLEAN DEFAULT false,      -- Cardápio ativo ou não
  delivery_slug         TEXT UNIQUE,                -- Slug único: ex. "minha-pizzaria"
  delivery_description  TEXT,                       -- Descrição da loja no cardápio
  delivery_logo_url     TEXT,                       -- Logo específica do delivery
  delivery_cover_url    TEXT,                       -- Foto de capa do cardápio
  delivery_fee          NUMERIC(10,2) DEFAULT 0,    -- Taxa de entrega (R$)
  delivery_min_order    NUMERIC(10,2) DEFAULT 0,    -- Pedido mínimo (R$)
  delivery_free_threshold NUMERIC(10,2),            -- Valor para frete grátis (R$)
  delivery_time         TEXT,                       -- Tempo estimado de entrega (ex: "30-45 min")
  delivery_pickup_time  TEXT,                       -- Tempo de retirada (ex: "15-20 min")
  delivery_primary_color TEXT DEFAULT '#6d28d9',    -- Cor principal do tema do cardápio
  delivery_whatsapp     TEXT,                       -- WhatsApp da loja (com DDI: 5511999999999)
  delivery_instagram    TEXT,                       -- @instagram
  delivery_facebook     TEXT,                       -- URL do Facebook
  delivery_operating_hours JSONB,                   -- Horários de funcionamento (ver formato abaixo)

  -- ── W-API / WhatsApp automático ───────────────────────────────────
  wapi_instance_id      TEXT,                       -- Instance ID da W-API
  wapi_token            TEXT,                       -- Token Bearer da instância W-API

  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
)
```

**Formato de `delivery_operating_hours` (JSONB array):**
```json
[
  { "day": 0, "isOpen": false, "openTime": "08:00", "closeTime": "22:00" },
  { "day": 1, "isOpen": true,  "openTime": "08:00", "closeTime": "22:00" },
  { "day": 2, "isOpen": true,  "openTime": "08:00", "closeTime": "22:00" },
  { "day": 3, "isOpen": true,  "openTime": "08:00", "closeTime": "22:00" },
  { "day": 4, "isOpen": true,  "openTime": "08:00", "closeTime": "22:00" },
  { "day": 5, "isOpen": true,  "openTime": "08:00", "closeTime": "22:00" },
  { "day": 6, "isOpen": true,  "openTime": "08:00", "closeTime": "18:00" }
]
```
> `day`: 0=Domingo, 1=Segunda ... 6=Sábado

---

### 2. `products` — Catálogo de Produtos

```sql
products (
  id               UUID PRIMARY KEY,
  company_id       UUID REFERENCES companies(id) ON DELETE CASCADE,
  numeric_id       BIGINT UNIQUE,                  -- ID numérico sequencial (ex: #001)
  name             TEXT NOT NULL,                  -- Nome (uppercase)
  description      TEXT,                           -- Descrição do produto
  sku              TEXT,                           -- Código interno
  barcode          TEXT,                           -- EAN/código de barras
  category         TEXT,                           -- Categoria (string livre)
  ncm              TEXT,                           -- Código NCM (fiscal)

  cost_price       NUMERIC(10,2) DEFAULT 0,        -- Preço de custo (R$)
  sale_price       NUMERIC(10,2) DEFAULT 0,        -- Preço de venda (R$)
  stock_quantity   NUMERIC(10,3) DEFAULT 0,        -- Quantidade em estoque
  stock_unit       TEXT DEFAULT 'un',              -- Unidade: 'un', 'kg', 'g', 'l', 'ml', 'cx', 'pct', 'par'

  is_active        BOOLEAN DEFAULT true,           -- Produto ativo (aparecer no cardápio)
  is_prepared      BOOLEAN DEFAULT false,          -- Preparado na cozinha (vai pro KDS)

  is_promotion     BOOLEAN DEFAULT false,          -- Em promoção?
  promotion_price  NUMERIC(10,2),                  -- Preço promocional (R$)
  promotion_start  DATE,                           -- Início da promoção
  promotion_end    DATE,                           -- Fim da promoção

  image_url        TEXT,                           -- Imagem base64 (data:image/...) ou URL

  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
)
```

**Lógica de preço efetivo:**
```typescript
function getEffectivePrice(product: Product): number {
  const today = new Date().toISOString().split('T')[0];
  const inPromotion =
    product.is_promotion &&
    product.promotion_price != null &&
    (!product.promotion_start || product.promotion_start <= today) &&
    (!product.promotion_end   || product.promotion_end   >= today);
  return inPromotion ? product.promotion_price! : product.sale_price;
}
```

**Buscar cardápio público por slug:**
```typescript
// 1. Buscar empresa pelo slug
const { data: company } = await supabase
  .from('companies')
  .select('*')
  .eq('delivery_slug', slug)
  .eq('delivery_enabled', true)
  .single();

// 2. Buscar produtos ativos da empresa
const { data: products } = await supabase
  .from('products')
  .select('*, product_addons(*)')
  .eq('company_id', company.id)
  .eq('is_active', true)
  .order('category', { ascending: true })
  .order('name', { ascending: true });
```

---

### 3. `product_addons` — Adicionais dos Produtos

```sql
product_addons (
  id          UUID PRIMARY KEY,
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,             -- Nome do adicional (ex: "BACON EXTRA")
  price       NUMERIC(10,2) DEFAULT 0,  -- Preço do adicional (R$)
  sort_order  INTEGER DEFAULT 0,        -- Ordem de exibição
  created_at  TIMESTAMPTZ DEFAULT now()
)
```

**Buscar com join:**
```typescript
const { data: products } = await supabase
  .from('products')
  .select(`
    *,
    product_addons (
      id, name, price, sort_order
    )
  `)
  .eq('company_id', companyId)
  .eq('is_active', true);
```

---

### 4. `customers` — Clientes

```sql
customers (
  id          UUID PRIMARY KEY,
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT,          -- Telefone (para WhatsApp)
  email       TEXT,
  document    TEXT,          -- CPF/CNPJ
  notes       TEXT,          -- Observações internas
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
)
```

---

### 5. `sales` — Vendas

```sql
sales (
  id              UUID PRIMARY KEY,
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
  numeric_id      BIGINT UNIQUE,               -- ID numérico do cupom (ex: #000042)

  subtotal        NUMERIC(10,2) DEFAULT 0,     -- Subtotal antes do desconto
  discount_amount NUMERIC(10,2) DEFAULT 0,     -- Desconto total aplicado
  total           NUMERIC(10,2) DEFAULT 0,     -- Total final pago

  payment_method  TEXT NOT NULL,               -- Ver valores abaixo
  payment_amount  NUMERIC(10,2) DEFAULT 0,     -- Valor recebido
  change_amount   NUMERIC(10,2) DEFAULT 0,     -- Troco

  notes           TEXT,                        -- Observações da venda
  status          TEXT DEFAULT 'completed',    -- 'completed' | 'cancelled' | 'refunded'

  -- Campos de cupom/promoção (quando houver)
  coupon_id       UUID,                        -- Cupom aplicado (FK para coupons)
  promotion_discount NUMERIC(10,2) DEFAULT 0, -- Desconto vindo de promoção automática

  created_at      TIMESTAMPTZ DEFAULT now()
)
```

**Valores de `payment_method`:**
| Valor | Descrição |
|-------|-----------|
| `cash` | Dinheiro |
| `credit_card` | Cartão de crédito |
| `debit_card` | Cartão de débito |
| `pix` | PIX |
| `ticket` | Vale/ticket |
| `crediario` | Crediário |
| `mixed` | Pagamento misto (vários métodos) |

---

### 6. `sale_items` — Itens de cada Venda

```sql
sale_items (
  id              UUID PRIMARY KEY,
  sale_id         UUID REFERENCES sales(id) ON DELETE CASCADE,
  product_id      UUID REFERENCES products(id) ON DELETE SET NULL,

  product_name    TEXT NOT NULL,             -- Snapshot do nome na hora da venda
  quantity        NUMERIC(10,3) NOT NULL,    -- Quantidade
  unit_price      NUMERIC(10,2) NOT NULL,   -- Preço unitário na hora da venda
  discount_amount NUMERIC(10,2) DEFAULT 0,  -- Desconto neste item
  subtotal        NUMERIC(10,2) NOT NULL,   -- quantity * unit_price - discount_amount

  addons          JSONB DEFAULT '[]',        -- Adicionais escolhidos (snapshot)
  notes           TEXT                       -- Observação do item (ex: "sem cebola")
)
```

**Formato do campo `addons` (JSONB):**
```json
[
  { "id": "uuid-do-addon", "name": "BACON EXTRA", "price": 3.50 },
  { "id": "uuid-do-addon", "name": "QUEIJO EXTRA", "price": 2.00 }
]
```

**Buscar venda completa com itens:**
```typescript
const { data: sale } = await supabase
  .from('sales')
  .select(`
    *,
    sale_items (
      id, product_id, product_name,
      quantity, unit_price, discount_amount, subtotal,
      addons, notes
    ),
    customers ( id, name, phone, email )
  `)
  .eq('id', saleId)
  .single();
```

---

## Inserir Pedido de Delivery (nova venda)

Para registrar um pedido do delivery no histórico do PDVIO:

```typescript
async function createDeliveryOrder(params: {
  companyId: string;
  customerId?: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    addons?: Array<{ id: string; name: string; price: number }>;
    notes?: string;
  }>;
  paymentMethod: string;
  notes?: string;
}) {
  const subtotal = params.items.reduce((sum, item) => {
    const addonsTotal = (item.addons ?? []).reduce((a, b) => a + b.price, 0);
    return sum + (item.unitPrice + addonsTotal) * item.quantity;
  }, 0);

  // 1. Criar a venda
  const { data: sale, error: saleErr } = await supabase
    .from('sales')
    .insert({
      company_id: params.companyId,
      customer_id: params.customerId ?? null,
      subtotal,
      discount_amount: 0,
      total: subtotal,
      payment_method: params.paymentMethod,
      payment_amount: subtotal,
      change_amount: 0,
      notes: params.notes ?? null,
      status: 'completed',
    })
    .select()
    .single();

  if (saleErr || !sale) throw saleErr;

  // 2. Inserir os itens
  const saleItems = params.items.map((item) => {
    const addonsTotal = (item.addons ?? []).reduce((a, b) => a + b.price, 0);
    const qty = item.quantity;
    return {
      sale_id: sale.id,
      product_id: item.productId,
      product_name: item.productName,
      quantity: qty,
      unit_price: item.unitPrice + addonsTotal,
      discount_amount: 0,
      subtotal: (item.unitPrice + addonsTotal) * qty,
      addons: item.addons ?? [],
      notes: item.notes ?? null,
    };
  });

  const { error: itemsErr } = await supabase.from('sale_items').insert(saleItems);
  if (itemsErr) throw itemsErr;

  return sale;
}
```

---

## Enviar Pedido via WhatsApp (W-API)

O PDVIO usa a **W-API** para envio de mensagens automáticas. A instância fica salva na `company`.

```typescript
async function sendWhatsAppOrder(company: Company, orderText: string, customerPhone: string) {
  if (!company.wapi_instance_id || !company.wapi_token) return;

  const phone = customerPhone.replace(/\D/g, ''); // somente dígitos

  const response = await fetch(
    `https://api.w-api.app/v1/message/send-text?instanceId=${company.wapi_instance_id}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${company.wapi_token}`,
      },
      body: JSON.stringify({
        phone: `55${phone}`,  // DDI Brasil
        message: orderText,
      }),
    }
  );

  return response.json();
}
```

**Formato de mensagem de pedido sugerido:**
```
🛍️ *Novo pedido - PDVIO Delivery*

📋 *Itens:*
• 2x X-Burguer (R$ 25,00) - sem cebola
  + Bacon extra (R$ 3,50)
• 1x Coca-Cola (R$ 7,00)

💰 *Total: R$ 60,50*
💳 *Pagamento:* PIX

📍 *Cliente:* João Silva
📱 *Telefone:* (11) 99999-9999
🏠 *Endereço:* Rua das Flores, 123 - Bairro, Cidade
```

---

## Enums e Constantes

```typescript
// Tipos de negócio
type BusinessType =
  | 'restaurant'    // Restaurante
  | 'snack_bar'     // Lanchonete
  | 'market'        // Mercado
  | 'distributor'   // Distribuidora
  | 'delivery'      // Delivery
  | 'retail'        // Varejo
  | 'other';        // Outro

// Papéis na empresa
type CompanyRole = 'owner' | 'manager' | 'cashier' | 'waiter' | 'kitchen';

// Unidades de estoque
const STOCK_UNITS = ['un', 'kg', 'g', 'l', 'ml', 'cx', 'pct', 'par'] as const;

// Métodos de pagamento
const PAYMENT_METHODS = ['cash', 'credit_card', 'debit_card', 'pix', 'ticket', 'crediario', 'mixed'] as const;
```

---

## Políticas de Acesso (RLS)

- **Cardápio público**: O app de delivery pode **ler** `companies` pelo `delivery_slug` e `products` da empresa sem autenticação, **desde que** as políticas RLS permitam acesso público ou você crie uma função pública no Supabase para isso.
- **Criar vendas**: Requer autenticação de um membro da empresa, **ou** você cria uma Edge Function no Supabase com a chave `service_role` para aceitar pedidos do delivery de forma segura.
- **Recomendação**: Crie uma **Supabase Edge Function** chamada `delivery-order` que recebe o pedido, valida e insere com permissão de `service_role`. Isso evita expor a chave privada no frontend do delivery.

---

## Resumo das Tabelas Relevantes

| Tabela | Finalidade |
|--------|-----------|
| `companies` | Dados da loja + configurações de delivery |
| `products` | Catálogo de produtos com preços e imagens |
| `product_addons` | Adicionais/extras dos produtos |
| `customers` | Clientes cadastrados |
| `sales` | Vendas finalizadas |
| `sale_items` | Itens de cada venda (com addons e observações) |

---

*Gerado automaticamente a partir do schema do PDVIO — projeto Supabase: `luznrsvdmlwcajoxaekn`*
