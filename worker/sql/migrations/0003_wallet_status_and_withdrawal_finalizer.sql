-- Applied to the CenPaya Supabase project.
-- Installs the two missing RPCs used by worker/src/payments.ts.
-- The withdrawal finalizer accepts only short-lived Worker-signed JWTs carrying
-- app_metadata.cenpaya_payment_worker=true. Ordinary authenticated users cannot
-- finalize withdrawals, even though the RPC is granted to the authenticated role.

begin;

create or replace function public.get_wallet_topup_status(p_topup_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select jsonb_build_object(
    'id', id, 'provider', provider, 'amount', amount, 'currency_code', currency_code,
    'status', status,
    'provider_reference', case when transaction_id like 'pending:%' or transaction_id like 'initiating:%' then null else transaction_id end,
    'initiation_in_progress', transaction_id like 'initiating:%',
    'checkout_url', provider_checkout_url, 'created_at', created_at, 'completed_at', completed_at
  ) into v_result from public.wallet_topups where id = p_topup_id and user_id = v_uid;
  return v_result;
end;
$function$;

revoke all on function public.get_wallet_topup_status(uuid) from public, anon;
grant execute on function public.get_wallet_topup_status(uuid) to authenticated;

create or replace function public.finalize_withdrawal_from_gateway(
  p_withdrawal_id uuid, p_gateway_provider text, p_outcome text,
  p_gateway_reference text default null, p_failure_reason text default null
)
returns boolean
language plpgsql security definer
set search_path = public, pg_temp
as $function$
declare
  v_row public.user_withdrawals%rowtype;
  v_after bigint;
  v_today date := (now() at time zone 'Africa/Douala')::date;
begin
  if auth.role() <> 'authenticated'
     or coalesce(auth.jwt() -> 'app_metadata' ->> 'cenpaya_payment_worker', 'false') <> 'true' then
    raise exception 'payment worker only';
  end if;
  if p_outcome not in ('completed', 'failed') then raise exception 'invalid withdrawal outcome'; end if;

  select * into v_row from public.user_withdrawals where id = p_withdrawal_id for update;
  if not found or upper(coalesce(v_row.gateway_provider, '')) <> upper(p_gateway_provider) then return false; end if;
  if auth.uid() <> '00000000-0000-4000-8000-000000000001'::uuid and v_row.user_id <> auth.uid() then return false; end if;
  if v_row.status = p_outcome then
    return p_gateway_reference is null or v_row.gateway_reference = p_gateway_reference;
  end if;
  if v_row.status <> 'pending' then return false; end if;
  if p_gateway_reference is not null then
    if v_row.gateway_reference is not null
       and v_row.gateway_reference not like 'initiating:%'
       and v_row.gateway_reference <> p_gateway_reference then return false; end if;
  elsif v_row.gateway_reference is not null
        and v_row.gateway_reference <> 'initiating:' || v_row.id::text then return false;
  end if;

  if p_outcome = 'completed' then
    update public.user_withdrawals set status = 'completed',
      gateway_reference = coalesce(p_gateway_reference, gateway_reference),
      processed_at = now(), completed_at = now(), failure_reason = null
     where id = p_withdrawal_id;
    return true;
  end if;

  if v_row.source_bucket = 'referral' then
    update public.wallets set referral_earnings_available = referral_earnings_available + v_row.requested_amount,
      daily_withdrawn_total = case
        when (v_row.created_at at time zone 'Africa/Douala')::date = v_today and daily_withdrawn_reset_at = v_today
        then greatest(0, daily_withdrawn_total - v_row.requested_amount) else daily_withdrawn_total end,
      monthly_withdrawn_total = case
        when date_trunc('month', v_row.created_at at time zone 'Africa/Douala') = date_trunc('month', v_today::timestamp)
         and date_trunc('month', monthly_withdrawn_reset_at)::date = date_trunc('month', v_today)::date
        then greatest(0, monthly_withdrawn_total - v_row.requested_amount) else monthly_withdrawn_total end,
      updated_at = now()
     where user_id = v_row.user_id returning referral_earnings_available into v_after;
  else
    update public.wallets set available_funds = available_funds + v_row.requested_amount,
      daily_withdrawn_total = case
        when (v_row.created_at at time zone 'Africa/Douala')::date = v_today and daily_withdrawn_reset_at = v_today
        then greatest(0, daily_withdrawn_total - v_row.requested_amount) else daily_withdrawn_total end,
      monthly_withdrawn_total = case
        when date_trunc('month', v_row.created_at at time zone 'Africa/Douala') = date_trunc('month', v_today::timestamp)
         and date_trunc('month', monthly_withdrawn_reset_at)::date = date_trunc('month', v_today)::date
        then greatest(0, monthly_withdrawn_total - v_row.requested_amount) else monthly_withdrawn_total end,
      updated_at = now()
     where user_id = v_row.user_id returning available_funds into v_after;
  end if;

  if v_after is null then raise exception 'wallet not found while refunding failed withdrawal'; end if;
  insert into public.wallet_historical_ledger(
    user_id, currency_code, entry_type, amount_mutated,
    running_balance_snapshot, associated_reference_id, description
  ) values (
    v_row.user_id, v_row.currency_code, 'REVERSAL', v_row.requested_amount,
    v_after, v_row.id, 'Failed withdrawal returned to wallet'
  );

  update public.user_withdrawals set status = 'failed',
    gateway_reference = p_gateway_reference,
    failure_reason = left(coalesce(p_failure_reason, 'Gateway payout failed'), 500),
    processed_at = now(), completed_at = null
   where id = p_withdrawal_id;
  return true;
end;
$function$;

revoke all on function public.finalize_withdrawal_from_gateway(uuid, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_withdrawal_from_gateway(uuid, text, text, text, text)
  to authenticated;

commit;
