create or replace function public.cenpaya_momo_membership_options(p_user_id uuid,p_environment text,p_supported text[])
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_country text; v_plan public.membership_plans%rowtype; v_opts jsonb;
begin
 select coalesce(country_iso,'CM') into v_country from public.users where id=p_user_id;
 if not found then return jsonb_build_object('ok',false,'error','user not found'); end if;
 select * into v_plan from public.membership_plans where code='membership_yearly' and is_active;
 if not found then return jsonb_build_object('ok',false,'error','membership plan unavailable'); end if;
 select coalesce(jsonb_agg(to_jsonb(o) order by o.priority,o.provider,o.payment_method),'[]'::jsonb) into v_opts
 from (select g.provider,g.payment_method,g.priority,g.gross_amount,g.gross_amount-v_plan.price_amount as gateway_fee from (
  select sp.provider_name as provider,af.payment_method,sp.priority,
   case when sp.provider_name='CINETPAY' then (ceil(ceil((v_plan.price_amount+af.fee_fixed)/(1-af.fee_pct/100.0))/5.0)*5)::bigint
   else ceil((v_plan.price_amount+af.fee_fixed)/(1-af.fee_pct/100.0))::bigint end as gross_amount
  from public.system_providers sp join public.aggregator_fees af on af.provider_name=sp.provider_name
  where sp.provider_type='PAYMENT_GATEWAY' and sp.is_active
   and (sp.supported_countries is null or v_country=any(sp.supported_countries))
   and af.country_iso=v_country and af.action='topup' and af.is_active
   and (p_supported is null or sp.provider_name=any(p_supported) or sp.provider_name not in ('FAPSHI','CAMPAY'))
   and exists(select 1 from public.platform_api_vault v where v.provider_id=sp.id and v.environment=p_environment)
   and (sp.provider_name in ('FAPSHI','CAMPAY') or exists(select 1 from public.platform_payment_adapter_configs c where c.provider_id=sp.id))
 ) g) o;
 return jsonb_build_object('ok',true,'country',v_country,'plan_price',v_plan.price_amount,'currency',v_plan.currency_code,'options',v_opts);
end;$function$;