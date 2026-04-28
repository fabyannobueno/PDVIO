import { supabase } from "@/integrations/supabase/client";

export type AuditAction =
  | "sale.cancelled"
  | "sale.refunded"
  | "sale.discount_applied"
  | "cash.opened"
  | "cash.closed"
  | "cash.movement"
  | "staff.created"
  | "staff.updated"
  | "staff.deleted"
  | "company.updated"
  | "product.deleted";

interface LogParams {
  companyId: string;
  action: AuditAction;
  entityType?: string | null;
  entityId?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown>;
  staffId?: string | null;
  staffName?: string | null;
}

/**
 * Best-effort audit log writer. Failures are swallowed so user-facing flows
 * are never blocked by logging issues, but errors are surfaced to the console.
 */
export async function logAudit(params: LogParams): Promise<void> {
  try {
    const { error } = await (supabase as any).rpc("log_audit_event", {
      _company_id: params.companyId,
      _action: params.action,
      _entity_type: params.entityType ?? null,
      _entity_id: params.entityId ?? null,
      _description: params.description ?? null,
      _metadata: params.metadata ?? {},
      _staff_id: params.staffId ?? null,
      _staff_name: params.staffName ?? null,
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.warn("[audit] failed:", error.message);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[audit] exception:", e);
  }
}

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  "sale.cancelled": "Cancelou venda",
  "sale.refunded": "Registrou devolução",
  "sale.discount_applied": "Aplicou desconto",
  "cash.opened": "Abriu caixa",
  "cash.closed": "Fechou caixa",
  "cash.movement": "Movimentação de caixa",
  "staff.created": "Cadastrou operador",
  "staff.updated": "Atualizou operador",
  "staff.deleted": "Excluiu operador",
  "company.updated": "Atualizou empresa",
  "product.deleted": "Excluiu produto",
};
