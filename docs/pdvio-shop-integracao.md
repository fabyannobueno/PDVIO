# PDVIO × Cardápio Digital — Guia de Integração

Versão: **2.0** · Atualizado em: maio/2026

---

## Visão Geral

O PDVIO é o sistema de gestão do restaurante. O cardápio digital (`pdvio.shop`) é a vitrine pública onde o cliente faz pedidos. Os dois se comunicam **exclusivamente pelo banco de dados Supabase compartilhado** — sem API intermediária.

### O que há de novo nesta versão

| Recurso | O que faz |
|---|---|
| **Comer aqui (dine_in)** | Cliente no cardápio escolhe "Comer aqui", o pedido entra direto na comanda da mesa dele no PDVIO |
| **Chamar garçom** | Cliente na página da mesa clica "Chamar garçom" → PDVIO toca sino e exibe alerta até o garçom confirmar |
| **Parâmetros de mesa na URL** | PDVIO passa `?mesa=&empresa=&modo=mesa` ao redirecionar para o cardápio — cardápio deve ler e usar |

---

## 1. Parâmetros de URL recebidos do PDVIO

Quando o cliente clica em **"Ver cardápio digital"** na página da mesa do PDVIO, ele é redirecionado para:

```
https://pdvio.shop/{slug}?mesa=Mesa%203&empresa={company_uuid}&modo=mesa
```

| Parâmetro | Tipo | Exemplo | Descrição |
|---|---|---|---|
| `mesa` | string | `Mesa 3` | Label exato da mesa (URL-encoded) |
| `empresa` | UUID | `3f8a1...` | `company_id` no Supabase |
| `modo` | string | `mesa` | Sempre `"mesa"` quando vindo de uma mesa |

**O cardápio deve:**
1. Ler esses parâmetros na inicialização
2. Quando `modo=mesa` estiver presente, pré-selecionar **"Comer aqui"** como tipo de pedido
3. Bloquear troca de tipo para delivery/retirada enquanto `modo=mesa` (opcional, mas recomendado)
4. Guardar `mesa` e `empresa` para usar no insert do pedido

---

## 2. Tabela `delivery_orders` — pedidos do cardápio

### Schema completo (após migrations)

```sql
delivery_orders (
  id             uuid       -- gerado automaticamente
  numeric_id     bigint     -- ID sequencial visível no PDVIO (#1, #2, ...)
  company_id     uuid       -- FK → companies.id  ← obrigatório
  customer_name  text       -- nome do cliente    ← obrigatório
  customer_phone text       -- telefone           ← obrigatório
  address        text       -- endereço (só delivery)
  delivery_type  text       -- 'delivery' | 'pickup' | 'dine_in'  ← obrigatório
  table_identifier text     -- label da mesa (só dine_in) ex: "Mesa 3"
  items          jsonb      -- array de itens     ← obrigatório
  subtotal       numeric    -- soma dos itens
  delivery_fee   numeric    -- taxa de entrega (0 para dine_in/pickup)
  discount_amount numeric   -- valor do desconto (0 se sem cupom)
  coupon_code    text       -- código do cupom usado (null se sem cupom)
  total          numeric    -- subtotal - desconto + delivery_fee
  payment_method text       -- 'pix' | 'cash' | 'credit_card' | 'debit_card'
  notes          text       -- observações gerais
  status         text       -- inicia em 'pending' (gerenciado pelo PDVIO)
  comanda_id     uuid       -- preenchido automaticamente pelo PDVIO após merge
  created_at     timestamptz
)
```

### Formato do array `items` (JSONB)

```json
[
  {
    "name": "Pizza Margherita",
    "quantity": 2,
    "price": 45.00,
    "subtotal": 90.00,
    "notes": "Sem cebola",
    "addons": [
      { "name": "Borda recheada", "price": 8.00 }
    ]
  },
  {
    "name": "Coca-Cola 600ml",
    "quantity": 1,
    "price": 9.00,
    "subtotal": 9.00,
    "notes": null,
    "addons": []
  }
]
```

---

## 3. Como inserir um pedido "Comer aqui" (dine_in)

### Payload mínimo obrigatório

```json
{
  "company_id": "3f8a1b2c-...",
  "customer_name": "João Silva",
  "customer_phone": "11999990000",
  "delivery_type": "dine_in",
  "table_identifier": "Mesa 3",
  "items": [
    {
      "name": "Pizza Margherita",
      "quantity": 1,
      "price": 45.00,
      "subtotal": 45.00,
      "notes": null,
      "addons": []
    }
  ],
  "subtotal": 45.00,
  "delivery_fee": 0,
  "discount_amount": 0,
  "total": 45.00,
  "payment_method": "pix",
  "status": "pending"
}
```

### O que o PDVIO faz automaticamente ao receber

