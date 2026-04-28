import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { toast } from "sonner";
import {
  ArrowLeft,
  Send,
  Loader2,
  Bot,
  Headphones,
  Info,
  CheckCircle2,
  UserCog,
} from "lucide-react";
import pdvioAvatar from "@assets/pdvio_perfil_1776833645647.png";
import { askPDVIA } from "@/services/openrouter";

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
  assigned_to: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SupportMessage {
  id: string;
  ticket_id: string;
  author_id: string | null;
  author_name: string | null;
  author_type: string; // 'user' | 'customer' | 'bot' | 'agent' | 'support' | 'system'
  body: string;
  metadata: any;
  created_at: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  duvida: "Dúvida",
  bug: "Erro / bug",
  sugestao: "Sugestão",
  financeiro: "Financeiro",
  outro: "Outro",
};

const STATUS_META: Record<string, { label: string; className: string; icon: any }> = {
  open: {
    label: "Aberto",
    className: "bg-primary/15 text-primary border-primary/30",
    icon: Info,
  },
  bot_handling: {
    label: "Atendimento PDV.IA",
    className: "bg-violet-500/15 text-violet-600 dark:text-violet-300 border-violet-500/30",
    icon: Bot,
  },
  in_progress: {
    label: "Em andamento",
    className: "bg-warning/15 text-warning border-warning/30",
    icon: Loader2,
  },
  waiting_user: {
    label: "Aguardando você",
    className: "bg-warning/15 text-warning border-warning/30",
    icon: Info,
  },
  waiting_human: {
    label: "Aguardando atendente",
    className:
      "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30",
    icon: Headphones,
  },
  human_assigned: {
    label: "Com atendente",
    className: "bg-success/15 text-success border-success/30",
    icon: UserCog,
  },
  resolved: {
    label: "Resolvido",
    className: "bg-success/15 text-success border-success/30",
    icon: CheckCircle2,
  },
  closed: {
    label: "Fechado",
    className: "bg-muted text-muted-foreground border-border",
    icon: CheckCircle2,
  },
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isCustomerMessage(m: SupportMessage) {
  return m.author_type === "user" || m.author_type === "customer";
}
function isBotMessage(m: SupportMessage) {
  return m.author_type === "bot";
}
function isAgentMessage(m: SupportMessage) {
  return m.author_type === "agent" || m.author_type === "support";
}
function isSystemMessage(m: SupportMessage) {
  return m.author_type === "system";
}

export default function SuporteTicket() {
  const { seq } = useParams<{ seq: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const queryClient = useQueryClient();

  const [reply, setReply] = useState("");
  const [botThinking, setBotThinking] = useState(false);
  const [confirmResolveOpen, setConfirmResolveOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seqNum = Number(seq);

  // Esta página é o canal do CLIENTE (empresa) com o suporte do PDVIO.
  // Mesmo donos/gerentes da empresa são clientes aqui — quem responde como
  // "atendente" é a equipe do PDVIO, por outra interface. Por isso, qualquer
  // resposta enviada daqui é sempre tratada como mensagem do usuário.

  // -------- Ticket --------
  const ticketQuery = useQuery<SupportTicket | null>({
    queryKey: ["/suporte/ticket-by-seq", activeCompany?.id, seqNum],
    enabled: !!activeCompany && Number.isFinite(seqNum),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("support_tickets")
        .select("*")
        .eq("company_id", activeCompany!.id)
        .eq("seq_number", seqNum)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
  const ticket = ticketQuery.data;

  // -------- Messages --------
  const messagesQuery = useQuery<SupportMessage[]>({
    queryKey: ["/suporte/messages", ticket?.id],
    enabled: !!ticket,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("support_messages")
        .select("*")
        .eq("ticket_id", ticket!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const messages = messagesQuery.data ?? [];

  // -------- Customer avatar (the user who opened the ticket) --------
  const customerAvatarQuery = useQuery<string | null>({
    queryKey: ["/suporte/customer-avatar", ticket?.user_id],
    enabled: !!ticket?.user_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("avatar_url")
        .eq("id", ticket!.user_id)
        .maybeSingle();
      if (error) throw error;
      return data?.avatar_url ?? null;
    },
  });
  const customerAvatarUrl = customerAvatarQuery.data ?? null;
  const customerName = ticket?.user_name ?? user?.user_metadata?.full_name ?? user?.email ?? null;

  // -------- Realtime --------
  useEffect(() => {
    if (!ticket?.id) return;
    const ch = (supabase as any)
      .channel(`support-ticket:${ticket.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_messages", filter: `ticket_id=eq.${ticket.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["/suporte/messages", ticket.id] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "support_tickets", filter: `id=eq.${ticket.id}` },
        () => {
          queryClient.invalidateQueries({
            queryKey: ["/suporte/ticket-by-seq", activeCompany?.id, seqNum],
          });
        },
      )
      .subscribe();
    return () => {
      (supabase as any).removeChannel(ch);
    };
  }, [ticket?.id, queryClient, activeCompany?.id, seqNum]);

  // -------- Auto-scroll --------
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, botThinking]);

  // -------- Saudação inicial do bot --------
  const greetedRef = useRef(false);
  useEffect(() => {
    if (!ticket || messages.length > 0 || greetedRef.current) return;
    if (!["open", "bot_handling"].includes(ticket.status)) return;
    greetedRef.current = true;
    void greetWithBot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.id, messages.length]);

  async function insertMessage(payload: {
    author_type: string;
    body: string;
    metadata?: any;
  }) {
    if (!ticket) return;
    const authorName =
      (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "Usuário";
    const { error } = await (supabase as any).from("support_messages").insert({
      ticket_id: ticket.id,
      author_id: payload.author_type === "bot" || payload.author_type === "system" ? null : user?.id ?? null,
      author_name:
        payload.author_type === "bot"
          ? "PDV.IA"
          : payload.author_type === "system"
            ? "Sistema"
            : authorName,
      author_type: payload.author_type,
      body: payload.body,
      metadata: payload.metadata ?? null,
    });
    if (error) throw error;
    // Invalidação explícita: o canal realtime pode ainda não ter terminado de
    // se inscrever quando a primeira mensagem é inserida, então não dá para
    // depender só dele.
    await queryClient.invalidateQueries({ queryKey: ["/suporte/messages", ticket.id] });
  }

  async function updateTicket(patch: Partial<SupportTicket>) {
    if (!ticket) return;
    const { error } = await (supabase as any)
      .from("support_tickets")
      .update(patch)
      .eq("id", ticket.id);
    if (error) throw error;
    await queryClient.invalidateQueries({
      queryKey: ["/suporte/ticket-by-seq", activeCompany?.id, seqNum],
    });
    await queryClient.invalidateQueries({ queryKey: ["/suporte/tickets"] });
  }

  async function greetWithBot() {
    if (!ticket) return;
    setBotThinking(true);
    try {
      const result = await askPDVIA({
        subject: ticket.subject,
        category: ticket.category,
        history: [
          {
            role: "user",
            content: `O usuário acabou de abrir este chamado. Assunto: "${ticket.subject}". Categoria: ${CATEGORY_LABEL[ticket.category] ?? ticket.category}. Cumprimente brevemente, mostre que entendeu o tema e faça 1-3 perguntas curtas e objetivas para entender melhor o que está acontecendo (em qual tela, mensagem de erro, o que estava tentando fazer, etc). Não escale ainda.`,
          },
        ],
      });

      await insertMessage({
        author_type: "bot",
        body: result.reply,
        metadata: { is_ai: true, confidence_score: result.confidence },
      });

      const patch: Partial<SupportTicket> = {
        status: result.handoff ? "waiting_human" : "bot_handling",
      };
      if (!ticket.first_response_at) (patch as any).first_response_at = new Date().toISOString();
      await updateTicket(patch);

      if (result.handoff) {
        await insertMessage({
          author_type: "system",
          body: "Este chamado foi encaminhado para um atendente humano. Em breve alguém da equipe responde por aqui.",
          metadata: { handoff_to_human: true },
        });
      }
    } catch (err: any) {
      console.error(err);
      await insertMessage({
        author_type: "system",
        body: "Não foi possível iniciar o atendimento automático. O chamado foi encaminhado para um atendente humano.",
        metadata: { handoff_to_human: true, error: String(err?.message ?? err) },
      });
      await updateTicket({ status: "waiting_human" });
    } finally {
      setBotThinking(false);
    }
  }

  // -------- Enviar mensagem do usuário (com resposta do bot quando aplicável) --------
  const sendUser = useMutation({
    mutationFn: async () => {
      if (!ticket || !user) throw new Error("Sem chamado ativo");
      const text = reply.trim();
      if (!text) throw new Error("Mensagem vazia");

      await insertMessage({ author_type: "user", body: text });
      setReply("");

      // Se o ticket está com bot, gera resposta automática
      const status = ticket.status;
      if (status === "open" || status === "bot_handling") {
        setBotThinking(true);
        try {
          // monta histórico (busca atualizada)
          const { data: latest } = await (supabase as any)
            .from("support_messages")
            .select("author_type, body")
            .eq("ticket_id", ticket.id)
            .order("created_at", { ascending: true });

          const history = (latest ?? []).map((m: any) => ({
            role: m.author_type === "bot" ? "assistant" : "user",
            content: m.body,
          }));

          const result = await askPDVIA({
            subject: ticket.subject,
            category: ticket.category,
            history,
          });

          await insertMessage({
            author_type: "bot",
            body: result.reply,
            metadata: { is_ai: true, confidence_score: result.confidence },
          });

          const patch: Partial<SupportTicket> = {
            status: result.handoff ? "waiting_human" : "bot_handling",
          };
          if (!ticket.first_response_at) (patch as any).first_response_at = new Date().toISOString();
          await updateTicket(patch);

          if (result.handoff) {
            await insertMessage({
              author_type: "system",
              body: "Este chamado foi encaminhado para um atendente humano. Em breve alguém da equipe responde por aqui.",
              metadata: { handoff_to_human: true },
            });
          }
        } finally {
          setBotThinking(false);
        }
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao enviar"),
  });

  // -------- Pedir atendimento humano --------
  const requestHuman = useMutation({
    mutationFn: async () => {
      if (!ticket) return;
      await insertMessage({
        author_type: "system",
        body: "O usuário solicitou atendimento humano. Aguardando atendente.",
        metadata: { handoff_to_human: true, requested_by_user: true },
      });
      await updateTicket({ status: "waiting_human" });
    },
    onSuccess: () => toast.success("Pedido enviado. Em breve um atendente responde."),
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const setStatus = useMutation({
    mutationFn: async (status: string) => {
      if (!ticket) return;
      const patch: Partial<SupportTicket> = { status };
      if (status === "resolved" || status === "closed") {
        (patch as any).resolved_at = new Date().toISOString();
      }
      await updateTicket(patch);
      await insertMessage({
        author_type: "system",
        body:
          status === "resolved"
            ? "Chamado marcado como resolvido."
            : status === "closed"
              ? "Chamado fechado."
              : status === "open"
                ? "Chamado reaberto."
                : "Status atualizado.",
      });
    },
    onSuccess: () => toast.success("Status atualizado"),
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  // -------- Auto-encerramento por inatividade do cliente --------
  // Se o atendente humano respondeu e o cliente ficou 5 dias sem responder,
  // o chamado é fechado automaticamente quando esta página é aberta.
  const INACTIVITY_LIMIT_MS = 5 * 24 * 60 * 60 * 1000;
  const autoClosedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ticket || messages.length === 0) return;
    if (ticket.status !== "human_assigned") return;
    if (autoClosedRef.current === ticket.id) return;

    // Considera apenas mensagens reais da conversa (ignora mensagens de sistema)
    const conv = messages.filter((m) => !isSystemMessage(m));
    if (conv.length === 0) return;
    const last = conv[conv.length - 1];
    if (!isAgentMessage(last)) return;

    const elapsed = Date.now() - new Date(last.created_at).getTime();
    if (elapsed < INACTIVITY_LIMIT_MS) return;

    autoClosedRef.current = ticket.id;
    (async () => {
      try {
        await insertMessage({
          author_type: "system",
          body: "Chamado encerrado automaticamente: passaram-se 5 dias sem resposta do cliente após o último contato do atendente. Se ainda precisar de ajuda, abra um novo chamado.",
          metadata: { auto_closed: true, reason: "user_inactivity_5d" },
        });
        await updateTicket({
          status: "closed",
          resolved_at: new Date().toISOString(),
        } as any);
      } catch (err) {
        console.error("Falha ao encerrar chamado por inatividade:", err);
        autoClosedRef.current = null;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.id, ticket?.status, messages]);

  // -------- Render --------
  const meta = useMemo(
    () => (ticket ? STATUS_META[ticket.status] ?? STATUS_META.open : STATUS_META.open),
    [ticket],
  );

  if (!activeCompany) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6 text-center text-sm text-muted-foreground">
        Selecione uma empresa para ver este chamado.
      </div>
    );
  }

  if (ticketQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-3 p-4 sm:p-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Chamado #{seq} não encontrado nesta empresa.
        </p>
        <Button variant="outline" onClick={() => navigate("/suporte")} data-testid="button-voltar-suporte">
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao Suporte
        </Button>
      </div>
    );
  }

  const StatusIcon = meta.icon;
  const isClosed = ["resolved", "closed"].includes(ticket.status);
  const isWithBot = ["open", "bot_handling"].includes(ticket.status);
  const isWaitingHuman = ticket.status === "waiting_human";
  const isWithAgent = ticket.status === "human_assigned";

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] w-full max-w-3xl flex-col gap-3 p-3 sm:p-4 md:p-6">
      {/* Header */}
      <Card className="shrink-0">
        <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-3">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            data-testid="button-back"
          >
            <Link to="/suporte" aria-label="Voltar">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground" data-testid="text-ticket-seq">
                #{String(ticket.seq_number ?? seq).padStart(4, "0")}
              </span>
              <h1 className="text-base font-semibold leading-tight" data-testid="text-ticket-subject">
                {ticket.subject}
              </h1>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className={`gap-1 text-[10px] ${meta.className}`} data-testid="badge-ticket-status">
                <StatusIcon className={`h-3 w-3 ${ticket.status === "in_progress" ? "animate-spin" : ""}`} />
                {meta.label}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {CATEGORY_LABEL[ticket.category] ?? ticket.category}
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                Aberto em {formatTime(ticket.created_at)}
              </span>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Banner de status */}
      {isWaitingHuman && (
        <div
          className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
          data-testid="banner-waiting-human"
        >
          <Headphones className="h-4 w-4 shrink-0" />
          <span>
            Este chamado foi encaminhado para um atendente humano. Você pode continuar enviando
            informações por aqui — alguém da equipe responde em breve.
          </span>
        </div>
      )}

      {/* Chat */}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardContent className="flex min-h-0 flex-1 flex-col gap-2 p-0">
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-5">
            {messagesQuery.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <>
                {messages.map((m) => (
                  <MessageBubble key={m.id} m={m} customerAvatarUrl={customerAvatarUrl} customerName={customerName} />
                ))}
                {botThinking && (
                  <div className="flex items-end gap-2" data-testid="bubble-bot-thinking">
                    <img
                      src={pdvioAvatar}
                      alt="PDV.IA"
                      className="h-7 w-7 shrink-0 rounded-full border border-border object-cover"
                    />
                    <div className="rounded-2xl rounded-bl-sm border border-border bg-muted/40 px-3 py-2">
                      <div className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Input */}
          {!isClosed && (
            <div className="border-t border-border bg-card/50 p-3">
              <div className="flex items-end gap-2">
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (reply.trim() && !sendUser.isPending) {
                        sendUser.mutate();
                      }
                    }
                  }}
                  placeholder={
                    isWithBot
                      ? "Pergunte ao PDV.IA ou descreva seu problema..."
                      : isWaitingHuman
                        ? "Adicione mais informações enquanto aguarda o atendente..."
                        : "Escreva sua mensagem..."
                  }
                  rows={2}
                  className="min-h-[44px] resize-none"
                  data-testid="textarea-chat"
                />
                <Button
                  onClick={() => sendUser.mutate()}
                  disabled={!reply.trim() || sendUser.isPending || botThinking}
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  data-testid="button-send"
                >
                  {sendUser.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] text-muted-foreground">
                  {isWithBot
                    ? "Atendido por PDV.IA. Você pode pedir atendimento humano a qualquer momento."
                    : isWaitingHuman
                      ? "Aguardando atendente humano."
                      : isWithAgent
                        ? "Falando com um atendente humano."
                        : ""}
                </div>
                <div className="flex flex-wrap gap-1">
                  {isWithBot && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => requestHuman.mutate()}
                      disabled={requestHuman.isPending}
                      className="h-7 text-xs"
                      data-testid="button-request-human"
                    >
                      <Headphones className="mr-1.5 h-3 w-3" />
                      Falar com atendente
                    </Button>
                  )}
                  {(isWithAgent || isWaitingHuman || isWithBot) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmResolveOpen(true)}
                      disabled={setStatus.isPending}
                      className="h-7 text-xs"
                      data-testid="button-mark-resolved"
                    >
                      <CheckCircle2 className="mr-1.5 h-3 w-3" />
                      Marcar como resolvido
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {isClosed && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                Este chamado está {ticket.status === "resolved" ? "resolvido" : "fechado"}. Se precisar de algo novo, abra um novo chamado.
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/suporte")}
                className="h-7 text-xs"
                data-testid="button-back-to-support"
              >
                <ArrowLeft className="mr-1.5 h-3 w-3" />
                Voltar ao Suporte
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de confirmação para marcar como resolvido */}
      <AlertDialog open={confirmResolveOpen} onOpenChange={setConfirmResolveOpen}>
        <AlertDialogContent data-testid="dialog-confirm-resolve">
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar este chamado como resolvido?</AlertDialogTitle>
            <AlertDialogDescription>
              Ao confirmar, o chamado será encerrado e <strong>não poderá ser reaberto</strong>.
              Se precisar de algo a mais sobre o assunto, será necessário abrir um novo chamado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-resolve">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmResolveOpen(false);
                setStatus.mutate("resolved");
              }}
              data-testid="button-confirm-resolve"
            >
              Sim, marcar como resolvido
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------- Bubble ----------
function MessageBubble({ m, customerAvatarUrl, customerName }: { m: SupportMessage; customerAvatarUrl?: string | null; customerName?: string | null }) {
  if (isSystemMessage(m)) {
    return (
      <div className="flex justify-center" data-testid={`msg-system-${m.id}`}>
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground">
          <Info className="h-3 w-3" />
          <span>{m.body}</span>
        </div>
      </div>
    );
  }

  const isCustomer = isCustomerMessage(m);
  const isBot = isBotMessage(m);
  const isAgent = isAgentMessage(m);

  const align = isCustomer ? "justify-end" : "justify-start";
  const bubbleClass = isCustomer
    ? "border-primary/30 bg-primary/10 rounded-br-sm"
    : isBot
      ? "border-violet-500/30 bg-violet-500/5 dark:bg-violet-500/10 rounded-bl-sm"
      : "border-success/30 bg-success/5 dark:bg-success/10 rounded-bl-sm";

  const label = isCustomer
    ? m.author_name ?? "Você"
    : isBot
      ? "PDV.IA"
      : isAgent
        ? `${m.author_name ?? "Atendente"} · Suporte`
        : m.author_name ?? "—";

  return (
    <div className={`flex items-end gap-2 ${align}`} data-testid={`msg-${m.author_type}-${m.id}`}>
      {!isCustomer && (
        <Avatar isBot={isBot} isAgent={isAgent} />
      )}
      <div className={`max-w-[85%] rounded-2xl border px-3 py-2 ${bubbleClass}`}>
        <div className="mb-0.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>{label}</span>
          <span className="font-normal normal-case text-muted-foreground/70">
            {formatTime(m.created_at)}
          </span>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
      </div>
      {isCustomer && (
        customerAvatarUrl ? (
          <img
            src={customerAvatarUrl}
            alt={customerName ?? "Você"}
            className="h-7 w-7 shrink-0 rounded-full border border-primary/40 object-cover"
          />
        ) : (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary text-[10px] font-semibold uppercase">
            {(customerName ?? m.author_name ?? "U").trim().charAt(0)}
          </div>
        )
      )}
    </div>
  );
}

function Avatar({ isBot, isAgent }: { isBot: boolean; isAgent: boolean }) {
  if (isBot) {
    return (
      <img
        src={pdvioAvatar}
        alt="PDV.IA"
        className="h-7 w-7 shrink-0 rounded-full border border-violet-500/40 object-cover"
      />
    );
  }
  if (isAgent) {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-success/40 bg-success/10 text-success">
        <Headphones className="h-3.5 w-3.5" />
      </div>
    );
  }
  return null;
}
