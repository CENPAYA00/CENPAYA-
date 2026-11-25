create or replace function public.admin_create_payment_provider(
 p_provider_name text,p_display_name text,p_supported_countries text[] default null,p_priority integer default 100
) returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $function$
declare v_actor uuid:=auth.uid(); v_name text:=upper(trim(coalesce(p_provider_name,''))); v_display text:=trim(coalesce(p_display_name,'')); v_id uuid;
begin
 if v_actor is null or not public.is_super_admin() then return jsonb_build_object('ok',false,'error','only super_admin can add payment providers'); end if;
 if v_name !~ '^[A-Z][A-Z0-9_]{1,39}$' then return jsonb_build_object('ok',false,'error','invalid provider code'); end if;
 if v_display='' or length(v_display)>120 then return jsonb_build_object('ok',false,'error','invalid provider display name'); end if;
 if p_priority is null or p_priority<1 or p_priority>10000 then return jsonb_build_object('ok',false,'error','invalid provider priority'); end if;
 if p_supported_countries is not null and (cardinality(p_supported_countries)>30 or exists(select 1 from unnest(p_supported_countries) c where c !~ '^[A-Z]{2}$')) then
  return jsonb_build_object('ok',false,'error','invalid supported country list');
 end if;
 if exists(select 1 from public.system_providers where provider_name=v_name) then return jsonb_build_object('ok',false,'error','provider code already exists'); end if;
 insert into public.system_providers(provider_name,display_name,provider_type,is_active,supported_countries,priority,updated_at)
 values(v_name,v_display,'PAYMENT_GATEWAY',false,p_supported_countries,p_priority,now()) returning id into v_id;
 insert into public.admin_audit_log(actor_id,action,target_table,target_id,new_value)
 values(v_actor,'create_payment_provider','system_providers',v_id,jsonb_build_object('provider_name',v_name,'display_name',v_display,'supported_countries',p_supported_countries,'priority',p_priority,'is_active',false));
 return jsonb_build_object('ok',true,'provider_id',v_id);
end;$function$;
revoke all on function public.admin_create_payment_provider(text,text,text[],integer) from public,anon;
grant execute on function public.admin_create_payment_provider(text,text,text[],integer) to authenticated;

create or replace function public.admin_set_gateway_credentials_map(p_provider_name text,p_environment text,p_credentials jsonb)
returns jsonb language plpgsql security definer set search_path='public','vault','pg_temp' as $function$
declare v_actor uuid:=auth.uid(); v_provider_id uuid; v_entry record; v_count integer:=0;
begin
 if v_actor is null or not public.is_super_admin() then return jsonb_build_object('ok',false,'error','only super_admin can configure credentials'); end if;
 if p_environment not in ('sandbox','production') then return jsonb_build_object('ok',false,'error','invalid environment'); end if;
 if p_credentials is null or jsonb_typeof(p_credentials)<>'object' or (select count(*) from jsonb_object_keys(p_credentials))<1 or (select count(*) from jsonb_object_keys(p_credentials))>30 then
  return jsonb_build_object('ok',false,'error','provide between 1 and 30 credential fields');
 end if;
 select id into v_provider_id from public.system_providers where provider_name=upper(trim(p_provider_name)) and provider_type='PAYMENT_GATEWAY';
 if v_provider_id is null then return jsonb_build_object('ok',false,'error','unknown payment provider'); end if;
 for v_entry in select key,value #>> '{}' as secret_value from jsonb_each(p_credentials) loop
  if v_entry.key !~ '^[a-z][a-z0-9_]{0,49}$' or v_entry.secret_value is null or length(v_entry.secret_value)=0 or length(v_entry.secret_value)>4096 then
   return jsonb_build_object('ok',false,'error','invalid credential field or value');
  end if;
  perform public.worker_upsert_vault_secret(v_provider_id,p_environment,v_entry.key,v_entry.secret_value);
  v_count:=v_count+1;
 end loop;
 insert into public.admin_audit_log(actor_id,action,target_table,target_id,new_value)
 values(v_actor,'set_gateway_credentials','platform_api_vault',v_provider_id,jsonb_build_object('provider',upper(trim(p_provider_name)),'environment',p_environment,'credential_fields',v_count,'secret_values_logged',false));
 return jsonb_build_object('ok',true,'credential_fields_saved',v_count);
end;$function$;
revoke all on function public.admin_set_gateway_credentials_map(text,text,jsonb) from public,anon;
grant execute on function public.admin_set_gateway_credentials_map(text,text,jsonb) to authenticated;

-- Remove all configured SMS and email provider records. No ledger or vault rows reference them.
delete from public.system_providers where provider_type in ('EMAIL_SERVICE','SMS_SERVICE','EMAIL_GATEWAY','SMS_GATEWAY');
