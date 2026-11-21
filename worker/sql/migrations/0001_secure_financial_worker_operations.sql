-- CenPaya Supabase Worker financial operations.
-- Review and apply to the intended Supabase project before enabling payments.
-- No Supabase Auth flows, user creation, or existing financial data are changed.

begin;

alter table public.wallet_topups
  add column if not exists idempotency_key text,
  add column if not exists provider_checkout_url text;

alter table public.user_withdrawals
  add column if not exists idempotency_key text,
  add column if not exists gateway_provider text;

create unique index if not exists wallet_topups_user_idempotency_key_uidx
  on public.wallet_topups(user_id, idempotency_key) where idempotency_key is not null;
create unique index if not exists user_withdrawals_user_idempotency_key_uidx
  on public.user_withdrawals(user_id, idempotency_key) where idempotency_key is not null;

create or replace function public.worker_upsert_vault_secret(
  p_provider_id uuid, p_environment text, p_key_name text, p_secret_value text
)
returns void
language plpgsql security definer
set search_path = public, vault, pg_temp
as $function$
declare
  v_secret_id uuid;
  v_secret_name text;
begin
  if p_secret_value is null or length(p_secret_value) = 0 then return; end if;
  v_secret_name := 'cenpaya:' || p_provider_id::text || ':' || p_environment || ':' || p_key_name;

  select secret_id into v_secret_id from public.platform_api_vault
   where provider_id = p_provider_id and environment = p_environment and key_name = p_key_name
   for update;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_secret_value, v_secret_name, 'CenPaya payment gateway credential', null);
  else
    perform vault.update_secret(v_secret_id, p_secret_value, v_secret_name, 'CenPaya payment gateway credential', null);
  end if;

  insert into public.platform_api_vault(provider_id, environment, key_name, secret_id, updated_at)
  values (p_provider_id, p_environment, p_key_name, v_secret_id, now())
  on conflict (provider_id, environment, key_name)
  do update set secret_id = excluded.secret_id, updated_at = now();
end;
$function$;

