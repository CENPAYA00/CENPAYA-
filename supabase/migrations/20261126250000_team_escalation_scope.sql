-- Final permission scope for Vice Admin ticket oversight and team escalations.

create or replace function public.staff_list_tickets(p_scope text default 'all')
returns jsonb language plpgsql stable security definer set search_path=public
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_rows jsonb; v_allowed boolean:=false;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;
 if v_role in ('owner','super_admin') then v_allowed:=true;
 elsif v_role='support_agent' then
   select exists(select 1 from public.staff_invitations where accepted_by=v_uid and role='support_agent' and appointment_status='active') into v_allowed;
 elsif v_role='vice_admin' then
   select exists(select 1 from public.staff_invitations where accepted_by=v_uid and role='vice_admin' and appointment_status='active' and (permissions ? 'can_manage_tickets' or permissions ? 'can_manage_support_agents')) into v_allowed;
 end if;
 if not v_allowed then return jsonb_build_object('ok',false,'error','support ticket access permission required'); end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',t.id,'subject',t.subject,'status',t.status,'user_id',t.user_id,
  'username',(select username from public.users where id=t.user_id),
  'assigned_agent_id',t.assigned_agent_id,'assigned_to_me',t.assigned_agent_id=v_uid,
  'category',(select category_name from public.ticket_categories where id=t.category_id),
  'priority',(select handling_priority from public.ticket_categories where id=t.category_id),
  'created_at',t.created_at,'updated_at',t.updated_at,
  'unread',(select count(*) from public.ticket_messages m where m.ticket_id=t.id and m.read_by_staff=false)
 ) order by t.updated_at desc),'[]'::jsonb) into v_rows
 from public.platform_tickets t
 where t.status in ('open','in_progress')
 and (
   (p_scope='mine' and t.assigned_agent_id=v_uid)
   or (p_scope='all' and (v_role in ('owner','super_admin','vice_admin') or t.assigned_agent_id is null or t.assigned_agent_id=v_uid))
 );
 return jsonb_build_object('ok',true,'tickets',v_rows);
end;$function$;

create or replace function public.team_raise_escalation(
 p_reason text,p_level text,p_ticket_id uuid default null,p_task_id uuid default null,p_assigned_to uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_allowed boolean:=false; v_id uuid;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;
 if v_role='owner' or v_role='super_admin' then v_allowed:=true;
 elsif v_role='support_agent' then
   select exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_escalate') into v_allowed;
 elsif v_role='staff_member' then
   select exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_submit_reports') into v_allowed;
 elsif v_role='vice_admin' then
   select exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_manage_escalations') into v_allowed;
 end if;
 if not v_allowed then return jsonb_build_object('ok',false,'error','escalation permission required'); end if;
 if p_level is null or p_level not in ('vice_admin','super_admin','owner') or p_reason is null or char_length(trim(p_reason)) not between 5 and 5000 then
   return jsonb_build_object('ok',false,'error','invalid escalation');
 end if;
 if v_role in ('support_agent','staff_member') and p_level<>'vice_admin' then
   return jsonb_build_object('ok',false,'error','this role may escalate only to Vice Admin');
 end if;
 if v_role='vice_admin' and p_level not in ('super_admin','owner') then
   return jsonb_build_object('ok',false,'error','Vice Admin escalations must go to Super Admin or Owner');
 end if;
 if p_ticket_id is not null and not exists(select 1 from public.platform_tickets where id=p_ticket_id) then return jsonb_build_object('ok',false,'error','ticket not found'); end if;
 if p_task_id is not null and not exists(select 1 from public.team_tasks where id=p_task_id) then return jsonb_build_object('ok',false,'error','task not found'); end if;
 if p_task_id is not null and v_role='staff_member'
    and not exists(select 1 from public.team_tasks where id=p_task_id and assigned_to=v_uid) then
   return jsonb_build_object('ok',false,'error','you may escalate only your own assigned task');
 end if;
 if p_task_id is not null and v_role='support_agent'
    and not exists(select 1 from public.team_tasks where id=p_task_id and (assigned_to=v_uid or supervisor_id=v_uid)) then
   return jsonb_build_object('ok',false,'error','task is outside your supervision scope');
 end if;
 if p_ticket_id is not null and v_role='staff_member' then
   return jsonb_build_object('ok',false,'error','Staff Members must escalate through their assigned task or supervisor');
 end if;
 if p_ticket_id is not null and v_role='support_agent'
    and not exists(select 1 from public.platform_tickets where id=p_ticket_id and (assigned_agent_id is null or assigned_agent_id=v_uid)) then
   return jsonb_build_object('ok',false,'error','ticket is outside your support assignment');
 end if;
 insert into public.team_escalations(ticket_id,task_id,raised_by,assigned_to,escalation_level,reason)
 values(p_ticket_id,p_task_id,v_uid,p_assigned_to,p_level,trim(p_reason)) returning id into v_id;
 insert into public.admin_audit_log(actor_id,action,target_table,target_id,new_value)
 values(v_uid,'team_escalation_created','team_escalations',v_id,jsonb_build_object('level',p_level,'ticket_id',p_ticket_id,'task_id',p_task_id));
 return jsonb_build_object('ok',true,'escalation_id',v_id);
end;$function$;

grant execute on function public.staff_list_tickets(text) to authenticated;
grant execute on function public.team_raise_escalation(text,text,uuid,uuid,uuid) to authenticated;
