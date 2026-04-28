-- Enable Supabase Realtime for KDS-related tables.
ALTER TABLE public.comanda_items REPLICA IDENTITY FULL;
ALTER TABLE public.comandas REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.comanda_items;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.comandas;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
