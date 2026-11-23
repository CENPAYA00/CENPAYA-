-- Escrow settlement correction and verified-delivery auto-release.
-- Existing held funds are not moved by this migration.

alter table public.orders
  add column if not exists delivery_proof_verified boolean not null default false,
  add column if not exists delivery_verified_at timestamptz,
  add column if not exists delivery_method text,
  add column if not exists tracking_number text,
  add column if not exists estimated_delivery_at timestamptz,
  add column if not exists inspection_window_hours integer;

create or replace function public.cenpaya_product_order_fee()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select f.calculated_fee_pct, f.calculated_fee_fixed, f.calculated_platform_fee
    into new.fee_pct, new.fee_fixed, new.platform_fee
  from public.cenpaya_calculate_platform_fee(new.seller_id::text, new.amount::bigint) f;
  -- Buyer pays listed amount plus platform fee; seller receives listed amount.
  new.total_amount := new.amount + coalesce(new.platform_fee, 0);
  return new;
end;
$$;

create or replace function public.hold_escrow_on_order_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_buyer public.wallets%rowtype; v_total bigint;
begin
  if new.buyer_id = new.seller_id then raise exception 'buyer=seller'; end if;
  new.total_amount := new.amount + coalesce(new.platform_fee, 0);
  v_total := new.total_amount;
  select * into v_buyer from public.wallets where user_id = new.buyer_id for update;
  if v_buyer.user_id is null then raise exception 'no wallet'; end if;
  if v_buyer.available_funds < v_total then raise exception 'insufficient funds'; end if;
  update public.wallets set available_funds = available_funds - v_total, updated_at = now()
    where user_id = new.buyer_id;
  insert into public.wallet_historical_ledger
    (user_id,currency_code,entry_type,amount_mutated,running_balance_snapshot,associated_reference_id)
  values (new.buyer_id,coalesce(new.currency_code,'XAF'),'ESCROW_HOLD',-v_total,
    v_buyer.available_funds-v_total,new.id);
  return new;
end;
$$;

create or replace function public.release_order_escrow(p_order_id uuid)
returns void language plpgsql set search_path = public, extensions, pg_temp as $$
declare v_order public.orders%rowtype; v_after bigint;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.escrow_status <> 'hold' then raise exception 'Order is not in hold status'; end if;
  if v_order.dispute_hold then raise exception 'Order has an open dispute'; end if;
  -- The buyer already paid amount + fee. Never deduct the fee from seller payout.
  update public.wallets set available_funds = available_funds + v_order.amount, updated_at = now()
    where user_id = v_order.seller_id returning available_funds into v_after;
  if not found then raise exception 'Seller wallet not found'; end if;
  update public.orders set escrow_status = 'released', updated_at = now() where id = p_order_id;
  insert into public.wallet_historical_ledger
    (user_id,currency_code,entry_type,amount_mutated,running_balance_snapshot,associated_reference_id)
  values (v_order.seller_id,coalesce(v_order.currency_code,'XAF'),'ESCROW_PAYOUT',
    v_order.amount,v_after,p_order_id);
  if coalesce(v_order.platform_fee,0) > 0 then
    insert into public.system_gains(source_type,source_id,amount_earned)
    values ('order',p_order_id,v_order.platform_fee)
    on conflict (source_type,source_id) do nothing;
  end if;
end;
$$;

