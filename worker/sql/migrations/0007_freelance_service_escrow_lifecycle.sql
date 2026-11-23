-- Freelance service escrow RPC lifecycle.
alter table public.service_orders alter column package_id drop not null;
-- Service escrow is funded from the buyer's wallet; platform fee is paid by buyer.
-- Seller receives the full milestone principal. All RPCs use auth.uid().

alter table public.service_orders
  add column if not exists proposed_delivery_at timestamptz,
  add column if not exists released_amount bigint not null default 0,
  add column if not exists refunded_amount bigint not null default 0,
  add column if not exists fee_earned bigint not null default 0,
  add column if not exists revision_count integer not null default 0,
  add column if not exists last_revision_note text;
alter table public.service_order_milestones
  add column if not exists released_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists fee_allocated bigint not null default 0;

create unique index if not exists order_disputes_service_order_unique
  on public.order_disputes(order_id) where order_type='service';

create or replace function public.create_service_order(
 p_seller_id uuid,p_service_id uuid,p_package_id uuid,p_amount bigint,
 p_requirements text,p_due_at timestamptz,p_milestones jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
 v_buyer uuid:=auth.uid(); v_fee record; v_order public.service_orders%rowtype;
 v_wallet public.wallets%rowtype; v_total bigint; v_sum bigint; v_item jsonb;
 v_seq integer:=0; v_ms jsonb:=coalesce(p_milestones,'[]'::jsonb);
begin
 if v_buyer is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 if p_seller_id is null or p_seller_id=v_buyer or p_amount is null or p_amount<=0
  or p_due_at is null or p_due_at<=now() or p_requirements is null or length(trim(p_requirements))<5
  or jsonb_typeof(v_ms)<>'array' or jsonb_array_length(v_ms)>20 then
  return jsonb_build_object('ok',false,'error','invalid service order details'); end if;
 if not exists(select 1 from public.account_controls where user_id=p_seller_id and not is_banned and not is_deactivated) then
  return jsonb_build_object('ok',false,'error','seller account unavailable'); end if;
 if jsonb_array_length(v_ms)=0 then
  v_ms:=jsonb_build_array(jsonb_build_object('title','Project delivery','amount',p_amount,'due_at',p_due_at)); end if;
 select sum((x->>'amount')::bigint) into v_sum from jsonb_array_elements(v_ms) x;
 if v_sum is distinct from p_amount then return jsonb_build_object('ok',false,'error','milestone amounts must add up to service amount'); end if;
 if exists(select 1 from jsonb_array_elements(v_ms) x where coalesce(length(trim(x->>'title')),0)<2
  or coalesce((x->>'amount')::bigint,0)<=0 or coalesce((x->>'due_at')::timestamptz,p_due_at)>p_due_at) then
  return jsonb_build_object('ok',false,'error','invalid milestone'); end if;
 select * into v_fee from public.cenpaya_calculate_platform_fee(p_seller_id::text,p_amount);
 v_total:=p_amount+v_fee.calculated_platform_fee;
 select * into v_wallet from public.wallets where user_id=v_buyer for update;
 if v_wallet.user_id is null or v_wallet.available_funds<v_total then
  return jsonb_build_object('ok',false,'error','insufficient wallet funds'); end if;
 insert into public.service_orders(service_id,package_id,buyer_id,seller_id,amount,fee_pct,fee_fixed,
  platform_fee,total_amount,currency_code,requirements,escrow_status,proposed_delivery_at)
 values(p_service_id,p_package_id,v_buyer,p_seller_id,p_amount,v_fee.calculated_fee_pct,
  v_fee.calculated_fee_fixed,v_fee.calculated_platform_fee,v_total,
  coalesce((select c.currency_code from public.regional_market_configurations c join public.account_controls a
    on a.country_iso=c.country_iso where a.user_id=v_buyer and c.is_operational limit 1),'XAF'),
  trim(p_requirements),'awaiting_acceptance',p_due_at) returning * into v_order;
 update public.wallets set available_funds=available_funds-v_total,updated_at=now() where user_id=v_buyer;
 insert into public.wallet_historical_ledger(user_id,currency_code,entry_type,amount_mutated,
  running_balance_snapshot,associated_reference_id,description)
 values(v_buyer,v_order.currency_code,'ESCROW_HOLD',-v_total,v_wallet.available_funds-v_total,
  v_order.id,'Freelance service escrow funding');
 for v_item in select value from jsonb_array_elements(v_ms) loop
  v_seq:=v_seq+1;
  insert into public.service_order_milestones(service_order_id,title,description,amount,sequence_no,due_at)
  values(v_order.id,trim(v_item->>'title'),nullif(v_item->>'description',''),
   (v_item->>'amount')::bigint,v_seq,coalesce((v_item->>'due_at')::timestamptz,p_due_at));
 end loop;
 return jsonb_build_object('ok',true,'id',v_order.id,'amount',p_amount,
  'platform_fee',v_order.platform_fee,'total_amount',v_total,'currency_code',v_order.currency_code);
end $$;

create or replace function public.accept_service_order(p_order_id uuid,p_confirmed_deadline timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.service_orders%rowtype;
begin
 select * into v from public.service_orders where id=p_order_id for update;
 if not found then return jsonb_build_object('ok',false,'error','order not found'); end if;
 if auth.uid() is distinct from v.seller_id then return jsonb_build_object('ok',false,'error','seller only'); end if;
 if v.escrow_status<>'awaiting_acceptance' then return jsonb_build_object('ok',false,'error','order is not awaiting acceptance'); end if;
 if p_confirmed_deadline is null or p_confirmed_deadline<=now() then return jsonb_build_object('ok',false,'error','seller must confirm a future delivery date'); end if;
 update public.service_orders set escrow_status='in_progress',seller_accepted_at=now(),
  confirmed_delivery_at=p_confirmed_deadline,original_delivery_at=p_confirmed_deadline,updated_at=now() where id=p_order_id;
 update public.service_order_milestones set status='funded',due_at=p_confirmed_deadline,updated_at=now()
  where service_order_id=p_order_id and status='pending';
 return jsonb_build_object('ok',true,'confirmed_delivery_at',p_confirmed_deadline);
end $$;

create or replace function public.request_service_deadline_change(p_order_id uuid,p_new_deadline timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.service_orders%rowtype; v_id uuid;
begin
 select * into v from public.service_orders where id=p_order_id for update;
 if not found or auth.uid() not in (v.buyer_id,v.seller_id) then return jsonb_build_object('ok',false,'error','not a participant'); end if;
 if v.escrow_status not in ('in_progress','revision_requested') or v.dispute_hold then return jsonb_build_object('ok',false,'error','deadline cannot be changed'); end if;
 if p_new_deadline is null or p_new_deadline<=now() or p_new_deadline=v.confirmed_delivery_at then return jsonb_build_object('ok',false,'error','new deadline must be future and different'); end if;
 if exists(select 1 from public.service_order_deadline_changes where service_order_id=p_order_id and applied_at is null) then return jsonb_build_object('ok',false,'error','pending proposal exists'); end if;
 insert into public.service_order_deadline_changes(service_order_id,requested_by,old_deadline_at,proposed_deadline_at,buyer_approved_at,seller_approved_at)
 values(p_order_id,auth.uid(),v.confirmed_delivery_at,p_new_deadline,
  case when auth.uid()=v.buyer_id then now() end,case when auth.uid()=v.seller_id then now() end) returning id into v_id;
 return jsonb_build_object('ok',true,'change_id',v_id);
end $$;

create or replace function public.approve_service_deadline_change(p_change_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.service_order_deadline_changes%rowtype; v public.service_orders%rowtype;
begin
 select * into c from public.service_order_deadline_changes where id=p_change_id for update;
 if not found then return jsonb_build_object('ok',false,'error','proposal not found'); end if;
 select * into v from public.service_orders where id=c.service_order_id for update;
 if auth.uid()=v.buyer_id then
  update public.service_order_deadline_changes set buyer_approved_at=coalesce(buyer_approved_at,now()) where id=p_change_id returning * into c;
 elsif auth.uid()=v.seller_id then
  update public.service_order_deadline_changes set seller_approved_at=coalesce(seller_approved_at,now()) where id=p_change_id returning * into c;
 else return jsonb_build_object('ok',false,'error','participant only'); end if;
 if c.buyer_approved_at is not null and c.seller_approved_at is not null and c.applied_at is null then
  update public.service_orders set confirmed_delivery_at=c.proposed_deadline_at,updated_at=now() where id=v.id;
  update public.service_order_milestones set due_at=c.proposed_deadline_at,updated_at=now()
   where service_order_id=v.id and status not in ('accepted','released','refunded');
  update public.service_order_deadline_changes set applied_at=now() where id=p_change_id;
  return jsonb_build_object('ok',true,'applied',true,'deadline',c.proposed_deadline_at); end if;
 return jsonb_build_object('ok',true,'applied',false);
end $$;

create or replace function public.submit_service_milestone(p_order_id uuid,p_milestone_id uuid,p_delivery_note text,p_delivery_file_url text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.service_orders%rowtype; m public.service_order_milestones%rowtype;
begin
 select * into v from public.service_orders where id=p_order_id for update;
 if not found or auth.uid() is distinct from v.seller_id then return jsonb_build_object('ok',false,'error','seller only'); end if;
 if v.escrow_status not in ('in_progress','revision_requested') or v.dispute_hold then return jsonb_build_object('ok',false,'error','order not active'); end if;
 if now()>=v.confirmed_delivery_at then perform public.refund_service_order(p_order_id,'seller_missed_confirmed_delivery_deadline');
  return jsonb_build_object('ok',false,'error','deadline missed; buyer refunded'); end if;
 select * into m from public.service_order_milestones where id=p_milestone_id and service_order_id=p_order_id for update;
 if not found or m.status not in ('funded','in_progress','revision_requested') then return jsonb_build_object('ok',false,'error','milestone not ready'); end if;
 if p_delivery_note is null or length(trim(p_delivery_note))<5 then return jsonb_build_object('ok',false,'error','delivery note required'); end if;
 update public.service_order_milestones set status='submitted',delivery_note=trim(p_delivery_note),
  delivery_file_url=nullif(trim(coalesce(p_delivery_file_url,'')),''),submitted_at=now(),updated_at=now() where id=m.id;
 update public.service_orders set escrow_status='delivered',delivered_at=now(),auto_release_deadline_at=now()+interval '72 hours',updated_at=now() where id=p_order_id;
 return jsonb_build_object('ok',true,'review_deadline_at',now()+interval '72 hours');
end $$;

create or replace function public.approve_service_milestone(p_order_id uuid,p_milestone_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.service_orders%rowtype; m public.service_order_milestones%rowtype; v_after bigint; v_fee bigint;
begin
 select * into v from public.service_orders where id=p_order_id for update;
 if not found or auth.uid() is distinct from v.buyer_id then return jsonb_build_object('ok',false,'error','buyer only'); end if;
 select * into m from public.service_order_milestones where id=p_milestone_id and service_order_id=p_order_id for update;
 if not found or m.status<>'submitted' or v.dispute_hold then return jsonb_build_object('ok',false,'error','milestone not awaiting acceptance'); end if;
 if m.amount>v.amount-v.released_amount-v.refunded_amount then return jsonb_build_object('ok',false,'error','milestone exceeds remaining escrow'); end if;
 if v.released_amount+m.amount=v.amount then v_fee:=v.platform_fee-v.fee_earned;
 else v_fee:=least(v.platform_fee-v.fee_earned,round(v.platform_fee*m.amount::numeric/v.amount)::bigint); end if;
 update public.wallets set available_funds=available_funds+m.amount,updated_at=now() where user_id=v.seller_id returning available_funds into v_after;
 if not found then return jsonb_build_object('ok',false,'error','seller wallet missing'); end if;
 update public.service_orders set released_amount=released_amount+m.amount,fee_earned=fee_earned+v_fee,
  escrow_status=case when released_amount+m.amount=amount then 'released' else 'in_progress' end,
  buyer_confirmed_received=(released_amount+m.amount=amount),
  buyer_confirmed_received_at=case when released_amount+m.amount=amount then now() else buyer_confirmed_received_at end,
  updated_at=now() where id=v.id;
 update public.service_order_milestones set status='released',accepted_at=now(),released_at=now(),fee_allocated=v_fee,updated_at=now() where id=m.id;
 insert into public.wallet_historical_ledger(user_id,currency_code,entry_type,amount_mutated,running_balance_snapshot,associated_reference_id,description)
 values(v.seller_id,v.currency_code,'ESCROW_PAYOUT',m.amount,v_after,v.id,'Freelance milestone payout');
 if v_fee>0 then insert into public.system_gains(source_type,source_id,amount_earned,currency_code)
  values('service_order',v.id,v_fee,v.currency_code)
  on conflict(source_type,source_id) do update set amount_earned=public.system_gains.amount_earned+excluded.amount_earned; end if;
 return jsonb_build_object('ok',true,'released_amount',m.amount,'platform_fee_recognized',v_fee);
end $$;

create or replace function public.request_service_revision(p_order_id uuid,p_milestone_id uuid,p_note text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.service_orders%rowtype; m public.service_order_milestones%rowtype;
begin
 select * into v from public.service_orders where id=p_order_id for update;
 if not found or auth.uid() is distinct from v.buyer_id then return jsonb_build_object('ok',false,'error','buyer only'); end if;
 select * into m from public.service_order_milestones where id=p_milestone_id and service_order_id=p_order_id for update;
 if not found or m.status<>'submitted' or p_note is null or length(trim(p_note))<3 then return jsonb_build_object('ok',false,'error','invalid revision request'); end if;
 update public.service_order_milestones set status='revision_requested',updated_at=now() where id=m.id;
 update public.service_orders set escrow_status='revision_requested',revision_count=revision_count+1,last_revision_note=trim(p_note),updated_at=now() where id=v.id;
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.refund_service_order(p_order_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.service_orders%rowtype; v_refund bigint; v_after bigint;
begin
 select * into v from public.service_orders where id=p_order_id for update;
 if not found then return jsonb_build_object('ok',false,'error','order not found'); end if;
 if v.escrow_status in ('released','refunded','cancelled') then return jsonb_build_object('ok',false,'error','order closed'); end if;
 if v.released_amount>0 then v_refund:=(v.amount-v.released_amount-v.refunded_amount)+(v.platform_fee-v.fee_earned);
 else v_refund:=v.total_amount-v.refunded_amount; end if;
 if v_refund<0 then raise exception 'invalid refund'; end if;
 if v_refund>0 then
  update public.wallets set available_funds=available_funds+v_refund,updated_at=now() where user_id=v.buyer_id returning available_funds into v_after;
  if not found then raise exception 'buyer wallet missing'; end if;
  insert into public.wallet_historical_ledger(user_id,currency_code,entry_type,amount_mutated,running_balance_snapshot,associated_reference_id,description)
  values(v.buyer_id,v.currency_code,'REVERSAL',v_refund,v_after,v.id,coalesce(p_reason,'Service escrow refund'));
 end if;
 update public.service_orders set refunded_amount=refunded_amount+(amount-released_amount-refunded_amount),
  escrow_status=case when released_amount>0 then 'deadline_refunded' else 'refunded' end,
  refunded_at=now(),dispute_hold=false,updated_at=now() where id=v.id;
 update public.service_order_milestones set status='refunded',refunded_at=now(),updated_at=now()
  where service_order_id=v.id and status not in ('released','refunded');
 return jsonb_build_object('ok',true,'refunded',v_refund);
end $$;

create or replace function public.buyer_confirm_service_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.service_orders%rowtype;
begin
 select * into v from public.service_orders where id=p_order_id for update;
 if not found or auth.uid() is distinct from v.buyer_id then return jsonb_build_object('ok',false,'error','buyer only'); end if;
 if v.escrow_status not in ('delivered','in_progress') or v.dispute_hold then return jsonb_build_object('ok',false,'error','order cannot be accepted'); end if;
 if exists(select 1 from public.service_order_milestones where service_order_id=v.id and status not in ('released','refunded')) then return jsonb_build_object('ok',false,'error','accept milestones individually'); end if;
 update public.service_orders set buyer_confirmed_received=true,buyer_confirmed_received_at=now(),
  escrow_status=case when released_amount=amount then 'released' else escrow_status end,updated_at=now() where id=v.id;
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.open_service_dispute(p_order_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.service_orders%rowtype; v_id uuid;
begin
 if auth.uid() is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 if p_reason is null or length(trim(p_reason))<10 then return jsonb_build_object('ok',false,'error','reason too short'); end if;
 select * into v from public.service_orders where id=p_order_id for update;
 if not found or auth.uid() not in (v.buyer_id,v.seller_id) then return jsonb_build_object('ok',false,'error','not your order'); end if;
 if v.escrow_status in ('released','refunded','cancelled','deadline_refunded') then return jsonb_build_object('ok',false,'error','order closed'); end if;
 update public.service_orders set escrow_status='disputed',dispute_hold=true,updated_at=now() where id=p_order_id;
 insert into public.order_disputes(order_id,order_type,raised_by,reason,status)
 values(p_order_id,'service',auth.uid(),trim(p_reason),'open') returning id into v_id;
 return jsonb_build_object('ok',true,'dispute_id',v_id);
end $$;

revoke all on function public.create_service_order(uuid,uuid,uuid,bigint,text,timestamptz,jsonb) from public,anon;
revoke all on function public.accept_service_order(uuid,timestamptz) from public,anon;
revoke all on function public.request_service_deadline_change(uuid,timestamptz) from public,anon;
revoke all on function public.approve_service_deadline_change(uuid) from public,anon;
revoke all on function public.submit_service_milestone(uuid,uuid,text,text) from public,anon;
revoke all on function public.approve_service_milestone(uuid,uuid) from public,anon;
revoke all on function public.request_service_revision(uuid,uuid,text) from public,anon;
revoke all on function public.refund_service_order(uuid,text) from public,anon,authenticated;
revoke all on function public.buyer_confirm_service_order(uuid) from public,anon;
revoke all on function public.open_service_dispute(uuid,text) from public,anon;
grant execute on function public.create_service_order(uuid,uuid,uuid,bigint,text,timestamptz,jsonb),
 public.accept_service_order(uuid,timestamptz),public.request_service_deadline_change(uuid,timestamptz),
 public.approve_service_deadline_change(uuid),public.submit_service_milestone(uuid,uuid,text,text),
 public.approve_service_milestone(uuid,uuid),public.request_service_revision(uuid,uuid,text),
 public.buyer_confirm_service_order(uuid),public.open_service_dispute(uuid,text) to authenticated;

-- Retire legacy overloads that referenced the removed Supabase service catalog.
revoke all on function public.create_service_order(uuid,uuid,text,boolean) from public,anon,authenticated;
revoke all on function public.accept_service_order(uuid) from public,anon,authenticated;
revoke all on function public.approve_service_delivery(uuid) from public,anon,authenticated;
