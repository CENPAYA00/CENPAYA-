begin;
create table if not exists public.platform_payment_adapter_configs (
 id uuid primary key default gen_random_uuid(),
 provider_id uuid not null unique references public.system_providers(id) on delete cascade,
 config jsonb not null check (jsonb_typeof(config)='object'),
 updated_by uuid references auth.users(id),
 updated_at timestamptz not null default now()
);
alter table public.platform_payment_adapter_configs enable row level security;
revoke all on public.platform_payment_adapter_configs from anon,authenticated,service_role;

create or replace function public.admin_set_payment_adapter_config(p_provider_name text,p_config jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_id uuid; v_provider text:=upper(trim(coalesce(p_provider_name,'')));
begin
 if v_actor is null or not public.is_super_admin() then return jsonb_build_object('ok',false,'error','only super_admin can configure payment adapters'); end if;
 if jsonb_typeof(p_config)<>'object' or octet_length(p_config::text)>24000 then return jsonb_build_object('ok',false,'error','invalid_adapter_config'); end if;
 if coalesce(p_config->>'base_url','') !~ '^https://[A-Za-z0-9.-]+(:443)?$' then return jsonb_build_object('ok',false,'error','base_url_must_be_https'); end if;
 if not (p_config ? 'topup' and p_config ? 'status') then return jsonb_build_object('ok',false,'error','topup_and_status_are_required'); end if;
 select id into v_id from public.system_providers where provider_name=v_provider and provider_type='PAYMENT_GATEWAY';
 if v_id is null then return jsonb_build_object('ok',false,'error','unknown_payment_provider'); end if;
 insert into public.platform_payment_adapter_configs(provider_id,config,updated_by,updated_at) values(v_id,p_config,v_actor,now())
 on conflict(provider_id) do update set config=excluded.config,updated_by=excluded.updated_by,updated_at=now();
 insert into public.admin_audit_log(actor_id,action,target_table,target_id,new_value) values(v_actor,'set_payment_adapter_config','platform_payment_adapter_configs',v_id,jsonb_build_object('provider',v_provider,'config_saved',true,'secrets_in_config',false));
 return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.admin_set_payment_adapter_config(text,jsonb) from public,anon;
grant execute on function public.admin_set_payment_adapter_config(text,jsonb) to authenticated;

create or replace function public.admin_get_payment_adapter_config(p_provider_name text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_config jsonb;
begin
 if auth.uid() is null or not public.is_super_admin() then return null; end if;
 select c.config into v_config from public.platform_payment_adapter_configs c join public.system_providers p on p.id=c.provider_id
 where p.provider_name=upper(trim(p_provider_name)) and p.provider_type='PAYMENT_GATEWAY';
 return v_config;
end; $$;
revoke all on function public.admin_get_payment_adapter_config(text) from public,anon;
grant execute on function public.admin_get_payment_adapter_config(text) to authenticated;

create or replace function public.worker_get_payment_adapter_config(p_provider_name text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_config jsonb;
begin
 if auth.role()<>'authenticated' or coalesce(auth.jwt()->'app_metadata'->>'cenpaya_payment_worker','false')<>'true' then raise exception 'payment worker role only'; end if;
 select c.config into v_config from public.platform_payment_adapter_configs c join public.system_providers p on p.id=c.provider_id
 where p.provider_name=upper(trim(p_provider_name)) and p.provider_type='PAYMENT_GATEWAY' and p.is_active=true;
 return v_config;
end; $$;
revoke all on function public.worker_get_payment_adapter_config(text) from public,anon;
grant execute on function public.worker_get_payment_adapter_config(text) to authenticated;

drop function if exists public.admin_list_providers();
create function public.admin_list_providers()
returns table(id uuid,provider_type text,provider_name text,display_name text,is_active boolean,priority integer,supported_countries text[],
 has_sandbox_key boolean,has_production_key boolean,sandbox_updated_at timestamptz,production_updated_at timestamptz,worker_supported boolean,adapter_configured boolean)
language sql stable security definer set search_path=public as $$
 select sp.id,sp.provider_type,sp.provider_name,sp.display_name,sp.is_active,sp.priority,sp.supported_countries,
 exists(select 1 from public.platform_api_vault v where v.provider_id=sp.id and v.environment='sandbox'),
 exists(select 1 from public.platform_api_vault v where v.provider_id=sp.id and v.environment='production'),
 (select max(v.updated_at) from public.platform_api_vault v where v.provider_id=sp.id and v.environment='sandbox'),
 (select max(v.updated_at) from public.platform_api_vault v where v.provider_id=sp.id and v.environment='production'),
 (sp.provider_name in ('FAPSHI','CAMPAY') or c.provider_id is not null),(c.provider_id is not null)
 from public.system_providers sp left join public.platform_payment_adapter_configs c on c.provider_id=sp.id
 where public.is_super_admin() and sp.provider_type='PAYMENT_GATEWAY' order by sp.priority,sp.provider_name;
$$;
revoke all on function public.admin_list_providers() from public,anon;
grant execute on function public.admin_list_providers() to authenticated;

create or replace function public.admin_set_provider_active(p_provider_name text,p_active boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_id uuid; v_old boolean; v_name text:=upper(trim(coalesce(p_provider_name,'')));
begin
 if v_actor is null or not public.is_super_admin() then return jsonb_build_object('ok',false,'error','only super_admin can toggle providers'); end if;
 select id,is_active into v_id,v_old from public.system_providers where provider_name=v_name and provider_type='PAYMENT_GATEWAY' for update;
 if not found then return jsonb_build_object('ok',false,'error','unknown payment provider'); end if;
 if p_active then
  if v_name not in ('FAPSHI','CAMPAY') and not exists(select 1 from public.platform_payment_adapter_configs where provider_id=v_id) then return jsonb_build_object('ok',false,'error','payment_adapter_config_required'); end if;
  if not exists(select 1 from public.platform_api_vault where provider_id=v_id) then return jsonb_build_object('ok',false,'error','provider_credentials_required'); end if;
 end if;
 update public.system_providers set is_active=p_active,updated_at=now() where id=v_id;
 insert into public.admin_audit_log(actor_id,action,target_table,target_id,old_value,new_value)
 values(v_actor,'set_provider_active','system_providers',v_id,jsonb_build_object('provider',v_name,'is_active',v_old),jsonb_build_object('provider',v_name,'is_active',p_active));
 return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.admin_set_provider_active(text,boolean) from public,anon;
grant execute on function public.admin_set_provider_active(text,boolean) to authenticated;
commit;