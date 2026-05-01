import { scrollAppToTop } from "@/lib/scrollToTop";
import { useMemo, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getSupportStatus, type SupportStatus } from "@/lib/brasilApiHolidays";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LifeBuoy,
  MessageSquare,
  Inbox,
  Send,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  Phone,
  AlertTriangle,
  Bot,
  Headphones,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";

// ---------- Types ----------
interface SupportTicket {
  id: string;
  company_id: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  subject: string;
  category: string;
  priority: string;
  status: string;
  seq_number: number | null;
  created_at: string;
  updated_at: string;
}

// ---------- FAQ ----------
const FAQ_CATEGORIES: { title: string; items: { q: string; a: string }[] }[] = [
  {
    title: "Primeiros passos",
    items: [
      {
        q: "O que é o PDVIO?",
        a: "É um sistema de PDV (ponto de venda) completo na nuvem para comércio, restaurantes, bares e lanchonetes. Reúne caixa, vendas, comandas, cozinha (KDS), estoque, clientes, financeiro, relatórios e auditoria em um só lugar.",
      },
      {
        q: "Como começo a usar depois de criar a conta?",
        a: 'Ao entrar pela primeira vez, você passa pelo onboarding informando nome do negócio, ramo e documento. Depois cadastre alguns produtos em "Produtos", abra o caixa em "Caixa" e já pode vender pelo "PDV".',
      },
      {
        q: "Preciso instalar algum programa?",
        a: "Não. O PDVIO roda direto no navegador. Funciona no computador, tablet e celular. Também pode ser instalado como app (PWA) na tela inicial.",
      },
      {
        q: "Tem versão para celular?",
        a: 'Sim. No Chrome do Android use "Adicionar à tela inicial". No iPhone, no Safari, use "Compartilhar → Adicionar à Tela de Início". Abre como app standalone.',
      },
      {
        q: "Funciona offline?",
        a: "O sistema precisa de internet para sincronizar vendas, comandas e o caixa entre os terminais em tempo real. Conexões instáveis podem causar atrasos na sincronização.",
      },
    ],
  },
  {
    title: "Empresa e equipe",
    items: [
      {
        q: "Posso ter mais de uma empresa na mesma conta?",
        a: 'Sim. Em "Configurações" você troca entre as empresas vinculadas à sua conta. Cada empresa tem seus próprios produtos, vendas, caixa, equipe e relatórios.',
      },
      {
        q: "Quais cargos existem e o que cada um pode fazer?",
        a: "Dono (acesso total), Gerente (quase total, com aprovações), Caixa (operar PDV e caixa), Garçom (comandas) e Cozinha (KDS). Ações sensíveis exigem aprovação de gerente ou dono.",
      },
      {
        q: "Como cadastro um novo funcionário?",
        a: 'Vá em "Configurações" → "Equipe". Clique em "Novo funcionário", informe nome, cargo, PIN e o número do cartão (opcional).',
      },
      {
        q: "Como gero o cartão físico do operador?",
        a: 'Em "Configurações" → "Equipe", abra o funcionário e use a opção de imprimir cartão. O cartão sai com código de barras para login rápido.',
      },
      {
        q: "Esqueci o PIN de um operador, como recupero?",
        a: 'Como dono ou gerente, vá em "Configurações" → "Equipe", abra o funcionário e defina um novo PIN.',
      },
    ],
  },
  {
    title: "PDV e vendas",
    items: [
      {
        q: "Quais formas de pagamento o PDV aceita?",
        a: "Dinheiro, cartão de crédito, cartão de débito, PIX e ticket (vale).",
      },
      {
        q: "Como uso o leitor de código de barras?",
        a: "Funciona com qualquer leitor USB ou Bluetooth que envie como teclado — basta bipar com o PDV aberto. Também dá pra ler com a câmera do dispositivo pelo botão de scanner.",
      },
      {
        q: "Como aplico desconto na venda?",
        a: "No carrinho, você pode dar desconto por item ou no total da venda, em valor ou percentual. Descontos podem exigir permissão e ficam registrados na auditoria.",
      },
      {
        q: "Como vinculo um cliente à venda?",
        a: 'Dentro do PDV, use o botão de cliente e busque pelo nome, CPF/CNPJ ou telefone. Se não existir, cadastre na hora em "Clientes".',
      },
      {
        q: "Vendo por peso/quilo, dá para usar?",
        a: "Sim. Os produtos têm unidade de medida (un, cx, kg, L). Para itens em kg/L, o PDV abre um campo decimal para informar a quantidade exata.",
      },
      {
        q: "Como cancelo uma venda já finalizada?",
        a: 'Em "Vendas", abra a venda e clique em "Cancelar venda" (precisa de permissão). É exigido um motivo e a ação fica registrada na auditoria.',
      },
      {
        q: "Como faço uma devolução parcial?",
        a: 'Em "Vendas", abra a venda e use "Devolução". Escolha entre devolução total ou parcial e a forma de devolver o valor (dinheiro, cartão, PIX, etc.).',
      },
    ],
  },
  {
    title: "Caixa",
    items: [
      {
        q: "Como abro o caixa para começar a vender?",
        a: 'Vá no menu "Caixa" e clique em "Abrir caixa". Informe o valor inicial de troco. Sem caixa aberto, o PDV não permite finalizar vendas em dinheiro.',
      },
      {
        q: "Como faço uma sangria ou suprimento?",
        a: 'Na página "Caixa", com o caixa aberto, use os botões "Sangria" (saída de dinheiro) ou "Suprimento" (entrada). Informe o valor e o motivo. O movimento aparece na auditoria.',
      },
      {
        q: "Como fechar o caixa no fim do dia?",
        a: 'Em "Caixa", clique em "Fechar caixa". Informe o valor declarado em dinheiro. O sistema mostra o esperado, o declarado e a diferença, e registra tudo na auditoria.',
      },
      {
        q: "Por que o caixa exige aprovação do gerente?",
        a: "Ações sensíveis como abrir/fechar caixa, sangria e suprimento podem exigir cartão e PIN de um dono ou gerente, para garantir controle financeiro.",
      },
      {
        q: "O que aparece no resumo do caixa?",
        a: "Total de vendas separado por forma de pagamento, descontos concedidos, cancelamentos, devoluções e diferença entre o valor esperado e o declarado.",
      },
    ],
  },
  {
    title: "Comandas e KDS",
    items: [
      {
        q: "Como abro uma nova comanda/mesa?",
        a: 'Em "Comandas", clique em "Nova comanda" e dê um identificador (ex: "Mesa 05" ou nome do cliente). Adicione itens por busca ou código de barras.',
      },
      {
        q: "Como envio os pedidos para a cozinha?",
        a: "Ao adicionar itens marcados para produção, eles aparecem automaticamente no KDS (Kitchen Display System) em tempo real.",
      },
      {
        q: "Como funciona o KDS?",
        a: "O KDS mostra três colunas: Pendentes, Em preparo e Prontos. A cozinha avança o item conforme produz. Itens com tempo de espera longo destacam em amarelo e vermelho.",
      },
      {
        q: "Como fecho uma comanda?",
        a: 'Em "Comandas", abra a comanda e use "Fechar". Os itens viram uma venda no PDV, onde você escolhe a forma de pagamento e finaliza.',
      },
      {
        q: "Posso cancelar uma comanda?",
        a: "Sim. Comandas podem ser canceladas com motivo. A ação fica registrada na auditoria.",
      },
    ],
  },
  {
    title: "Produtos e estoque",
    items: [
      {
        q: "Como cadastro um novo produto?",
        a: 'Em "Produtos", clique em "Novo produto". Informe nome, preço, unidade, categoria e, se quiser, código de barras e imagem.',
      },
      {
        q: "Posso preencher dados do produto pelo código de barras?",
        a: "Sim. Ao informar o código de barras, o sistema consulta bases públicas (Cosmos/Bluesoft, OpenFoodFacts) e tenta preencher nome, marca e imagem automaticamente.",
      },
      {
        q: "Como faço uma promoção por tempo limitado?",
        a: "No cadastro do produto, defina o preço promocional e as datas de início e fim. O preço promocional ativa e desativa automaticamente.",
      },
      {
        q: "Como controlo o estoque?",
        a: "Cada produto tem quantidade em estoque. Vendas reduzem o estoque automaticamente; devoluções devolvem ao estoque.",
      },
      {
        q: "Posso usar categorias para organizar?",
        a: "Sim. Crie categorias e atribua aos produtos para filtrar mais rápido no PDV.",
      },
    ],
  },
  {
    title: "Clientes",
    items: [
      {
        q: "Como cadastro um cliente?",
        a: 'Em "Clientes", clique em "Novo cliente". Informe nome, telefone, e-mail, CPF/CNPJ e observações. O sistema valida CPF/CNPJ.',
      },
      {
        q: "O sistema avisa se o cliente já existe?",
        a: "Sim. Se já existir um cadastro com o mesmo CPF/CNPJ ou telefone, o sistema bloqueia para evitar duplicidade.",
      },
      {
        q: "Consigo ver o histórico de compras de um cliente?",
        a: "Sim. Vendas vinculadas ao cliente aparecem no perfil dele.",
      },
    ],
  },
  {
    title: "Financeiro e relatórios",
    items: [
      {
        q: "Onde acompanho o faturamento?",
        a: 'Em "Financeiro" você vê receita líquida, ticket médio, total de vendas, descontos e gráfico de receita por período (hoje, semana, mês, ano).',
      },
      {
        q: "Quais relatórios estão disponíveis?",
        a: 'Em "Relatórios" você tem ranking de produtos mais vendidos, receita por forma de pagamento e desempenho por período.',
      },
      {
        q: "Posso exportar relatórios?",
        a: "Sim. Os relatórios podem ser exportados em PDF (com a logo da empresa), CSV ou PNG.",
      },
    ],
  },
  {
    title: "Impressora",
    items: [
      {
        q: "Como conecto uma impressora térmica?",
        a: 'Em "Configurações" → "Impressora", escolha a forma de conexão (USB, Serial ou Bluetooth). O sistema usa Web Serial / Web USB / Web Bluetooth.',
      },
      {
        q: "Quais navegadores suportam impressora direto?",
        a: "Google Chrome e Microsoft Edge no computador suportam Web USB, Web Serial e Web Bluetooth. Se o navegador não suportar, o cupom cai na impressão padrão do navegador.",
      },
      {
        q: "Posso colocar logo, cabeçalho e rodapé no cupom?",
        a: 'Sim, em "Configurações" → "Impressora" você personaliza cabeçalho, rodapé e ativa impressão automática ao finalizar a venda.',
      },
      {
        q: "A impressão é fiscal (NFC-e)?",
        a: "Não. O PDVIO emite cupom não fiscal de venda. Emissão fiscal está no roadmap.",
      },
    ],
  },
  {
    title: "Segurança e auditoria",
    items: [
      {
        q: "Como ativar o modo operador (PIN/cartão)?",
        a: 'Como dono ou gerente, clique no botão "Modo operador" no topo da tela. O terminal é bloqueado e cada funcionário precisa bipar o cartão e digitar o PIN para usar.',
      },
      {
        q: "Onde vejo o histórico de ações?",
        a: 'Em "Auditoria" estão todos os eventos sensíveis: cancelamentos, descontos, abertura/fechamento de caixa, sangria, suprimento, devoluções e alterações em funcionários.',
      },
      {
        q: "Quais ações exigem aprovação de gerente?",
        a: "Cancelamento de venda, descontos acima do permitido, abertura/fechamento de caixa, sangria, suprimento e alterações em funcionários podem exigir cartão e PIN de gerente ou dono.",
      },
      {
        q: "Posso usar em vários computadores ao mesmo tempo?",
        a: "Sim. Cada terminal faz login com a mesma conta da empresa. Vendas, comandas e caixa sincronizam em tempo real.",
      },
    ],
  },
  {
    title: "Suporte",
    items: [
      {
        q: "Como abro um chamado?",
        a: 'Vá na aba "Abrir chamado", informe assunto e categoria. Você é levado direto para o chat do chamado, onde o PDV.IA inicia o atendimento. Se for um caso complexo, encaminhamos para um atendente humano dentro do mesmo chamado.',
      },
      {
        q: "Como funciona o PDV.IA?",
        a: "É o assistente automático que responde dúvidas simples e operacionais. Quando o caso for complexo, sensível ou exigir verificação manual, o próprio bot encaminha para um atendente humano sem perder o histórico.",
      },
      {
        q: "Posso falar direto com um atendente humano?",
        a: 'Sim. Dentro do chat do chamado existe o botão "Falar com atendente" — basta clicar e o chamado é encaminhado para a fila humana.',
      },
      {
        q: "Onde vejo as próximas funcionalidades?",
        a: 'Em "Roadmap" você acompanha o que está planejado, em desenvolvimento e o que já foi entregue.',
      },
    ],
  },
];

