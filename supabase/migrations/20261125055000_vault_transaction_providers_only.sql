begin;

-- The legacy notification providers are not financial providers. Their records
-- have no Vault entries and no transactional-ledger references.
delete from public.system_providers
where provider_type in ('EMAIL_SERVICE', 'SMS_SERVICE', 'EMAIL_GATEWAY', 'SMS_GATEWAY');

alter table public.system_providers
  drop constraint if exists system_providers_provider_type_check;

alter table public.system_providers
  add constraint system_providers_provider_type_check
  check (provider_type = any (array['PAYMENT_GATEWAY', 'VIDEO_HOST', 'VOICE_CALL']::text[]));

create or replace function public.admin_list_providers()
returns table(
  provider_type text,
  provider_name text,
  display_name text,
  is_active boolean,
  has_key boolean,
  environment text,
  last_updated timestamp with time zone
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    sp.provider_type,
    sp.provider_name,
    sp.display_name,
    sp.is_active,
    exists (
      select 1 from public.platform_api_vault v
      where v.provider_id = sp.id
    ) as has_key,
    (
      select v.environment
      from public.platform_api_vault v
      where v.provider_id = sp.id
      order by v.updated_at desc
      limit 1
    ) as environment,
    (
      select v.updated_at
      from public.platform_api_vault v
      where v.provider_id = sp.id
      order by v.updated_at desc
      limit 1
    ) as last_updated
  from public.system_providers sp
  where public.is_super_admin()
    and sp.provider_type = 'PAYMENT_GATEWAY'
  order by sp.priority, sp.provider_name;
$function$;

create or replace function public.admin_set_provider_active(
  p_provider_name text,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_old boolean;
begin
  if not public.is_super_admin() then
    return jsonb_build_object('ok', false, 'error', 'only super_admin can toggle providers');
  end if;

  select is_active into v_old
  from public.system_providers
  where provider_name = upper(trim(p_provider_name))
    and provider_type = 'PAYMENT_GATEWAY';

  if not found then
    return jsonb_build_object('ok', false, 'error', 'unknown payment provider');
  end if;

  update public.system_providers
  set is_active = p_active, updated_at = now()
  where provider_name = upper(trim(p_provider_name))
    and provider_type = 'PAYMENT_GATEWAY';

  insert into public.admin_audit_log
    (actor_id, action, target_table, old_value, new_value)
  values
    (
      v_actor,
      'set_provider_active',
      'system_providers',
      jsonb_build_object('provider', upper(trim(p_provider_name)), 'is_active', v_old),
      jsonb_build_object('provider', upper(trim(p_provider_name)), 'is_active', p_active)
    );

  return jsonb_build_object('ok', true);
end;
$function$;

create or replace function public.platform_vault_get(
  p_provider text,
  p_environment text
)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(jsonb_object_agg(v.key_name, ds.decrypted_secret), '{}'::jsonb)
  from public.platform_api_vault v
  join public.system_providers sp on sp.id = v.provider_id
  join vault.decrypted_secrets ds on ds.id = v.secret_id
  where upper(sp.provider_name) = upper(p_provider)
    and sp.provider_type = 'PAYMENT_GATEWAY'
    and p_environment in ('sandbox', 'production')
    and v.environment = p_environment;
$function$;

create or replace function public.platform_vault_set(
  p_provider text,
  p_environment text,
  p_key text,
  p_value text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_pid uuid;
  v_sid uuid;
begin
  if p_environment is null or p_environment not in ('production', 'sandbox') then
    return jsonb_build_object('ok', false, 'error', 'invalid environment');
  end if;
  if p_key is null or p_key !~ '^[a-z0-9_]{1,50}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid key name');
  end if;
  if p_value is null or length(p_value) = 0 or length(p_value) > 4000 then
    return jsonb_build_object('ok', false, 'error', 'invalid value');
  end if;

  select id into v_pid
  from public.system_providers
  where provider_name = upper(p_provider)
    and provider_type = 'PAYMENT_GATEWAY';

  if not found then
    return jsonb_build_object('ok', false, 'error', 'unknown payment provider');
  end if;

  select secret_id into v_sid
  from public.platform_api_vault
  where provider_id = v_pid
    and environment = p_environment
    and key_name = p_key;

  if found then
    perform vault.update_secret(v_sid, p_value);
    update public.platform_api_vault
    set updated_at = now()
    where provider_id = v_pid and environment = p_environment and key_name = p_key;
  else
    v_sid := vault.create_secret(
      p_value,
      'pav:' || upper(p_provider) || ':' || p_environment || ':' || p_key,
      'CenPaya payment provider credential'
    );
    insert into public.platform_api_vault (provider_id, environment, key_name, secret_id)
    values (v_pid, p_environment, p_key, v_sid);
  end if;

  return jsonb_build_object('ok', true);
end;
$function$;

create or replace function public.platform_vault_remove(
  p_provider text,
  p_environment text,
  p_key text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_sid uuid;
begin
  if p_environment is null or p_environment not in ('production', 'sandbox') then
    return jsonb_build_object('ok', false, 'error', 'invalid environment');
  end if;

  delete from public.platform_api_vault v
  using public.system_providers sp
  where sp.id = v.provider_id
    and sp.provider_name = upper(p_provider)
    and sp.provider_type = 'PAYMENT_GATEWAY'
    and v.environment = p_environment
    and v.key_name = p_key
  returning v.secret_id into v_sid;

  if v_sid is not null then
    delete from vault.secrets where id = v_sid;
  end if;

  return jsonb_build_object('ok', true, 'removed', v_sid is not null);
end;
$function$;

create or replace function public.worker_upsert_vault_secret(
  p_provider_id uuid,
  p_environment text,
  p_key_name text,
  p_secret_value text
)
returns void
language plpgsql
security definer
set search_path to 'public', 'vault', 'pg_temp'
as $function$
declare
  v_secret_id uuid;
  v_secret_name text;
begin
  if not exists (
    select 1 from public.system_providers
    where id = p_provider_id and provider_type = 'PAYMENT_GATEWAY'
  ) then
    raise exception 'payment provider only';
  end if;

  if p_environment not in ('sandbox', 'production') then
    raise exception 'invalid environment';
  end if;
  if p_key_name is null or p_key_name !~ '^[a-z0-9_]{1,50}$' then
    raise exception 'invalid key name';
  end if;
  if p_secret_value is null or length(p_secret_value) = 0 or length(p_secret_value) > 4000 then
    raise exception 'invalid secret value';
  end if;

  v_secret_name := 'cenpaya:' || p_provider_id::text || ':' || p_environment || ':' || p_key_name;

  select secret_id into v_secret_id
  from public.platform_api_vault
  where provider_id = p_provider_id
    and environment = p_environment
    and key_name = p_key_name
  for update;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      p_secret_value,
      v_secret_name,
      'CenPaya payment gateway credential'
    );
  else
    perform vault.update_secret(
      v_secret_id,
      p_secret_value,
      v_secret_name,
      'CenPaya payment gateway credential',
      null
    );
  end if;

  insert into public.platform_api_vault
    (provider_id, environment, key_name, secret_id, updated_at)
  values
    (p_provider_id, p_environment, p_key_name, v_secret_id, now())
  on conflict (provider_id, environment, key_name)
  do update set secret_id = excluded.secret_id, updated_at = now();
end;
$function$;

commit;