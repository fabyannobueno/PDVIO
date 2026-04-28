-- Reduce stale cart reservation TTL to 30 minutes.
-- A reservation that is not converted to a sale within 30 minutes of its
-- last update is considered abandoned and removed so stock returns to the pool.

CREATE OR REPLACE FUNCTION public.cleanup_stale_cart_reservations()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.cart_reservations
  WHERE updated_at < now() - INTERVAL '30 minutes';
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_stale_cart_reservations() TO authenticated;