// ---------- Status meta ----------
const STATUS_META: Record<string, { label: string; className: string }> = {
  open: { label: "Aberto", className: "bg-primary/15 text-primary border-primary/30" },
  bot_handling: {
    label: "PDV.IA",
    className: "bg-violet-500/15 text-violet-600 dark:text-violet-300 border-violet-500/30",
  },
  in_progress: {
    label: "Em andamento",
    className: "bg-warning/15 text-warning border-warning/30",
  },
  waiting_user: {
    label: "Aguardando você",
    className: "bg-warning/15 text-warning border-warning/30",
  },
  waiting_human: {
    label: "Aguardando atendente",
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30",
  },
  human_assigned: {
    label: "Com atendente",
    className: "bg-success/15 text-success border-success/30",
  },
  resolved: {
    label: "Resolvido",
    className: "bg-success/15 text-success border-success/30",
  },
  closed: { label: "Fechado", className: "bg-muted text-muted-foreground border-border" },
};

const CATEGORY_LABEL: Record<string, string> = {
  duvida: "Dúvida",
  bug: "Erro / bug",
  sugestao: "Sugestão",
  financeiro: "Financeiro",
  outro: "Outro",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------- Page ----------
export default function Suporte() {
  const [supportStatus, setSupportStatus] = useState<SupportStatus | null>(null);
  const [tab, setTab] = useState("contato");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const s = await getSupportStatus();
      if (!cancelled) setSupportStatus(s);
    }
    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="space-y-6 p-4 sm:p-6 md:p-8 animate-fade-in">
      <div>
        <div className="flex items-center gap-2">
          <LifeBuoy className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Suporte</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Abra um chamado e converse com o PDV.IA. Se precisar, encaminhamos para um atendente humano.
        </p>
      </div>

      {supportStatus && (
        <div
          className={`flex items-center gap-3 rounded-lg border p-3 ${
            supportStatus.open
              ? "border-success/40 bg-success/10 text-success"
              : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          }`}
          data-testid="banner-support-status"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                supportStatus.open ? "bg-success animate-ping" : "bg-amber-500"
              }`}
            />
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                supportStatus.open ? "bg-success" : "bg-amber-500"
              }`}
            />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">
              {supportStatus.open ? "Suporte aberto agora" : "Suporte fora do horário"}
            </div>
            <div className="text-xs opacity-90">
              {supportStatus.reason} · Atendimento humano de segunda a sexta, 09h às 18h (horário de Brasília), exceto feriados. O PDV.IA atende 24h.
            </div>
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex w-full overflow-x-auto sm:grid sm:grid-cols-3">
          <TabsTrigger value="contato" data-testid="tab-contato" className="shrink-0 whitespace-nowrap sm:shrink">
            <MessageSquare className="mr-1.5 h-4 w-4" />
            Abrir chamado
          </TabsTrigger>
          <TabsTrigger value="chamados" data-testid="tab-chamados" className="shrink-0 whitespace-nowrap sm:shrink">
            <Inbox className="mr-1.5 h-4 w-4" />
            Meus chamados
          </TabsTrigger>
          <TabsTrigger value="faq" data-testid="tab-faq" className="shrink-0 whitespace-nowrap sm:shrink">
            <HelpCircle className="mr-1.5 h-4 w-4" />
            Perguntas frequentes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contato" className="mt-4 space-y-4">
          <NewTicketForm />
          <ContactChannels />
        </TabsContent>

        <TabsContent value="chamados" className="mt-4">
          <TicketsList />
        </TabsContent>

        <TabsContent value="faq" className="mt-4">
          <FaqTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- New ticket ----------
function NewTicketForm() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const queryClient = useQueryClient();

  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<string>("duvida");

  const create = useMutation({
    mutationFn: async () => {
      if (!activeCompany || !user) throw new Error("Selecione uma empresa primeiro");
      if (!subject.trim()) throw new Error("Informe o assunto do chamado");

      const userName =
        (user.user_metadata?.full_name as string | undefined) ?? user.email ?? "Usuário";

      const { data: ticket, error: tErr } = await (supabase as any)
        .from("support_tickets")
        .insert({
          company_id: activeCompany.id,
          user_id: user.id,
          user_name: userName,
          user_email: user.email ?? null,
          subject: subject.trim(),
          category,
          priority: "normal",
          status: "open",
        })
        .select("id, seq_number")
        .single();
      if (tErr) throw tErr;

      return ticket as { id: string; seq_number: number };
    },
    onSuccess: (ticket) => {
      toast.success(`Chamado #${String(ticket.seq_number).padStart(4, "0")} aberto.`);
      queryClient.invalidateQueries({ queryKey: ["/suporte/tickets"] });
      setSubject("");
      setCategory("duvida");
      navigate(`/suporte/ticket/${ticket.seq_number}`);
    },
    onError: (err: any) => toast.error(err?.message ?? "Não foi possível abrir o chamado"),
  });

  if (!activeCompany) return <NeedCompany />;

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="h-4 w-4 text-violet-500" />
          Abrir chamado com PDV.IA
        </CardTitle>
        <CardDescription>
          Conte rapidamente o que está acontecendo. O PDV.IA inicia o atendimento e, se precisar,
          encaminha para um atendente humano sem perder o histórico.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="subject">Assunto</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Ex.: Não consigo abrir o caixa"
            maxLength={120}
            data-testid="input-suporte-subject"
            onKeyDown={(e) => {
              if (e.key === "Enter" && subject.trim() && !create.isPending) {
                e.preventDefault();
                create.mutate();
              }
            }}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Categoria</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger data-testid="select-suporte-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Headphones className="h-3.5 w-3.5" />
            Você pode pedir um atendente humano a qualquer momento dentro do chat.
          </div>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || !subject.trim()}
            data-testid="button-suporte-enviar"
          >
            {create.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Iniciar chamado
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function NeedCompany() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
        <AlertTriangle className="h-8 w-8 opacity-40" />
        <p className="text-sm">Selecione uma empresa para abrir um chamado.</p>
      </CardContent>
    </Card>
  );
}