create or replace function public.buyer_mark_received(p_order_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then return 'error: order not found'; end if;
  if v_order.buyer_id is distinct from auth.uid() then
    return 'error: not authorized — you are not the buyer on this order';
  end if;
  if v_order.escrow_status <> 'hold' or not v_order.seller_confirmed_delivered then
    return 'error: order not ready for release';
  end if;
  if v_order.dispute_hold then return 'error: order has an active dispute'; end if;
  update public.orders set buyer_confirmed_received=true,buyer_confirmed_received_at=now(),
    buyer_reviewed_proof=true,updated_at=now() where id=p_order_id;
  perform public.release_order_escrow(p_order_id);
  return 'ok';
end;
$$;

create or replace function public.cenpaya_guard_escrow_release()
returns trigger language plpgsql set search_path = public, extensions, pg_temp as $$
declare v_has_active_dispute boolean; v_release_authorized boolean;
begin
  if new.escrow_status='released' and old.escrow_status is distinct from 'released' then
    select exists(select 1 from public.order_disputes
      where order_type='product' and order_id=new.id
        and status in ('open','under_review','escalated')) into v_has_active_dispute;
    if coalesce(new.dispute_hold,false) or v_has_active_dispute then
      raise exception 'Escrow cannot be released while a dispute is active';
    end if;
    select (
      coalesce(new.buyer_confirmed_received,false)
      or (coalesce(new.delivery_proof_verified,false)
          and new.auto_release_deadline_at is not null and now()>=new.auto_release_deadline_at)
      or exists(select 1 from public.order_disputes
        where order_type='product' and order_id=new.id and status='resolved'
          and outcome in ('seller_wins','release_to_seller'))
    ) into v_release_authorized;
    if not coalesce(v_release_authorized,false) then
      raise exception 'Release requires buyer confirmation, verified delivery plus expired inspection window, or seller-win dispute resolution';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.admin_verify_order_delivery(
  p_order_id uuid,p_delivery_method text,p_tracking_number text,
  p_estimated_delivery_at timestamptz,p_inspection_window_hours integer
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.orders%rowtype; v_verified_at timestamptz:=now();
begin
  if not (public.is_super_admin() or public.is_support_or_admin()) then
    return jsonb_build_object('ok',false,'error','staff only');
  end if;
  if p_delivery_method not in ('courier','seller_transport') then
    return jsonb_build_object('ok',false,'error','invalid delivery method');
  end if;
  if p_estimated_delivery_at is null or p_estimated_delivery_at<=v_verified_at then
    return jsonb_build_object('ok',false,'error','estimated delivery must be in the future');
  end if;
  if p_inspection_window_hours is null or p_inspection_window_hours<1 or p_inspection_window_hours>168 then
    return jsonb_build_object('ok',false,'error','inspection window must be between 1 and 168 hours');
  end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.escrow_status<>'hold' then
    return jsonb_build_object('ok',false,'error','order not found or not held');
  end if;
  if not v_order.seller_confirmed_delivered then
    return jsonb_build_object('ok',false,'error','seller must first confirm dispatch');
  end if;
  if v_order.dispute_hold then return jsonb_build_object('ok',false,'error','order has an active dispute'); end if;
  update public.orders set delivery_method=p_delivery_method,
    tracking_number=nullif(trim(coalesce(p_tracking_number,'')),''),
    estimated_delivery_at=p_estimated_delivery_at,delivery_proof_verified=true,
    delivery_verified_at=v_verified_at,inspection_window_hours=p_inspection_window_hours,
    auto_release_deadline_at=p_estimated_delivery_at+make_interval(hours=>p_inspection_window_hours),
    updated_at=now() where id=p_order_id;
  insert into public.admin_audit_log(actor_id,action,target_table,target_id,new_value)
  values(auth.uid(),'verify_order_delivery','orders',p_order_id,
    jsonb_build_object('delivery_method',p_delivery_method,'tracking_number',p_tracking_number,
      'estimated_delivery_at',p_estimated_delivery_at,'inspection_window_hours',p_inspection_window_hours));
  return jsonb_build_object('ok',true,'auto_release_deadline_at',
    p_estimated_delivery_at+make_interval(hours=>p_inspection_window_hours));
end;
$$;

create or replace function public.escrow_auto_48h()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  -- No release/refund timer from payment or dispatch; only verified delivery + inspection.
  for r in select id from public.orders where escrow_status='hold' and dispute_hold=false
    and delivery_proof_verified=true and auto_release_deadline_at is not null
    and auto_release_deadline_at<=now() and buyer_confirmed_received=false
    order by auto_release_deadline_at for update skip locked
  loop
    begin
      perform public.release_order_escrow(r.id);
    exception when others then
      insert into public.escrow_auto_release_failures(order_id,attempted_status,error_message)
      values(r.id,'released',sqlerrm);
    end;
  end loop;
end;
$$;

revoke all on function public.admin_verify_order_delivery(uuid,text,text,timestamptz,integer) from public;
grant execute on function public.admin_verify_order_delivery(uuid,text,text,timestamptz,integer) to authenticated;
