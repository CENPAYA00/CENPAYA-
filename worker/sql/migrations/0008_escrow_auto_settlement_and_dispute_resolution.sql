-- Settlement hardening for both physical goods and freelance services.

create or replace function public.refund_order_escrow(p_order_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.orders%rowtype; v_after bigint; v_refund bigint;
begin
 select * into v from public.orders where id=p_order_id for update;
 if not found then return jsonb_build_object('ok',false,'error','order not found'); end if;
 if v.escrow_status not in ('hold','disputed') then return jsonb_build_object('ok',false,'error','order is not refundable'); end if;
 v_refund:=coalesce(v.total_amount,v.amount+coalesce(v.platform_fee,0));
 update public.wallets set available_funds=available_funds+v_refund,updated_at=now()
  where user_id=v.buyer_id returning available_funds into v_after;
 if not found then raise exception 'buyer wallet missing'; end if;
 update public.orders set escrow_status='auto_refunded_48h',dispute_hold=false,updated_at=now() where id=p_order_id;
 insert into public.wallet_historical_ledger(user_id,currency_code,entry_type,amount_mutated,running_balance_snapshot,associated_reference_id,description)
 values(v.buyer_id,coalesce(v.currency_code,'XAF'),'REVERSAL',v_refund,v_after,p_order_id,coalesce(nullif(trim(p_reason),''),'Product escrow refund'));
 return jsonb_build_object('ok',true,'refunded',v_refund);
end $$;
revoke all on function public.refund_order_escrow(uuid,text) from public,anon,authenticated;

create or replace function public.auto_release_service_milestone(p_order_id uuid,p_milestone_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v public.service_orders%rowtype; m public.service_order_milestones%rowtype; v_after bigint; v_fee bigint;
begin
 select * into v from public.service_orders where id=p_order_id for update;
 select * into m from public.service_order_milestones where id=p_milestone_id and service_order_id=p_order_id for update;
 if not found or m.status<>'submitted' or m.submitted_at>now()-interval '72 hours' or v.dispute_hold
  or v.escrow_status not in ('delivered','in_progress','revision_requested') then return; end if;
 if m.amount>v.amount-v.released_amount-v.refunded_amount then raise exception 'milestone exceeds remaining escrow'; end if;
 if v.released_amount+m.amount=v.amount then v_fee:=v.platform_fee-v.fee_earned;
 else v_fee:=least(v.platform_fee-v.fee_earned,round(v.platform_fee*m.amount::numeric/v.amount)::bigint); end if;
 update public.wallets set available_funds=available_funds+m.amount,updated_at=now()
  where user_id=v.seller_id returning available_funds into v_after;
 if not found then raise exception 'seller wallet missing'; end if;
 update public.service_orders set released_amount=released_amount+m.amount,fee_earned=fee_earned+v_fee,
  escrow_status=case when released_amount+m.amount=amount then 'released' else 'in_progress' end,
  buyer_confirmed_received=(released_amount+m.amount=amount),
  buyer_confirmed_received_at=case when released_amount+m.amount=amount then now() else buyer_confirmed_received_at end,
  updated_at=now() where id=v.id;
 update public.service_order_milestones set status='released',accepted_at=now(),released_at=now(),fee_allocated=v_fee,updated_at=now() where id=m.id;
 insert into public.wallet_historical_ledger(user_id,currency_code,entry_type,amount_mutated,running_balance_snapshot,associated_reference_id,description)
 values(v.seller_id,v.currency_code,'ESCROW_PAYOUT',m.amount,v_after,v.id,'Freelance milestone auto-release after 72-hour review');
 if v_fee>0 then insert into public.system_gains(source_type,source_id,amount_earned,currency_code)
  values('service_order',v.id,v_fee,v.currency_code)
  on conflict(source_type,source_id) do update set amount_earned=public.system_gains.amount_earned+excluded.amount_earned; end if;
end $$;
revoke all on function public.auto_release_service_milestone(uuid,uuid) from public,anon,authenticated;

create or replace function public.escrow_auto_48h()
returns void language plpgsql security definer set search_path=public as $$
declare r record;
begin
 for r in select id from public.orders where escrow_status='hold' and dispute_hold=false
  and delivery_proof_verified=true and auto_release_deadline_at is not null
  and auto_release_deadline_at<=now() and buyer_confirmed_received=false
  order by auto_release_deadline_at for update skip locked
 loop
  begin perform public.release_order_escrow(r.id);
  exception when others then insert into public.escrow_auto_release_failures(order_id,attempted_status,error_message) values(r.id,'released',sqlerrm); end;
 end loop;
 for r in select id from public.service_orders where escrow_status in ('awaiting_acceptance','in_progress','revision_requested')
  and dispute_hold=false and confirmed_delivery_at<=now() order by confirmed_delivery_at for update skip locked
 loop
  begin perform public.refund_service_order(r.id,'seller_missed_confirmed_delivery_deadline');
  exception when others then insert into public.escrow_auto_release_failures(order_id,attempted_status,error_message) values(r.id,'deadline_refunded',sqlerrm); end;
 end loop;
 for r in select m.service_order_id,m.id milestone_id from public.service_order_milestones m
  join public.service_orders s on s.id=m.service_order_id
  where m.status='submitted' and m.submitted_at<=now()-interval '72 hours'
   and s.dispute_hold=false and s.escrow_status in ('delivered','in_progress','revision_requested')
  order by m.submitted_at for update of m skip locked
 loop
  begin perform public.auto_release_service_milestone(r.service_order_id,r.milestone_id);
  exception when others then insert into public.escrow_auto_release_failures(order_id,attempted_status,error_message) values(r.service_order_id,'service_milestone_auto_release',sqlerrm); end;
 end loop;
end $$;

create or replace function public.admin_resolve_dispute(p_dispute_id uuid,p_outcome text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d public.order_disputes%rowtype; v public.service_orders%rowtype; r jsonb;
begin
 if not (public.is_super_admin() or public.is_support_or_admin()) then return jsonb_build_object('ok',false,'error','only staff'); end if;
 if p_outcome not in ('buyer_wins','seller_wins','split','withdrawn') then return jsonb_build_object('ok',false,'error','invalid outcome'); end if;
 select * into d from public.order_disputes where id=p_dispute_id for update;
 if not found or d.status='resolved' then return jsonb_build_object('ok',false,'error','dispute not found or resolved'); end if;
 if d.order_type='service' then
  select * into v from public.service_orders where id=d.order_id for update;
  if not found then return jsonb_build_object('ok',false,'error','service order missing'); end if;
  if p_outcome in ('buyer_wins','withdrawn') then r:=public.refund_service_order(v.id,coalesce(p_notes,'dispute resolved for buyer'));
  elsif p_outcome='seller_wins' then update public.service_orders set dispute_hold=false,escrow_status='in_progress',updated_at=now() where id=v.id;
  else return jsonb_build_object('ok',false,'error','split service dispute requires explicit milestone settlement'); end if;
 else
  if p_outcome='buyer_wins' then r:=public.refund_order_escrow(d.order_id,coalesce(p_notes,'dispute resolved for buyer'));
  elsif p_outcome='seller_wins' then update public.orders set dispute_hold=false where id=d.order_id; perform public.release_order_escrow(d.order_id);
  elsif p_outcome='withdrawn' then update public.orders set dispute_hold=false,escrow_status='hold' where id=d.order_id and escrow_status='disputed';
  else return jsonb_build_object('ok',false,'error','split product dispute requires explicit partial settlement'); end if;
 end if;
 update public.order_disputes set status='resolved',
  outcome=case when p_outcome='seller_wins' then 'seller_wins' when p_outcome='withdrawn' then 'withdrawn' else 'buyer_wins' end,
  resolved_by=auth.uid(),resolved_at=now(),updated_at=now() where id=p_dispute_id;
 insert into public.admin_audit_log(actor_id,action,target_table,target_id,new_value)
 values(auth.uid(),'resolve_dispute','order_disputes',p_dispute_id,jsonb_build_object('outcome',p_outcome,'notes',p_notes));
 return jsonb_build_object('ok',true,'settlement',r);
end $$;

create or replace function public.admin_escrow_action(p_kind text,p_id uuid,p_action text,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_order public.service_orders%rowtype; r jsonb;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 if not (public.is_super_admin() or public.is_owner()) then return jsonb_build_object('ok',false,'error','staff only'); end if;
 if p_reason is null or length(trim(p_reason))<10 then return jsonb_build_object('ok',false,'error','reason required'); end if;
 if p_kind not in ('order','service') or p_action not in ('release','refund','cancel','dispute') then return jsonb_build_object('ok',false,'error','invalid action'); end if;
 if p_kind='service' then
  select * into v_order from public.service_orders where id=p_id for update;
  if not found then return jsonb_build_object('ok',false,'error','service order not found'); end if;
  if p_action in ('refund','cancel') then r:=public.refund_service_order(p_id,p_reason);
  elsif p_action='dispute' then update public.service_orders set escrow_status='disputed',dispute_hold=true,updated_at=now() where id=p_id;
  else return jsonb_build_object('ok',false,'error','admin release cannot bypass buyer review'); end if;
 else
  if p_action in ('refund','cancel') then r:=public.refund_order_escrow(p_id,p_reason);
  elsif p_action='release' then update public.orders set buyer_confirmed_received=true,buyer_confirmed_received_at=now() where id=p_id; perform public.release_order_escrow(p_id);
  else update public.orders set dispute_hold=true,escrow_status='disputed' where id=p_id and escrow_status='hold'; end if;
 end if;
 insert into public.admin_audit_log(actor_id,action,target_table,target_id,new_value)
 values(v_uid,'escrow_action',p_kind,p_id,jsonb_build_object('action',p_action,'reason',p_reason));
 return jsonb_build_object('ok',true,'settlement',r);
end $$;