// ---------- Contact channels ----------
function ContactChannels() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Outros canais de contato</CardTitle>
        <CardDescription>
          Prefere falar por e-mail ou WhatsApp? Use os contatos abaixo.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <a
          href="mailto:suporte@pdvio.com.br"
          className="flex items-center gap-3 rounded-md border border-border bg-card p-3 transition-colors hover:bg-accent/50"
          data-testid="link-suporte-email"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Mail className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">E-mail</div>
            <div className="truncate text-sm font-medium" data-testid="text-suporte-email">
              suporte@pdvio.com.br
            </div>
          </div>
        </a>

        <a
          href="https://wa.me/553532126397"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-md border border-border bg-card p-3 transition-colors hover:bg-accent/50"
          data-testid="link-suporte-whatsapp"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500/10 text-green-600 dark:text-green-400">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
              <path d="M20.52 3.48A11.94 11.94 0 0 0 12.04 0C5.5 0 .2 5.3.2 11.84c0 2.09.55 4.12 1.6 5.92L0 24l6.4-1.68a11.84 11.84 0 0 0 5.64 1.44h.01c6.54 0 11.84-5.3 11.84-11.84 0-3.16-1.23-6.13-3.37-8.44ZM12.04 21.4h-.01a9.55 9.55 0 0 1-4.87-1.34l-.35-.21-3.8 1 .99-3.7-.23-.38a9.55 9.55 0 0 1-1.46-5.06c0-5.27 4.29-9.56 9.56-9.56 2.55 0 4.95.99 6.76 2.8a9.5 9.5 0 0 1 2.8 6.77c0 5.27-4.29 9.56-9.56 9.56Zm5.24-7.16c-.29-.14-1.7-.84-1.96-.93-.27-.1-.46-.14-.66.14-.2.29-.76.93-.93 1.12-.17.2-.34.21-.63.07-.29-.14-1.21-.45-2.31-1.43-.85-.76-1.43-1.7-1.6-1.99-.17-.29-.02-.45.13-.59.13-.13.29-.34.43-.51.14-.17.19-.29.29-.49.1-.2.05-.37-.02-.51-.07-.14-.66-1.59-.9-2.18-.24-.57-.48-.49-.66-.5h-.56c-.2 0-.51.07-.78.36-.27.29-1.02 1-1.02 2.43s1.05 2.82 1.19 3.02c.14.2 2.06 3.15 5 4.42.7.3 1.25.48 1.67.61.7.22 1.34.19 1.84.12.56-.08 1.7-.7 1.94-1.37.24-.67.24-1.24.17-1.36-.07-.12-.27-.2-.56-.34Z" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="h-3 w-3" /> WhatsApp / Telefone
            </div>
            <div className="truncate text-sm font-medium" data-testid="text-suporte-phone">
              (35) 3212-6397
            </div>
          </div>
        </a>
      </CardContent>
    </Card>
  );
}