revoke all on function public.worker_upsert_vault_secret(uuid, text, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.admin_set_gateway_credentials(
  p_provider_name text,
  p_api_public_key text,
  p_api_secret_key text,
  p_webhook_secret text default null,
  p_environment text default 'production'
)
returns jsonb
language plpgsql security definer
set search_path = public, vault, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_provider_id uuid;
begin
  if v_actor is null or not public.is_super_admin() then
    return jsonb_build_object('ok', false, 'error', 'only super_admin can configure credentials');
  end if;
  if p_environment not in ('sandbox', 'production') then
    return jsonb_build_object('ok', false, 'error', 'invalid environment');
  end if;
  if coalesce(length(trim(p_api_public_key)), 0) = 0 or coalesce(length(trim(p_api_secret_key)), 0) = 0 then
    return jsonb_build_object('ok', false, 'error', 'provider credentials are required');
  end if;

  select id into v_provider_id from public.system_providers
   where upper(provider_name) = upper(p_provider_name) and provider_type = 'PAYMENT_GATEWAY';
  if v_provider_id is null then return jsonb_build_object('ok', false, 'error', 'unknown provider'); end if;

  perform public.worker_upsert_vault_secret(v_provider_id, p_environment, 'api_public_key', p_api_public_key);
  perform public.worker_upsert_vault_secret(v_provider_id, p_environment, 'api_secret_key', p_api_secret_key);
  if coalesce(length(trim(p_webhook_secret)), 0) > 0 then
    perform public.worker_upsert_vault_secret(v_provider_id, p_environment, 'webhook_secret', p_webhook_secret);
  end if;

  insert into public.admin_audit_log(actor_id, action, target_table, target_id, new_value)
  values (
    v_actor, 'set_gateway_credentials', 'platform_api_vault', v_provider_id,
    jsonb_build_object('provider', upper(p_provider_name), 'environment', p_environment,
      'public_key_last4', right(p_api_public_key, 4), 'secret_rotated', true,
      'webhook_secret_configured', coalesce(length(trim(p_webhook_secret)), 0) > 0)
  );
  return jsonb_build_object('ok', true);
end;
$function$;

create or replace function public.admin_remove_gateway_credentials(
  p_provider_name text, p_environment text default 'production'
)
returns jsonb
language plpgsql security definer
set search_path = public, vault, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_provider_id uuid;
  v_secret record;
begin
  if v_actor is null or not public.is_super_admin() then
    return jsonb_build_object('ok', false, 'error', 'only super_admin can remove credentials');
  end if;
  if p_environment not in ('sandbox', 'production') then
    return jsonb_build_object('ok', false, 'error', 'invalid environment');
  end if;

  select id into v_provider_id from public.system_providers
   where upper(provider_name) = upper(p_provider_name) and provider_type = 'PAYMENT_GATEWAY';
  if v_provider_id is null then return jsonb_build_object('ok', false, 'error', 'unknown provider'); end if;

  -- This project has Vault create/update functions but no delete_secret function.
  -- Overwrite values with empty strings before removing their lookup rows.
  for v_secret in
    select secret_id, key_name from public.platform_api_vault
     where provider_id = v_provider_id and environment = p_environment
  loop
    perform vault.update_secret(v_secret.secret_id, '',
      'revoked:' || v_provider_id::text || ':' || v_secret.key_name,
      'Revoked CenPaya payment credential', null);
  end loop;

  delete from public.platform_api_vault where provider_id = v_provider_id and environment = p_environment;
  insert into public.admin_audit_log(actor_id, action, target_table, target_id, new_value)
  values (v_actor, 'remove_gateway_credentials', 'platform_api_vault', v_provider_id,
    jsonb_build_object('provider', upper(p_provider_name), 'environment', p_environment));
  return jsonb_build_object('ok', true);
end;
$function$;

create or replace function public.worker_get_gateway_credentials(
  p_provider_name text, p_environment text default 'production'
)
returns jsonb
language plpgsql stable security definer
set search_path = public, vault, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'service role only'; end if;
  if p_environment not in ('sandbox', 'production') then raise exception 'invalid environment'; end if;

  select jsonb_object_agg(v.key_name, s.decrypted_secret) into v_result
    from public.platform_api_vault v
    join public.system_providers p on p.id = v.provider_id
    join vault.decrypted_secrets s on s.id = v.secret_id
   where upper(p.provider_name) = upper(p_provider_name)
     and p.provider_type = 'PAYMENT_GATEWAY'
     and v.environment = p_environment;
  return v_result;
end;
$function$;

create or replace function public.create_wallet_topup_intent(
  p_amount bigint, p_provider text, p_idempotency_key text
)
returns uuid
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_existing uuid;
  v_id uuid := gen_random_uuid();
  v_banned boolean;
  v_deactivated boolean;
  v_provider_active boolean;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_amount is null or p_amount < 100 then raise exception 'minimum top-up amount is 100 XAF'; end if;
  if upper(p_provider) not in ('FAPSHI', 'CAMPAY') then raise exception 'unsupported payment provider'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 8 or length(p_idempotency_key) > 128 then
    raise exception 'invalid idempotency key';
  end if;

  select is_banned, is_deactivated into v_banned, v_deactivated
    from public.account_controls where user_id = v_uid for share;
  if not found or coalesce(v_banned, true) or coalesce(v_deactivated, true) then
    raise exception 'account cannot make payments';
  end if;

  select is_active into v_provider_active from public.system_providers
   where upper(provider_name) = upper(p_provider) and provider_type = 'PAYMENT_GATEWAY';
  if coalesce(v_provider_active, false) is not true then raise exception 'payment provider is not active'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':topup:' || p_idempotency_key, 0));
  select id into v_existing from public.wallet_topups
   where user_id = v_uid and idempotency_key = p_idempotency_key;
  if v_existing is not null then return v_existing; end if;

  insert into public.wallet_topups(id, user_id, provider, transaction_id, amount, currency_code, status, idempotency_key)
  values (v_id, v_uid, upper(p_provider), 'pending:' || v_id::text, p_amount, 'XAF', 'pending', p_idempotency_key);
  return v_id;
end;
$function$;

create or replace function public.claim_wallet_topup_initiation(p_topup_id uuid)
returns boolean
language plpgsql security definer
set search_path = public
as $function$
begin
  if auth.role() <> 'service_role' then raise exception 'service role only'; end if;
  update public.wallet_topups
     set transaction_id = 'initiating:' || id::text
   where id = p_topup_id and status = 'pending'
     and transaction_id = 'pending:' || id::text;
  return found;
end;
$function$;

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

