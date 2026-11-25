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