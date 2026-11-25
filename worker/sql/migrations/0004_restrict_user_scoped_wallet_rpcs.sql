-- Remove inherited service_role execution from user-scoped payment intent/status RPCs.
-- These functions are intended for the signed-in user's authenticated JWT only.
revoke all on function public.create_wallet_topup_intent(bigint, text, text) from service_role;
revoke all on function public.get_wallet_topup_status(uuid) from service_role;
