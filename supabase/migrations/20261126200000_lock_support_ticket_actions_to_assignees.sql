-- Tighten support-agent ticket isolation.
-- Agents can preview/claim unassigned tickets, but only the assignee (or Owner/Super Admin)
-- can reply to, resolve, close, or otherwise mutate an assigned ticket.

alter table public.ticket_messages
  drop constraint if exists ticket_messages_sender_role_check;
alter table public.ticket_messages
  add constraint ticket_messages_sender_role_check
  check (sender_role in ('user','support','admin'));

create or replace function public.get_ticket_thread(p_ticket_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_ticket public.platform_tickets%rowtype;
  v_messages jsonb;
  v_is_elevated boolean;
  v_is_support boolean;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  select * into v_ticket from public.platform_tickets where id=p_ticket_id;
  if v_ticket.id is null then return jsonb_build_object('ok',false,'error','not found'); end if;

  v_is_elevated := public.is_owner() or public.is_super_admin();
  v_is_support := public.is_support_or_admin() or exists(select 1 from public.staff_invitations where accepted_by=v_uid and role='vice_admin' and appointment_status='active' and (permissions ? 'can_manage_tickets' or permissions ? 'can_manage_support_agents'));
  if v_ticket.user_id <> v_uid and not v_is_elevated
     and not (v_is_support and (v_ticket.assigned_agent_id is null or v_ticket.assigned_agent_id=v_uid)) then
    return jsonb_build_object('ok',false,'error','not authorized');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'sender_id',m.sender_id,'sender_role',m.sender_role,
    'sender_username',(select username from public.users where id=m.sender_id),
    'body',m.body,'created_at',m.created_at
  ) order by m.created_at),'[]'::jsonb)
  into v_messages from public.ticket_messages m where m.ticket_id=p_ticket_id;

  return jsonb_build_object(
    'ok',true,
    'ticket',jsonb_build_object(
      'id',v_ticket.id,'subject',v_ticket.subject,'status',v_ticket.status,
      'category',(select category_name from public.ticket_categories where id=v_ticket.category_id),
      'user_id',v_ticket.user_id,
      'user_username',(select username from public.users where id=v_ticket.user_id),
      'assigned_agent_id',v_ticket.assigned_agent_id,
      'created_at',v_ticket.created_at
    ),
    'messages',v_messages
  );
end;
$function$;

create or replace function public.send_ticket_message(p_ticket_id uuid,p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_assignee uuid;
  v_is_support boolean;
  v_is_elevated boolean;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  if p_body is null or char_length(trim(p_body))=0 or char_length(p_body)>10000 then
    return jsonb_build_object('ok',false,'error','invalid message');
  end if;

  select user_id,assigned_agent_id into v_owner,v_assignee
  from public.platform_tickets where id=p_ticket_id for update;
  if v_owner is null then return jsonb_build_object('ok',false,'error','ticket not found'); end if;

  v_is_support := public.is_support_or_admin();
  v_is_elevated := public.is_owner() or public.is_super_admin();
  if v_owner <> v_uid and not v_is_support then
    return jsonb_build_object('ok',false,'error','not authorized');
  end if;
  if v_is_support and not v_is_elevated and v_assignee is distinct from v_uid then
    return jsonb_build_object('ok',false,'error','claim this ticket before replying');
  end if;

  insert into public.ticket_messages(ticket_id,sender_id,sender_role,body,read_by_user,read_by_staff)
  values(p_ticket_id,v_uid,case when v_is_support then 'support' else 'user' end,trim(p_body),not v_is_support,v_is_support);

  update public.platform_tickets
     set updated_at=now(),
         status=case when v_is_support and status='open' then 'in_progress' else status end
   where id=p_ticket_id;
  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function public.set_ticket_status(p_ticket_id uuid,p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_assignee uuid;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  if not (public.is_support_or_admin() or exists(select 1 from public.staff_invitations where accepted_by=v_uid and role='vice_admin' and appointment_status='active' and permissions ? 'can_manage_tickets')) then return jsonb_build_object('ok',false,'error','staff only'); end if;
  if p_status not in ('open','in_progress','resolved','closed') then
    return jsonb_build_object('ok',false,'error','invalid status');
  end if;

  select assigned_agent_id into v_assignee
  from public.platform_tickets where id=p_ticket_id for update;
  if not found then return jsonb_build_object('ok',false,'error','ticket not found'); end if;
  if not (public.is_owner() or public.is_super_admin())
     and v_assignee is distinct from v_uid then
    return jsonb_build_object('ok',false,'error','claim this ticket before changing its status');
  end if;

  update public.platform_tickets set status=p_status,updated_at=now() where id=p_ticket_id;
  return jsonb_build_object('ok',true);
end;
$function$;

grant execute on function public.get_ticket_thread(uuid) to authenticated;
grant execute on function public.send_ticket_message(uuid,text) to authenticated;
grant execute on function public.set_ticket_status(uuid,text) to authenticated;