```
INSERT dine_in recebido via Realtime
  ↓
Busca comanda aberta:
  WHERE company_id = order.company_id
    AND identifier = order.table_identifier
    AND status = 'open'
  ↓
SE encontrar comanda:
  → INSERT em comanda_items (todos os itens)
  → UPDATE delivery_orders SET comanda_id = comanda.id, status = 'confirmed'
  → PDVIO Bell toca 🔔
  → Toast: "🍽️ Mesa 3 — 2 item(ns) pelo cardápio · R$ 99,00"

SE não encontrar comanda:
  → Toast de alerta para o operador
  → Pedido fica como 'pending' para resolução manual
```

---

## 4. Tabela `waiter_calls` — chamar garçom

O cliente pode chamar o garçom direto pelo celular. Isso é feito na **página da mesa** (`/mesa/:companyId/:tableLabel`), mas o cardápio também pode oferecer esse botão.

### Schema

```sql
waiter_calls (
  id           uuid
  company_id   uuid    -- FK → companies.id  ← obrigatório
  table_label  text    -- ex: "Mesa 3"       ← obrigatório
  comanda_id   uuid    -- FK → comandas.id (opcional)
  created_at   timestamptz
)
```

### Inserindo uma chamada de garçom pelo cardápio

```json
{
  "company_id": "3f8a1b2c-...",
  "table_label": "Mesa 3",
  "comanda_id": null
}
```

**RLS:** qualquer cliente (anon) pode inserir. Leitura restrita a membros autenticados da empresa.

**Efeito no PDVIO:** sino toca imediatamente e repete a cada 5 segundos até o garçom clicar **"OK — Estou indo"**.

---

## 5. Leitura de dados da empresa

Para montar o cardápio (logo, cor, horários, etc.), consulte a tabela `companies`:

```sql
SELECT
  id,
  name,
  delivery_slug,
  delivery_enabled,
  delivery_description,
  delivery_logo_url,
  delivery_cover_url,
  delivery_fee,
  delivery_min_order,
  delivery_free_threshold,
  delivery_time,
  delivery_pickup_time,
  delivery_primary_color,
  delivery_whatsapp,
  delivery_instagram,
  delivery_operating_hours
FROM companies
WHERE delivery_slug = 'minha-pizzaria'
  AND delivery_enabled = true;
```

O campo `delivery_operating_hours` é um array JSONB:

```json
[
  { "day": 0, "isOpen": false, "openTime": "00:00", "closeTime": "00:00" },
  { "day": 1, "isOpen": true,  "openTime": "18:00", "closeTime": "23:00" },
  ...
]
```
`day`: 0 = domingo, 1 = segunda, ..., 6 = sábado.

---

## 6. RLS — Permissões de acesso

| Tabela | Leitura | Escrita (INSERT) |
|---|---|---|
| `delivery_orders` | autenticado + membro da empresa | **anon e autenticado** (qualquer um pode pedir) |
| `waiter_calls` | autenticado + membro da empresa | **anon e autenticado** (qualquer um pode chamar) |
| `companies` | público para slug ativo | apenas owner |

Use a **chave anônima (anon key)** do Supabase no cardápio para inserir pedidos e chamadas de garçom sem precisar de login.

---

## 7. Checklist de implementação

### Novidades obrigatórias

- [ ] Ler `?mesa=`, `?empresa=` e `?modo=` da URL ao carregar o cardápio
- [ ] Quando `modo=mesa`: mostrar "Comer aqui" como opção de entrega
- [ ] Ao confirmar pedido `dine_in`: enviar `delivery_type: "dine_in"` e `table_identifier: <valor de ?mesa>`
- [ ] Incluir `company_id` (valor de `?empresa=`) no insert

### Opcional mas recomendado

- [ ] Botão **"Chamar garçom"** no cardápio → insere em `waiter_calls` com `table_label` e `company_id`
- [ ] Detectar quando `comanda_id` é preenchido no pedido (via Realtime ou polling) e mostrar confirmação ao cliente: _"Seu pedido foi adicionado à sua comanda!"_

---

## 8. Exemplo completo em JavaScript (Supabase JS v2)

```javascript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Lê parâmetros da URL
const params = new URLSearchParams(window.location.search);
const mesa = params.get("mesa");        // "Mesa 3"
const empresaId = params.get("empresa"); // UUID
const modeMesa = params.get("modo") === "mesa";

// Insere pedido dine_in
async function fazerPedidoNaMesa(cart, customer) {
  const subtotal = cart.reduce((s, i) => s + i.subtotal, 0);

  const { data, error } = await supabase
    .from("delivery_orders")
    .insert({
      company_id:       empresaId,
      customer_name:    customer.name,
      customer_phone:   customer.phone,
      delivery_type:    "dine_in",
      table_identifier: mesa,           // ← chave do merge automático
      items:            cart,
      subtotal:         subtotal,
      delivery_fee:     0,
      discount_amount:  0,
      total:            subtotal,
      payment_method:   customer.paymentMethod,
      status:           "pending",
    })
    .select()
    .single();

  if (error) throw error;
  return data; // { id, numeric_id, ... }
}

// Chamar garçom pelo cardápio
async function chamarGarcom() {
  await supabase.from("waiter_calls").insert({
    company_id:  empresaId,
    table_label: mesa,
  });
}
```

---

## 9. Contato e suporte

Dúvidas sobre a integração → time PDVIO.