create or replace function public.record_wallet_topup_provider_reference(
  p_topup_id uuid, p_provider text, p_provider_transaction_id text, p_checkout_url text default null
)
returns boolean
language plpgsql security definer
set search_path = public
as $function$
declare
  v_row public.wallet_topups%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'service role only'; end if;
  if p_provider_transaction_id is null or length(p_provider_transaction_id) = 0 or length(p_provider_transaction_id) > 200 then
    raise exception 'invalid provider transaction reference';
  end if;

  select * into v_row from public.wallet_topups where id = p_topup_id for update;
  if not found or upper(v_row.provider) <> upper(p_provider) then return false; end if;
  if v_row.status <> 'pending' then return v_row.transaction_id = p_provider_transaction_id; end if;
  if v_row.transaction_id not like 'pending:%'
     and v_row.transaction_id not like 'initiating:%'
     and v_row.transaction_id <> p_provider_transaction_id then
    return false;
  end if;

  update public.wallet_topups set transaction_id = p_provider_transaction_id,
    provider_checkout_url = p_checkout_url where id = p_topup_id;
  return true;
end;
$function$;

create or replace function public.settle_wallet_topup_from_gateway(
  p_topup_id uuid, p_provider text, p_provider_transaction_id text, p_amount numeric, p_currency_code text
)
returns boolean
language plpgsql security definer
set search_path = public
as $function$
declare
  v_row public.wallet_topups%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'service role only'; end if;
  select * into v_row from public.wallet_topups where id = p_topup_id for update;
  if not found or upper(v_row.provider) <> upper(p_provider)
     or v_row.transaction_id <> p_provider_transaction_id
     or v_row.amount <> p_amount or upper(v_row.currency_code) <> upper(p_currency_code) then
    return false;
  end if;
  if v_row.status = 'completed' then return true; end if;
  if v_row.status <> 'pending' then return false; end if;
  return public.credit_wallet_topup(p_topup_id);
end;
$function$;

create or replace function public.fail_wallet_topup_from_gateway(
  p_topup_id uuid, p_provider text, p_provider_transaction_id text
)
returns boolean
language plpgsql security definer
set search_path = public
as $function$
declare
  v_row public.wallet_topups%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'service role only'; end if;
  select * into v_row from public.wallet_topups where id = p_topup_id for update;
  if not found or upper(v_row.provider) <> upper(p_provider)
     or v_row.transaction_id <> p_provider_transaction_id then return false; end if;
  if v_row.status = 'failed' then return true; end if;
  if v_row.status <> 'pending' then return false; end if;
  update public.wallet_topups set status = 'failed' where id = p_topup_id;
  return true;
end;
$function$;

create or replace function public.create_withdrawal_idempotent(
  p_user_id uuid, p_amount bigint, p_source_bucket text, p_destination_phone text,
  p_destination_provider text, p_gateway_provider text, p_idempotency_key text
)
returns uuid
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_existing uuid;
  v_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'service role only'; end if;
  if p_user_id is null or p_idempotency_key is null
     or length(p_idempotency_key) < 8 or length(p_idempotency_key) > 128
     or p_gateway_provider is null or upper(p_gateway_provider) not in ('FAPSHI', 'CAMPAY')
     or p_destination_provider is null or lower(p_destination_provider) not in ('mtn_momo', 'orange_money') then
    raise exception 'invalid withdrawal idempotency request';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':withdrawal:' || p_idempotency_key, 0));
  select id into v_existing from public.user_withdrawals
   where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if v_existing is not null then return v_existing; end if;

  v_id := public.create_withdrawal(p_user_id, p_amount, p_source_bucket, p_destination_phone, p_destination_provider);
  update public.user_withdrawals set idempotency_key = p_idempotency_key,
    gateway_provider = upper(p_gateway_provider) where id = v_id;
  return v_id;
end;
$function$;

create or replace function public.claim_withdrawal_provider_payout(p_withdrawal_id uuid, p_gateway_provider text)
returns boolean
language plpgsql security definer
set search_path = public
as $function$
begin
  if auth.role() <> 'service_role' then raise exception 'service role only'; end if;
  update public.user_withdrawals set gateway_reference = 'initiating:' || id::text
   where id = p_withdrawal_id and status = 'pending'
     and upper(gateway_provider) = upper(p_gateway_provider)
     and gateway_reference is null;
  return found;
end;
$function$;

create or replace function public.record_withdrawal_provider_reference(
  p_withdrawal_id uuid, p_gateway_provider text, p_gateway_reference text
)
returns boolean
language plpgsql security definer
set search_path = public
as $function$
declare
  v_row public.user_withdrawals%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'service role only'; end if;
  if p_gateway_reference is null or length(p_gateway_reference) = 0 or length(p_gateway_reference) > 200 then
    raise exception 'invalid gateway reference';
  end if;
  select * into v_row from public.user_withdrawals where id = p_withdrawal_id for update;
  if not found or upper(coalesce(v_row.gateway_provider, '')) <> upper(p_gateway_provider) then return false; end if;
  if v_row.status <> 'pending' then return v_row.gateway_reference = p_gateway_reference; end if;
  if v_row.gateway_reference is not null
     and v_row.gateway_reference not like 'initiating:%'
     and v_row.gateway_reference <> p_gateway_reference then
    return false;
  end if;
  update public.user_withdrawals set gateway_reference = p_gateway_reference, processed_at = now()
   where id = p_withdrawal_id;
  return true;
