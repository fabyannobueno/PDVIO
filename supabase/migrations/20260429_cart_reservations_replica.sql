-- Ensure realtime UPDATE/DELETE events on cart_reservations carry enough
-- column data for client-side filters (company_id=eq.X) to match.
ALTER TABLE public.cart_reservations REPLICA IDENTITY FULL;
