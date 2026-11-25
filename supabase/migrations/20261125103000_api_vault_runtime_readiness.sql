begin;

-- The Worker currently has transaction adapters for FAPSHI and CAMPAY only.
-- Keep other registry entries visible in the Vault, but never advertise them as
-- live payment options until a matching, tested adapter is installed.
drop function if exists public.admin_list_providers();
create function public.admin_list_providers()
returns table(
  id uuid,
  provider_type text,
  provider_name text,
  display_name text,
  is_active boolean,
  priority integer,
  supported_countries text[],
  has_sandbox_key boolean,
  has_production_key boolean,
  sandbox_updated_at timestamptz,
  production_updated_at timestamptz,
  worker_supported boolean
)
language sql
stable
security definer
set search_path = public
as $function$
  select
    sp.id, sp.provider_type, sp.provider_name, sp.display_name, sp.is_active,
    sp.priority, sp.supported_countries,
    exists(select 1 from public.platform_api_vault v where v.provider_id=sp.id and v.environment='sandbox'),
    exists(select 1 from public.platform_api_vault v where v.provider_id=sp.id and v.environment='production'),
    (select max(v.updated_at) from public.platform_api_vault v where v.provider_id=sp.id and v.environment='sandbox'),
    (select max(v.updated_at) from public.platform_api_vault v where v.provider_id=sp.id and v.environment='production'),
    sp.provider_name in ('FAPSHI','CAMPAY')
  from public.system_providers sp
  where public.is_super_admin() and sp.provider_type='PAYMENT_GATEWAY'
  order by sp.priority,sp.provider_name;
$function$;
revoke all on function public.admin_list_providers() from public,anon;
grant execute on function public.admin_list_providers() to authenticated;

create or replace function public.admin_set_provider_active(p_provider_name text,p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
 v_actor uuid:=auth.uid();
 v_provider_id uuid;
 v_provider_name text:=upper(trim(coalesce(p_provider_name,'')));
 v_old boolean;
begin
 if v_actor is null or not public.is_super_admin() then
  return jsonb_build_object('ok',false,'error','only super_admin can toggle providers');
 end if;
 select id,is_active into v_provider_id,v_old
 from public.system_providers
 where provider_name=v_provider_name and provider_type='PAYMENT_GATEWAY'
 for update;
 if not found then return jsonb_build_object('ok',false,'error','unknown payment provider'); end if;

 if p_active then
  if v_provider_name not in ('FAPSHI','CAMPAY') then
   return jsonb_build_object('ok',false,'error','payment_adapter_not_supported');
  end if;
  if not exists(select 1 from public.platform_api_vault where provider_id=v_provider_id) then
   return jsonb_build_object('ok',false,'error','provider_credentials_required');
  end if;
 end if;

 update public.system_providers set is_active=p_active,updated_at=now() where id=v_provider_id;
 insert into public.admin_audit_log(actor_id,action,target_table,target_id,old_value,new_value)
 values(v_actor,'set_provider_active','system_providers',v_provider_id,
  jsonb_build_object('provider',v_provider_name,'is_active',v_old),
  jsonb_build_object('provider',v_provider_name,'is_active',p_active));
 return jsonb_build_object('ok',true);
end;
$function$;
revoke all on function public.admin_set_provider_active(text,boolean) from public,anon;
grant execute on function public.admin_set_provider_active(text,boolean) to authenticated;

-- Fail closed for providers whose transaction lifecycle is not implemented
-- in this Worker. Their credentials remain available in the Vault.
update public.system_providers
set is_active=false,updated_at=now()
where provider_type='PAYMENT_GATEWAY'
  and provider_name not in ('FAPSHI','CAMPAY')
  and is_active=true;

-- Match the Vault writer's own 4,000-character secret limit.
create or replace function public.admin_set_gateway_credentials_map(
 p_provider_name text,p_environment text,p_credentials jsonb
) returns jsonb language plpgsql security definer set search_path='public','vault','pg_temp' as $function$
declare v_actor uuid:=auth.uid(); v_provider_id uuid; v_entry record; v_count integer:=0;
begin
 if v_actor is null or not public.is_super_admin() then return jsonb_build_object('ok',false,'error','only super_admin can configure credentials'); end if;
 if p_environment not in ('sandbox','production') then return jsonb_build_object('ok',false,'error','invalid environment'); end if;
 if p_credentials is null or jsonb_typeof(p_credentials)<>'object' or (select count(*) from jsonb_object_keys(p_credentials))<1 or (select count(*) from jsonb_object_keys(p_credentials))>30 then
  return jsonb_build_object('ok',false,'error','provide between 1 and 30 credential fields');
 end if;
 select id into v_provider_id from public.system_providers where provider_name=upper(trim(p_provider_name)) and provider_type='PAYMENT_GATEWAY';
 if v_provider_id is null then return jsonb_build_object('ok',false,'error','unknown payment provider'); end if;
 for v_entry in select key,value from jsonb_each(p_credentials) loop
  if v_entry.key !~ '^[a-z][a-z0-9_]{0,49}$' or jsonb_typeof(v_entry.value)<>'string'
     or length(v_entry.value #>> '{}')=0 or length(v_entry.value #>> '{}')>4000 then
   return jsonb_build_object('ok',false,'error','invalid credential field or value');
  end if;
 end loop;
 for v_entry in select key,value #>> '{}' as secret_value from jsonb_each(p_credentials) loop
  perform public.worker_upsert_vault_secret(v_provider_id,p_environment,v_entry.key,v_entry.secret_value);
  v_count:=v_count+1;
 end loop;
 insert into public.admin_audit_log(actor_id,action,target_table,target_id,new_value)
 values(v_actor,'set_gateway_credentials','platform_api_vault',v_provider_id,jsonb_build_object('provider',upper(trim(p_provider_name)),'environment',p_environment,'credential_fields',v_count,'secret_values_logged',false));
 return jsonb_build_object('ok',true,'credential_fields_saved',v_count);
end;$function$;
revoke all on function public.admin_set_gateway_credentials_map(text,text,jsonb) from public,anon;
grant execute on function public.admin_set_gateway_credentials_map(text,text,jsonb) to authenticated;

commit;