// ---------- FAQ ----------
function FaqTab() {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-base">Perguntas frequentes</CardTitle>
        <CardDescription>
          Não achou o que procura? Vá na aba "Abrir chamado".
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {FAQ_CATEGORIES.map((cat, ci) => (
          <div key={ci} className="space-y-2" data-testid={`faq-category-${ci}`}>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {cat.title}
              </h3>
              <Badge variant="secondary" className="text-[10px]">
                {cat.items.length}
              </Badge>
            </div>
            <Accordion type="single" collapsible className="w-full">
              {cat.items.map((item, idx) => (
                <AccordionItem
                  key={idx}
                  value={`item-${ci}-${idx}`}
                  data-testid={`faq-item-${ci}-${idx}`}
                >
                  <AccordionTrigger className="text-left text-sm font-medium">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------- Tickets list ----------
function TicketsList() {
  const { activeCompany } = useCompany();

  const { data: tickets = [], isLoading } = useQuery<SupportTicket[]>({
    queryKey: ["/suporte/tickets", activeCompany?.id],
    enabled: !!activeCompany,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("support_tickets")
        .select("*")
        .eq("company_id", activeCompany!.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const grouped = useMemo(() => {
    const open = tickets.filter(
      (t) => !["resolved", "closed"].includes(t.status),
    );
    const done = tickets.filter((t) => ["resolved", "closed"].includes(t.status));
    return { open, done };
  }, [tickets]);

  if (!activeCompany) return <NeedCompany />;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground opacity-40" />
          <p className="text-sm font-medium text-muted-foreground">
            Você ainda não abriu nenhum chamado.
          </p>
          <p className="text-xs text-muted-foreground">
            Use a aba "Abrir chamado" para começar.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {grouped.open.length > 0 && (
        <TicketGroup title="Em aberto" icon={Clock} tickets={grouped.open} />
      )}
      {grouped.done.length > 0 && (
        <TicketGroup title="Encerrados" icon={CheckCircle2} tickets={grouped.done} />
      )}
    </div>
  );
}

function TicketGroup({
  title,
  icon: Icon,
  tickets,
}: {
  title: string;
  icon: typeof Clock;
  tickets: SupportTicket[];
}) {
  const PAGE_SIZE = 8;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(tickets.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visible = tickets.slice(start, start + PAGE_SIZE);

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
          <Badge variant="secondary" className="ml-1">
            {tickets.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {visible.map((t) => {
            const meta = STATUS_META[t.status] ?? STATUS_META.open;
            return (
              <Link
                key={t.id}
                to={`/suporte/ticket/${t.seq_number ?? ""}`}
                className="flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-accent/50"
                data-testid={`ticket-row-${t.id}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      #{String(t.seq_number ?? 0).padStart(4, "0")}
                    </span>
                    <span className="text-sm font-semibold">{t.subject}</span>
                    <Badge variant="outline" className={`text-[10px] ${meta.className}`}>
                      {meta.label}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {CATEGORY_LABEL[t.category] ?? t.category}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDate(t.updated_at)}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  Aberto por {t.user_name ?? "—"}
                </span>
              </Link>
            );
          })}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2">
            <span className="text-xs text-muted-foreground">
              Página {currentPage} de {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPage((p) => Math.max(1, p - 1));
                  scrollAppToTop();
                }}
                disabled={currentPage === 1}
                data-testid="button-suporte-prev-page"
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPage((p) => Math.min(totalPages, p + 1));
                  scrollAppToTop();
                }}
                disabled={currentPage === totalPages}
                data-testid="button-suporte-next-page"
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