end;
$function$;

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
  if auth.role() <> 'service_role' then raise exception 'service role only'; end if;
  if p_outcome not in ('completed', 'failed') then raise exception 'invalid withdrawal outcome'; end if;

  select * into v_row from public.user_withdrawals where id = p_withdrawal_id for update;
  if not found or upper(coalesce(v_row.gateway_provider, '')) <> upper(p_gateway_provider) then return false; end if;
  if v_row.status = p_outcome then return true; end if;
  if v_row.status <> 'pending' then return false; end if;

  if p_outcome = 'completed' then
    update public.user_withdrawals set status = 'completed',
      gateway_reference = coalesce(p_gateway_reference, gateway_reference),
      processed_at = now(), completed_at = now(), failure_reason = null
     where id = p_withdrawal_id;
    return true;
  end if;

  if v_row.source_bucket = 'referral' then
    update public.wallets set referral_earnings_available = referral_earnings_available + v_row.requested_amount,
      daily_withdrawn_total = case when daily_withdrawn_reset_at = v_today
        then greatest(0, daily_withdrawn_total - v_row.requested_amount) else daily_withdrawn_total end,
      monthly_withdrawn_total = case
        when date_trunc('month', monthly_withdrawn_reset_at)::date = date_trunc('month', v_today)::date
        then greatest(0, monthly_withdrawn_total - v_row.requested_amount) else monthly_withdrawn_total end,
      updated_at = now()
     where user_id = v_row.user_id returning referral_earnings_available into v_after;
  else
    update public.wallets set available_funds = available_funds + v_row.requested_amount,
      daily_withdrawn_total = case when daily_withdrawn_reset_at = v_today
        then greatest(0, daily_withdrawn_total - v_row.requested_amount) else daily_withdrawn_total end,
      monthly_withdrawn_total = case
        when date_trunc('month', monthly_withdrawn_reset_at)::date = date_trunc('month', v_today)::date
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

revoke all on function public.worker_upsert_vault_secret(uuid, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.worker_get_gateway_credentials(text, text)
  from public, anon, authenticated;
grant execute on function public.worker_get_gateway_credentials(text, text) to service_role;

revoke all on function public.create_wallet_topup_intent(bigint, text, text) from public, anon;
grant execute on function public.create_wallet_topup_intent(bigint, text, text) to authenticated;
revoke all on function public.claim_wallet_topup_initiation(uuid) from public, anon, authenticated;
grant execute on function public.claim_wallet_topup_initiation(uuid) to service_role;
revoke all on function public.get_wallet_topup_status(uuid) from public, anon;
grant execute on function public.get_wallet_topup_status(uuid) to authenticated;
revoke all on function public.record_wallet_topup_provider_reference(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_wallet_topup_provider_reference(uuid, text, text, text) to service_role;
revoke all on function public.settle_wallet_topup_from_gateway(uuid, text, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.settle_wallet_topup_from_gateway(uuid, text, text, numeric, text) to service_role;
revoke all on function public.fail_wallet_topup_from_gateway(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.fail_wallet_topup_from_gateway(uuid, text, text) to service_role;

revoke all on function public.create_withdrawal_idempotent(uuid, bigint, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_withdrawal_idempotent(uuid, bigint, text, text, text, text, text) to service_role;
revoke all on function public.claim_withdrawal_provider_payout(uuid, text)
  from public, anon, authenticated;
grant execute on function public.claim_withdrawal_provider_payout(uuid, text) to service_role;
revoke all on function public.record_withdrawal_provider_reference(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.record_withdrawal_provider_reference(uuid, text, text) to service_role;
revoke all on function public.finalize_withdrawal_from_gateway(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.finalize_withdrawal_from_gateway(uuid, text, text, text, text) to service_role;

revoke all on function public.admin_set_gateway_credentials(text, text, text, text, text) from public, anon;
grant execute on function public.admin_set_gateway_credentials(text, text, text, text, text) to authenticated;
revoke all on function public.admin_remove_gateway_credentials(text, text) from public, anon;
grant execute on function public.admin_remove_gateway_credentials(text, text) to authenticated;

commit;
