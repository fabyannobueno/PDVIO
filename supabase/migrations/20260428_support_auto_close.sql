-- =========================================
-- SUPORTE: encerramento automático por inatividade do cliente
-- Se o atendente humano respondeu e o cliente ficou 5 dias sem responder,
-- o chamado é encerrado automaticamente.
-- =========================================

-- 1) Habilita pg_cron (no Supabase Cloud, esta extensão deve ser ativada
--    pela UI: Database → Extensions → pg_cron. O CREATE EXTENSION abaixo
--    é idempotente: roda se a extensão já estiver disponível.)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2) Função que encerra os tickets parados
CREATE OR REPLACE FUNCTION public.support_auto_close_inactive_tickets(
  inactivity_days INTEGER DEFAULT 5
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  closed_count INTEGER := 0;
  cutoff TIMESTAMPTZ := NOW() - (inactivity_days || ' days')::INTERVAL;
BEGIN
  -- Seleciona tickets em "human_assigned" cuja última mensagem não-sistema
  -- foi de um atendente e ocorreu antes do cutoff (sem resposta posterior
  -- do cliente).
  FOR r IN
    SELECT t.id, t.company_id, last_msg.created_at AS last_agent_at
    FROM public.support_tickets t
    JOIN LATERAL (
      SELECT m.author_type, m.created_at
      FROM public.support_messages m
      WHERE m.ticket_id = t.id
        AND m.author_type <> 'system'
      ORDER BY m.created_at DESC
      LIMIT 1
    ) last_msg ON TRUE
    WHERE t.status = 'human_assigned'
      AND last_msg.author_type IN ('agent', 'support')
      AND last_msg.created_at < cutoff
  LOOP
    -- Mensagem de sistema explicando o encerramento
    INSERT INTO public.support_messages (
      ticket_id,
      author_id,
      author_name,
      author_type,
      body,
      metadata
    ) VALUES (
      r.id,
      NULL,
      'Sistema',
      'system',
      'Chamado encerrado automaticamente: passaram-se ' || inactivity_days
        || ' dias sem resposta do cliente após o último contato do atendente. '
        || 'Se ainda precisar de ajuda, abra um novo chamado.',
      jsonb_build_object(
        'auto_closed', true,
        'reason', 'user_inactivity_' || inactivity_days || 'd',
        'last_agent_at', r.last_agent_at
      )
    );

    -- Encerra o ticket
    UPDATE public.support_tickets
    SET status = 'closed',
        resolved_at = NOW()
    WHERE id = r.id;

    closed_count := closed_count + 1;
  END LOOP;

  RETURN closed_count;
END;
$$;

-- 3) Permissões
REVOKE ALL ON FUNCTION public.support_auto_close_inactive_tickets(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.support_auto_close_inactive_tickets(INTEGER) TO postgres, service_role;

-- 4) Agendamento via pg_cron: roda a cada 1 hora
--    Se o job já existir com esse nome, removemos antes para garantir idempotência.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.unschedule(jobid)
      FROM cron.job
      WHERE jobname = 'support_auto_close_inactive_tickets_hourly';

    PERFORM cron.schedule(
      'support_auto_close_inactive_tickets_hourly',
      '0 * * * *', -- a cada hora cheia
      $cron$ SELECT public.support_auto_close_inactive_tickets(5); $cron$
    );
  END IF;
END $$;
