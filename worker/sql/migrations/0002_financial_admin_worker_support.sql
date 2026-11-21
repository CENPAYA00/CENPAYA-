-- CenPaya financial configuration and admin Worker support.
-- Apply after 0001_secure_financial_worker_operations.sql.
-- This deliberately excludes general app settings, country metadata, SMS/email
-- providers, and D1-owned identity/role management.

begin;

create table if not exists public.financial_settings (
  key text primary key,
  value text not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.financial_settings enable row level security;
revoke all on public.financial_settings from public, anon, authenticated, service_role, cenpaya_payment_worker;

create or replace function public.setting(k text)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select coalesce((
    select fs.value::numeric
      from public.financial_settings fs
     where fs.key = k
       and k in (
         'fee_pct_member', 'fee_fixed_member',
         'fee_pct_non_member', 'fee_fixed_non_member',
         'referral_l1_points', 'membership_fee', 'subscription_fee'
       )
     limit 1
  ), 0.0);
$function$;

revoke all on function public.setting(text) from public;
grant execute on function public.setting(text) to anon, authenticated;

create or replace function public.update_my_payment_profile(
  p_momo_number text,
  p_momo_provider text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not authenticated'); end if;
  if p_momo_provider is null or lower(p_momo_provider) not in ('mtn_momo', 'orange_money') then
    return jsonb_build_object('ok', false, 'error', 'unsupported mobile money provider');
  end if;
  if p_momo_number is null or p_momo_number !~ '^\\+?[0-9]{8,15}p_key text, p_value text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_old text;
  v_numeric numeric;
begin
  if v_actor is null then return jsonb_build_object('ok', false, 'error', 'not authenticated'); end if;
  if not (public.is_super_admin() or public.is_owner()) then
    return jsonb_build_object('ok', false, 'error', 'only financial staff can change financial settings');
  end if;
  if p_key is null or p_key not in (
    'fee_pct_member', 'fee_fixed_member',
    'fee_pct_non_member', 'fee_fixed_non_member',
    'referral_l1_points', 'membership_fee', 'subscription_fee'
  ) then
    return jsonb_build_object('ok', false, 'error', 'setting is not a financial setting');
  end if;

  if p_value is null or length(trim(p_value)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'setting value is required');
  end if;
  begin
    v_numeric := trim(p_value)::numeric;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'setting value must be numeric');
  end;
  if v_numeric < 0 then return jsonb_build_object('ok', false, 'error', 'setting value cannot be negative'); end if;
  if p_key in ('fee_pct_member', 'fee_pct_non_member') and v_numeric > 100 then
    return jsonb_build_object('ok', false, 'error', 'fee percentage cannot exceed 100');
  end if;

  select value into v_old from public.financial_settings where key = p_key for update;
  insert into public.financial_settings(key, value, updated_by, updated_at)
  values (p_key, v_numeric::text, v_actor, now())
  on conflict (key) do update
    set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();

  insert into public.admin_audit_log(actor_id, action, target_table, new_value, old_value)
  values (
    v_actor, 'set_financial_setting', 'financial_settings',
    jsonb_build_object('key', p_key, 'value', v_numeric),
    case when v_old is null then null else jsonb_build_object('key', p_key, 'value', v_old) end
  );
  return jsonb_build_object('ok', true, 'key', p_key, 'value', v_numeric);
end;
$function$;

revoke all on function public.admin_set_app_setting(text, text) from public, anon;
grant execute on function public.admin_set_app_setting(text, text) to authenticated;

create or replace function public.admin_list_financial_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if not (public.is_super_admin() or public.is_owner()) then
    return jsonb_build_object('ok', false, 'error', 'only financial staff');
  end if;
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_result
    from public.financial_settings
   where key in (
     'fee_pct_member', 'fee_fixed_member',
     'fee_pct_non_member', 'fee_fixed_non_member',
     'referral_l1_points', 'membership_fee', 'subscription_fee'
   );
  return jsonb_build_object('ok', true, 'settings', v_result);
end;
$function$;

revoke all on function public.admin_list_financial_settings() from public, anon;
grant execute on function public.admin_list_financial_settings() to authenticated;

create or replace function public.admin_list_payment_gateways()
returns table(
  id uuid,
  provider_name text,
  display_name text,
  provider_type text,
  is_active boolean,
  priority integer,
  has_key boolean,
  environment text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if not public.is_super_admin() then raise exception 'only super_admin can view payment gateway configuration'; end if;
  return query
  select
    sp.id, sp.provider_name, sp.display_name, sp.provider_type, sp.is_active, sp.priority,
    exists(
      select 1 from public.platform_api_vault v
       where v.provider_id = sp.id and v.environment = 'production'
         and v.key_name = 'api_secret_key'
    ) as has_key,
    (select v.environment from public.platform_api_vault v
      where v.provider_id = sp.id order by v.updated_at desc limit 1) as environment,
    (select max(v.updated_at) from public.platform_api_vault v where v.provider_id = sp.id) as updated_at
  from public.system_providers sp
  where sp.provider_type = 'PAYMENT_GATEWAY'
  order by sp.priority, sp.provider_name;
end;
$function$;

revoke all on function public.admin_list_payment_gateways() from public, anon;
grant execute on function public.admin_list_payment_gateways() to authenticated;

create or replace function public.admin_set_payment_gateway_active(
  p_provider_name text,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_old boolean;
begin
  if v_actor is null or not public.is_super_admin() then
    return jsonb_build_object('ok', false, 'error', 'only super_admin can toggle payment gateways');
  end if;
  select is_active into v_old from public.system_providers
   where upper(provider_name) = upper(p_provider_name)
     and provider_type = 'PAYMENT_GATEWAY'
   for update;
  if v_old is null then return jsonb_build_object('ok', false, 'error', 'payment gateway not found'); end if;
  update public.system_providers set is_active = p_active, updated_at = now()
   where upper(provider_name) = upper(p_provider_name)
     and provider_type = 'PAYMENT_GATEWAY';
  insert into public.admin_audit_log(actor_id, action, target_table, old_value, new_value)
  values (
    v_actor, 'set_payment_gateway_active', 'system_providers',
    jsonb_build_object('provider', upper(p_provider_name), 'is_active', v_old),
    jsonb_build_object('provider', upper(p_provider_name), 'is_active', p_active)
  );
  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.admin_set_payment_gateway_active(text, boolean) from public, anon;
grant execute on function public.admin_set_payment_gateway_active(text, boolean) to authenticated;

create or replace function public.admin_set_membership_exempt(
  p_target_user_id uuid,
  p_is_exempt boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_old boolean;
  v_paid boolean;
begin
  if v_actor is null or not (public.is_super_admin() or public.is_owner()) then
    return jsonb_build_object('ok', false, 'error', 'only financial staff can change membership exemption');
  end if;
  select is_membership_exempt, is_subscribed into v_old, v_paid
    from public.users where id = p_target_user_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'user not found'); end if;
  if coalesce(v_paid, false) then
    return jsonb_build_object('ok', false, 'error', 'paid membership cannot be overridden here');
  end if;
  update public.users set is_membership_exempt = p_is_exempt where id = p_target_user_id;
  insert into public.admin_audit_log(actor_id, action, target_table, target_id, old_value, new_value)
  values (
    v_actor, 'set_membership_exemption', 'users', p_target_user_id,
    jsonb_build_object('is_membership_exempt', v_old),
    jsonb_build_object('is_membership_exempt', p_is_exempt)
  );
  return jsonb_build_object('ok', true, 'is_membership_exempt', p_is_exempt);
end;
$function$;

revoke all on function public.admin_set_membership_exempt(uuid, boolean) from public, anon;
grant execute on function public.admin_set_membership_exempt(uuid, boolean) to authenticated;

create or replace function public.admin_dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_users bigint;
  v_listings bigint;
  v_orders bigint;
  v_gains numeric;
  v_circulation jsonb;
begin
  if not (public.is_super_admin() or public.is_owner()) then
    return jsonb_build_object('ok', false, 'error', 'only financial staff');
  end if;
  select count(*) into v_users from public.users;
  select count(*) into v_listings from public.listings;
  select count(*) into v_orders from public.orders;
  select coalesce(sum(amount_earned), 0) into v_gains from public.system_gains;
  v_circulation := public.admin_money_circulation_full();
  return jsonb_build_object(
    'ok', true,
    'total_users', v_users,
    'total_listings', v_listings,
    'total_orders', v_orders,
    'platform_gains', v_gains,
    'circulation', v_circulation
  );
end;
$function$;

revoke all on function public.admin_dashboard_summary() from public, anon;
grant execute on function public.admin_dashboard_summary() to authenticated;

create or replace function public.worker_resolve_payment_gateway(
  p_country_iso text,
  p_payment_method text,
  p_environment text default 'production',
  p_preferred_provider text default null
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_provider text;
begin
  if auth.role() <> 'cenpaya_payment_worker' then raise exception 'payment worker role only'; end if;
  if upper(coalesce(p_country_iso, 'CM')) <> 'CM' then return null; end if;
  if p_payment_method is null or lower(p_payment_method) not in ('mtn_momo', 'orange_money') then return null; end if;
  if p_environment is null or p_environment not in ('sandbox', 'production') then raise exception 'invalid environment'; end if;
  if p_preferred_provider is not null and upper(p_preferred_provider) not in ('FAPSHI', 'CAMPAY') then return null; end if;

  select upper(sp.provider_name) into v_provider
    from public.system_providers sp
   where sp.provider_type = 'PAYMENT_GATEWAY'
     and sp.is_active = true
     and upper(sp.provider_name) in ('FAPSHI', 'CAMPAY')
     and (p_preferred_provider is null or upper(sp.provider_name) = upper(p_preferred_provider))
     and exists (
       select 1 from public.platform_api_vault v
        where v.provider_id = sp.id and v.environment = p_environment
          and v.key_name = 'api_secret_key'
     )
     and (
       upper(sp.provider_name) <> 'FAPSHI'
       or exists (
         select 1 from public.platform_api_vault v
          where v.provider_id = sp.id and v.environment = p_environment
            and v.key_name = 'api_public_key'
       )
     )
   order by sp.priority, sp.provider_name
   limit 1;
  return v_provider;
end;
$function$;

revoke all on function public.worker_resolve_payment_gateway(text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.worker_resolve_payment_gateway(text, text, text, text)
  to cenpaya_payment_worker;

create or replace function public.create_admin_withdrawal_idempotent(
  p_user_id uuid,
  p_amount bigint,
  p_destination_phone text,
  p_destination_provider text,
  p_gateway_provider text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_existing uuid;
  v_id uuid;
begin
  if auth.role() <> 'cenpaya_payment_worker' then raise exception 'payment worker role only'; end if;
  if auth.uid() is distinct from p_user_id
     or not (public.is_super_admin() or public.is_owner()) then
    raise exception 'financial admin authorization required';
  end if;
  if p_amount is null or p_amount < 1000
     or p_idempotency_key is null or length(p_idempotency_key) < 8 or length(p_idempotency_key) > 128
     or p_gateway_provider is null or upper(p_gateway_provider) not in ('FAPSHI', 'CAMPAY')
     or p_destination_provider is null or lower(p_destination_provider) not in ('mtn_momo', 'orange_money') then
    raise exception 'invalid admin withdrawal request';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':admin-withdrawal:' || p_idempotency_key, 0));
  select id into v_existing from public.user_withdrawals
   where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if v_existing is not null then return v_existing; end if;

  v_id := public.create_withdrawal(p_user_id, p_amount, 'available', p_destination_phone, p_destination_provider);
  update public.user_withdrawals set idempotency_key = p_idempotency_key,
    gateway_provider = upper(p_gateway_provider) where id = v_id;
  return v_id;
end;
$function$;

revoke all on function public.create_admin_withdrawal_idempotent(uuid, bigint, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_admin_withdrawal_idempotent(uuid, bigint, text, text, text, text)
  to cenpaya_payment_worker;

commit;
 then
    return jsonb_build_object('ok', false, 'error', 'invalid mobile money number');
  end if;
  update public.users set momo_number = p_momo_number, momo_provider = lower(p_momo_provider)
   where id = v_uid;
  if not found then return jsonb_build_object('ok', false, 'error', 'user not found'); end if;
  return jsonb_build_object('ok', true, 'momo_number', p_momo_number, 'momo_provider', lower(p_momo_provider));
end;
$function$;

revoke all on function public.update_my_payment_profile(text, text) from public, anon;
grant execute on function public.update_my_payment_profile(text, text) to authenticated;

create or replace function public.admin_set_app_setting(p_key text, p_value text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_old text;
  v_numeric numeric;
begin
  if v_actor is null then return jsonb_build_object('ok', false, 'error', 'not authenticated'); end if;
  if not (public.is_super_admin() or public.is_owner()) then
    return jsonb_build_object('ok', false, 'error', 'only financial staff can change financial settings');
  end if;
  if p_key is null or p_key not in (
    'fee_pct_member', 'fee_fixed_member',
    'fee_pct_non_member', 'fee_fixed_non_member',
    'referral_l1_points', 'membership_fee', 'subscription_fee'
  ) then
    return jsonb_build_object('ok', false, 'error', 'setting is not a financial setting');
  end if;

  if p_value is null or length(trim(p_value)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'setting value is required');
  end if;
  begin
    v_numeric := trim(p_value)::numeric;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'setting value must be numeric');
  end;
  if v_numeric < 0 then return jsonb_build_object('ok', false, 'error', 'setting value cannot be negative'); end if;
  if p_key in ('fee_pct_member', 'fee_pct_non_member') and v_numeric > 100 then
    return jsonb_build_object('ok', false, 'error', 'fee percentage cannot exceed 100');
  end if;

  select value into v_old from public.financial_settings where key = p_key for update;
  insert into public.financial_settings(key, value, updated_by, updated_at)
  values (p_key, v_numeric::text, v_actor, now())
  on conflict (key) do update
    set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();

  insert into public.admin_audit_log(actor_id, action, target_table, new_value, old_value)
  values (
    v_actor, 'set_financial_setting', 'financial_settings',
    jsonb_build_object('key', p_key, 'value', v_numeric),
    case when v_old is null then null else jsonb_build_object('key', p_key, 'value', v_old) end
  );
  return jsonb_build_object('ok', true, 'key', p_key, 'value', v_numeric);
end;
$function$;

revoke all on function public.admin_set_app_setting(text, text) from public, anon;
grant execute on function public.admin_set_app_setting(text, text) to authenticated;

create or replace function public.admin_list_financial_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if not (public.is_super_admin() or public.is_owner()) then
    return jsonb_build_object('ok', false, 'error', 'only financial staff');
  end if;
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_result
    from public.financial_settings
   where key in (
     'fee_pct_member', 'fee_fixed_member',
     'fee_pct_non_member', 'fee_fixed_non_member',
     'referral_l1_points', 'membership_fee', 'subscription_fee'
   );
  return jsonb_build_object('ok', true, 'settings', v_result);
end;
$function$;

revoke all on function public.admin_list_financial_settings() from public, anon;
grant execute on function public.admin_list_financial_settings() to authenticated;

create or replace function public.admin_list_payment_gateways()
returns table(
  id uuid,
  provider_name text,
  display_name text,
  provider_type text,
  is_active boolean,
  priority integer,
  has_key boolean,
  environment text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if not public.is_super_admin() then raise exception 'only super_admin can view payment gateway configuration'; end if;
  return query
  select
    sp.id, sp.provider_name, sp.display_name, sp.provider_type, sp.is_active, sp.priority,
    exists(
      select 1 from public.platform_api_vault v
       where v.provider_id = sp.id and v.environment = 'production'
         and v.key_name = 'api_secret_key'
    ) as has_key,
    (select v.environment from public.platform_api_vault v
      where v.provider_id = sp.id order by v.updated_at desc limit 1) as environment,
    (select max(v.updated_at) from public.platform_api_vault v where v.provider_id = sp.id) as updated_at
  from public.system_providers sp
  where sp.provider_type = 'PAYMENT_GATEWAY'
  order by sp.priority, sp.provider_name;
end;
$function$;

revoke all on function public.admin_list_payment_gateways() from public, anon;
grant execute on function public.admin_list_payment_gateways() to authenticated;

create or replace function public.admin_set_payment_gateway_active(
  p_provider_name text,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_old boolean;
begin
  if v_actor is null or not public.is_super_admin() then
    return jsonb_build_object('ok', false, 'error', 'only super_admin can toggle payment gateways');
  end if;
  select is_active into v_old from public.system_providers
   where upper(provider_name) = upper(p_provider_name)
     and provider_type = 'PAYMENT_GATEWAY'
   for update;
  if v_old is null then return jsonb_build_object('ok', false, 'error', 'payment gateway not found'); end if;
  update public.system_providers set is_active = p_active, updated_at = now()
   where upper(provider_name) = upper(p_provider_name)
     and provider_type = 'PAYMENT_GATEWAY';
  insert into public.admin_audit_log(actor_id, action, target_table, old_value, new_value)
  values (
    v_actor, 'set_payment_gateway_active', 'system_providers',
    jsonb_build_object('provider', upper(p_provider_name), 'is_active', v_old),
    jsonb_build_object('provider', upper(p_provider_name), 'is_active', p_active)
  );
  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.admin_set_payment_gateway_active(text, boolean) from public, anon;
grant execute on function public.admin_set_payment_gateway_active(text, boolean) to authenticated;

create or replace function public.admin_set_membership_exempt(
  p_target_user_id uuid,
  p_is_exempt boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_old boolean;
  v_paid boolean;
begin
  if v_actor is null or not (public.is_super_admin() or public.is_owner()) then
    return jsonb_build_object('ok', false, 'error', 'only financial staff can change membership exemption');
  end if;
  select is_membership_exempt, is_subscribed into v_old, v_paid
    from public.users where id = p_target_user_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'user not found'); end if;
  if coalesce(v_paid, false) then
    return jsonb_build_object('ok', false, 'error', 'paid membership cannot be overridden here');
  end if;
  update public.users set is_membership_exempt = p_is_exempt where id = p_target_user_id;
  insert into public.admin_audit_log(actor_id, action, target_table, target_id, old_value, new_value)
  values (
    v_actor, 'set_membership_exemption', 'users', p_target_user_id,
    jsonb_build_object('is_membership_exempt', v_old),
    jsonb_build_object('is_membership_exempt', p_is_exempt)
  );
  return jsonb_build_object('ok', true, 'is_membership_exempt', p_is_exempt);
end;
$function$;

revoke all on function public.admin_set_membership_exempt(uuid, boolean) from public, anon;
grant execute on function public.admin_set_membership_exempt(uuid, boolean) to authenticated;

create or replace function public.admin_dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_users bigint;
  v_listings bigint;
  v_orders bigint;
  v_gains numeric;
  v_circulation jsonb;
begin
  if not (public.is_super_admin() or public.is_owner()) then
    return jsonb_build_object('ok', false, 'error', 'only financial staff');
  end if;
  select count(*) into v_users from public.users;
  select count(*) into v_listings from public.listings;
  select count(*) into v_orders from public.orders;
  select coalesce(sum(amount_earned), 0) into v_gains from public.system_gains;
  v_circulation := public.admin_money_circulation_full();
  return jsonb_build_object(
    'ok', true,
    'total_users', v_users,
    'total_listings', v_listings,
    'total_orders', v_orders,
    'platform_gains', v_gains,
    'circulation', v_circulation
  );
end;
$function$;

revoke all on function public.admin_dashboard_summary() from public, anon;
grant execute on function public.admin_dashboard_summary() to authenticated;

create or replace function public.worker_resolve_payment_gateway(
  p_country_iso text,
  p_payment_method text,
  p_environment text default 'production',
  p_preferred_provider text default null
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_provider text;
begin
  if auth.role() <> 'cenpaya_payment_worker' then raise exception 'payment worker role only'; end if;
  if upper(coalesce(p_country_iso, 'CM')) <> 'CM' then return null; end if;
  if p_payment_method is null or lower(p_payment_method) not in ('mtn_momo', 'orange_money') then return null; end if;
  if p_environment is null or p_environment not in ('sandbox', 'production') then raise exception 'invalid environment'; end if;
  if p_preferred_provider is not null and upper(p_preferred_provider) not in ('FAPSHI', 'CAMPAY') then return null; end if;

  select upper(sp.provider_name) into v_provider
    from public.system_providers sp
   where sp.provider_type = 'PAYMENT_GATEWAY'
     and sp.is_active = true
     and upper(sp.provider_name) in ('FAPSHI', 'CAMPAY')
     and (p_preferred_provider is null or upper(sp.provider_name) = upper(p_preferred_provider))
     and exists (
       select 1 from public.platform_api_vault v
        where v.provider_id = sp.id and v.environment = p_environment
          and v.key_name = 'api_secret_key'
     )
     and (
       upper(sp.provider_name) <> 'FAPSHI'
       or exists (
         select 1 from public.platform_api_vault v
          where v.provider_id = sp.id and v.environment = p_environment
            and v.key_name = 'api_public_key'
       )
     )
   order by sp.priority, sp.provider_name
   limit 1;
  return v_provider;
end;
$function$;

revoke all on function public.worker_resolve_payment_gateway(text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.worker_resolve_payment_gateway(text, text, text, text)
  to cenpaya_payment_worker;

create or replace function public.create_admin_withdrawal_idempotent(
  p_user_id uuid,
  p_amount bigint,
  p_destination_phone text,
  p_destination_provider text,
  p_gateway_provider text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_existing uuid;
  v_id uuid;
begin
  if auth.role() <> 'cenpaya_payment_worker' then raise exception 'payment worker role only'; end if;
  if auth.uid() is distinct from p_user_id
     or not (public.is_super_admin() or public.is_owner()) then
    raise exception 'financial admin authorization required';
  end if;
  if p_amount is null or p_amount < 1000
     or p_idempotency_key is null or length(p_idempotency_key) < 8 or length(p_idempotency_key) > 128
     or p_gateway_provider is null or upper(p_gateway_provider) not in ('FAPSHI', 'CAMPAY')
     or p_destination_provider is null or lower(p_destination_provider) not in ('mtn_momo', 'orange_money') then
    raise exception 'invalid admin withdrawal request';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':admin-withdrawal:' || p_idempotency_key, 0));
  select id into v_existing from public.user_withdrawals
   where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if v_existing is not null then return v_existing; end if;

  v_id := public.create_withdrawal(p_user_id, p_amount, 'available', p_destination_phone, p_destination_provider);
  update public.user_withdrawals set idempotency_key = p_idempotency_key,
    gateway_provider = upper(p_gateway_provider) where id = v_id;
  return v_id;
end;
$function$;

revoke all on function public.create_admin_withdrawal_idempotent(uuid, bigint, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_admin_withdrawal_idempotent(uuid, bigint, text, text, text, text)
  to cenpaya_payment_worker;

commit;
