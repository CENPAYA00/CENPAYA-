-- Tighten dynamic credential validation: validate the full object before writing any secret.
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

 -- Validate every key/value before any Vault mutation, avoiding partial writes.
 for v_entry in select key,value from jsonb_each(p_credentials) loop
  if v_entry.key !~ '^[a-z][a-z0-9_]{0,49}$' or jsonb_typeof(v_entry.value)<>'string'
     or length(v_entry.value #>> '{}')=0 or length(v_entry.value #>> '{}')>4096 then
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

-- Retire notification provider types from this payment-provider registry.
alter table public.system_providers drop constraint if exists system_providers_provider_type_check;
alter table public.system_providers add constraint system_providers_provider_type_check
 check (provider_type = any (array['PAYMENT_GATEWAY'::text,'VIDEO_HOST'::text,'VOICE_CALL'::text]));
