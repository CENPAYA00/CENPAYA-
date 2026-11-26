-- Team task, communication, escalation and oversight RPCs.
-- All access is scoped to accepted, active appointments and audited actions.

create or replace function public.team_my_tasks()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_rows jsonb;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false;
 if v_role not in ('staff_member','support_agent','vice_admin','super_admin','owner') then return jsonb_build_object('ok',false,'error','team role required'); end if;
 if v_role in ('staff_member','support_agent','vice_admin') and not exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active') then return jsonb_build_object('ok',false,'error','appointment inactive'); end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',t.id,'title',t.title,'description',t.description,'status',t.status,'due_at',t.due_at,
  'assigned_to',t.assigned_to,'assigned_by',t.assigned_by,'supervisor_id',t.supervisor_id,
  'created_at',t.created_at,'updated_at',t.updated_at,
  'updates',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'author_id',u.author_id,'update_type',u.update_type,'body',u.body,'attachment_url',u.attachment_url,'created_at',u.created_at) order by u.created_at),'[]'::jsonb) from public.team_task_updates u where u.task_id=t.id)
 ) order by t.due_at nulls last,t.created_at desc),'[]'::jsonb)
 into v_rows from public.team_tasks t
 where t.assigned_to=v_uid
    or (v_role in ('vice_admin','super_admin','owner') and (t.supervisor_id=v_uid or v_role in ('super_admin','owner')))
    or (v_role='support_agent' and exists(select 1 from public.staff_invitations i where i.accepted_by=v_uid and i.appointment_status='active' and i.permissions ? 'can_supervise_staff') and t.supervisor_id=v_uid);
 return jsonb_build_object('ok',true,'tasks',v_rows);
end;$function$;

create or replace function public.team_assign_task(
 p_title text,p_description text,p_assigned_to uuid,p_due_at timestamptz default null,p_department_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_id uuid; v_allowed boolean:=false;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false;
 if v_role in ('owner','super_admin') then v_allowed:=true;
 elsif v_role='vice_admin' then
   select exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_manage_tasks') into v_allowed;
 elsif v_role='support_agent' then
   select exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_supervise_staff') into v_allowed;
 end if;
 if not v_allowed then return jsonb_build_object('ok',false,'error','task assignment permission required'); end if;
 if p_title is null or char_length(trim(p_title)) not between 3 and 160 then return jsonb_build_object('ok',false,'error','task title must be 3-160 characters'); end if;
 if not exists(select 1 from public.users where id=p_assigned_to and role='staff_member' and banned=false)
    or not exists(select 1 from public.staff_invitations where accepted_by=p_assigned_to and appointment_status='active') then
   return jsonb_build_object('ok',false,'error','assignee is not an active Staff Member');
 end if;
 insert into public.team_tasks(title,description,assigned_to,assigned_by,supervisor_id,due_at,department_id)
 values(trim(p_title),nullif(trim(p_description),''),p_assigned_to,v_uid,v_uid,p_due_at,p_department_id)
 returning id into v_id;
 insert into public.team_task_updates(task_id,author_id,update_type,body)
 values(v_id,v_uid,'status_change','Task assigned');
 insert into public.admin_audit_log(actor_id,action,target_user_id,target_table,target_id,new_value)
 values(v_uid,'team_task_assigned',p_assigned_to,'team_tasks',v_id,jsonb_build_object('title',p_title,'due_at',p_due_at));
 return jsonb_build_object('ok',true,'task_id',v_id);
end;$function$;

create or replace function public.team_update_task(p_task_id uuid,p_status text,p_body text default null,p_attachment_url text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_task public.team_tasks%rowtype; v_role text; v_manager boolean:=false;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select * into v_task from public.team_tasks where id=p_task_id for update;
 if v_task.id is null then return jsonb_build_object('ok',false,'error','task not found'); end if;
 select role into v_role from public.users where id=v_uid and banned=false;
 v_manager:=v_role in ('owner','super_admin','vice_admin') and (v_role<>'vice_admin' or exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_manage_tasks'));
 if v_uid<>v_task.assigned_to and v_uid<>v_task.supervisor_id and not v_manager then return jsonb_build_object('ok',false,'error','not authorized for this task'); end if;
 if v_uid=v_task.assigned_to and p_status not in ('todo','in_progress','blocked','submitted') then return jsonb_build_object('ok',false,'error','staff can only submit or update their own work'); end if;
 if v_uid<>v_task.assigned_to and p_status not in ('todo','in_progress','blocked','submitted','completed','cancelled') then return jsonb_build_object('ok',false,'error','invalid task status'); end if;
 if p_body is not null and char_length(p_body)>5000 then return jsonb_build_object('ok',false,'error','update too long'); end if;
 update public.team_tasks set status=p_status,updated_at=now(),completed_at=case when p_status='completed' then now() when p_status<>'completed' then null else completed_at end where id=p_task_id;
 if p_body is not null or p_attachment_url is not null or p_status<>v_task.status then
  insert into public.team_task_updates(task_id,author_id,update_type,body,attachment_url)
  values(p_task_id,v_uid,case when p_status='submitted' then 'submission' when p_attachment_url is not null then 'evidence' when p_status<>v_task.status then 'status_change' else 'comment' end,nullif(trim(p_body),''),p_attachment_url);
 end if;
 insert into public.admin_audit_log(actor_id,action,target_user_id,target_table,target_id,old_value,new_value)
 values(v_uid,'team_task_updated',v_task.assigned_to,'team_tasks',p_task_id,jsonb_build_object('status',v_task.status),jsonb_build_object('status',p_status));
 return jsonb_build_object('ok',true);
end;$function$;

create or replace function public.team_admin_overview()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_can boolean:=false; v_result jsonb;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false;
 if v_role in ('owner','super_admin') then v_can:=true;
 elsif v_role='vice_admin' then select exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_view_team_metrics') into v_can;
 end if;
 if not v_can then return jsonb_build_object('ok',false,'error','team oversight permission required'); end if;
 select jsonb_build_object(
  'active_members',(select count(*) from public.staff_invitations where appointment_status='active'),
  'pending_appointments',(select count(*) from public.staff_invitations where appointment_status='pending'),
  'suspended_members',(select count(*) from public.staff_invitations where appointment_status='suspended'),
  'tasks_pending',(select count(*) from public.team_tasks where status in ('todo','in_progress','blocked','submitted')),
  'tasks_overdue',(select count(*) from public.team_tasks where due_at<now() and status not in ('completed','cancelled')),
  'tasks_completed',(select count(*) from public.team_tasks where status='completed' and completed_at>=now()-interval '30 days'),
  'tasks_completed_today',(select count(*) from public.team_tasks where status='completed' and completed_at>=date_trunc('day',now())),
  'tasks_completed_week',(select count(*) from public.team_tasks where status='completed' and completed_at>=date_trunc('week',now())),
  'tasks_completed_month',(select count(*) from public.team_tasks where status='completed' and completed_at>=date_trunc('month',now())),
  'member_performance',(select coalesce(jsonb_agg(to_jsonb(perf) order by perf.username),'[]'::jsonb) from (
    select u.id as user_id,u.username,count(t.id) as assigned,
      count(t.id) filter(where t.status='completed') as completed,
      count(t.id) filter(where t.due_at<now() and t.status not in ('completed','cancelled')) as overdue
    from public.users u join public.team_tasks t on t.assigned_to=u.id
    group by u.id,u.username order by u.username limit 50
  ) perf),
  'open_escalations',(select count(*) from public.team_escalations where status in ('open','in_progress')),
  'tickets_open',(select count(*) from public.platform_tickets where status in ('open','in_progress')),
  'recent_audit',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'actor_id',a.actor_id,'action',a.action,'target_user_id',a.target_user_id,'created_at',a.created_at,'new_value',a.new_value) order by a.created_at desc),'[]'::jsonb) from (select * from public.admin_audit_log where target_table in ('staff_invitations','team_tasks','team_escalations') order by created_at desc limit 30) a)
 ) into v_result;
 return jsonb_build_object('ok',true,'overview',v_result);
end;$function$;

create or replace function public.team_create_conversation(
 p_type text,p_title text,p_member_ids uuid[],p_department_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_id uuid; v_role text;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false;
 if v_role not in ('owner','super_admin','vice_admin','support_agent','staff_member') then return jsonb_build_object('ok',false,'error','team access required'); end if;
 if p_type not in ('direct','department','announcement','escalation') then return jsonb_build_object('ok',false,'error','invalid conversation type'); end if;
 if p_type in ('announcement','department') and v_role not in ('owner','super_admin','vice_admin') then return jsonb_build_object('ok',false,'error','supervisor permission required'); end if;
 insert into public.team_conversations(conversation_type,title,department_id,created_by)
 values(p_type,nullif(trim(p_title),''),p_department_id,v_uid) returning id into v_id;
 insert into public.team_conversation_members(conversation_id,user_id,added_by)
 values(v_id,v_uid,v_uid) on conflict do nothing;
 insert into public.team_conversation_members(conversation_id,user_id,added_by)
 select v_id,m,v_uid from unnest(coalesce(p_member_ids,'{}'::uuid[])) m
 join public.users u on u.id=m and u.role in ('owner','super_admin','vice_admin','support_agent','staff_member') and u.banned=false
 on conflict do nothing;
 return jsonb_build_object('ok',true,'conversation_id',v_id);
end;$function$;

create or replace function public.team_list_conversations()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_rows jsonb;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',c.id,'type',c.conversation_type,'title',c.title,'created_at',c.created_at,
  'last_message',(select body from public.team_messages m where m.conversation_id=c.id and m.deleted_at is null order by m.created_at desc limit 1),
  'last_message_at',(select max(created_at) from public.team_messages m where m.conversation_id=c.id)
 ) order by (select max(created_at) from public.team_messages m where m.conversation_id=c.id) desc nulls last),'[]'::jsonb)
 into v_rows from public.team_conversations c join public.team_conversation_members cm on cm.conversation_id=c.id
 where cm.user_id=v_uid and c.is_archived=false;
 return jsonb_build_object('ok',true,'conversations',v_rows);
end;$function$;

create or replace function public.team_send_message(p_conversation_id uuid,p_body text,p_attachment_url text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_id uuid;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 if p_body is null or char_length(trim(p_body))=0 or char_length(p_body)>10000 then return jsonb_build_object('ok',false,'error','invalid message'); end if;
 if not exists(select 1 from public.team_conversation_members where conversation_id=p_conversation_id and user_id=v_uid) then return jsonb_build_object('ok',false,'error','not a conversation member'); end if;
 insert into public.team_messages(conversation_id,sender_id,body,attachment_url)
 values(p_conversation_id,v_uid,trim(p_body),p_attachment_url) returning id into v_id;
 return jsonb_build_object('ok',true,'message_id',v_id);
end;$function$;

create or replace function public.team_raise_escalation(p_reason text,p_level text,p_ticket_id uuid default null,p_task_id uuid default null,p_assigned_to uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_id uuid;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false;
 if v_role not in ('support_agent','staff_member','vice_admin','super_admin','owner') then return jsonb_build_object('ok',false,'error','team access required'); end if;
 if v_role='staff_member' and not exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active') then return jsonb_build_object('ok',false,'error','appointment inactive'); end if;
 if p_level is null or p_level not in ('vice_admin','super_admin','owner') or p_reason is null or char_length(trim(p_reason)) not between 5 and 5000 then return jsonb_build_object('ok',false,'error','invalid escalation'); end if;
 if p_level='owner' and v_role not in ('vice_admin','super_admin','owner') then return jsonb_build_object('ok',false,'error','owner escalation only for supervisors'); end if;
 insert into public.team_escalations(ticket_id,task_id,raised_by,assigned_to,escalation_level,reason)
 values(p_ticket_id,p_task_id,v_uid,p_assigned_to,p_level,trim(p_reason)) returning id into v_id;
 insert into public.admin_audit_log(actor_id,action,target_table,target_id,new_value)
 values(v_uid,'team_escalation_created','team_escalations',v_id,jsonb_build_object('level',p_level,'ticket_id',p_ticket_id,'task_id',p_task_id));
 return jsonb_build_object('ok',true,'escalation_id',v_id);
end;$function$;

create or replace function public.team_list_escalations()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_rows jsonb;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false;
 if v_role not in ('vice_admin','super_admin','owner') then return jsonb_build_object('ok',false,'error','supervisor access required'); end if;
 select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]'::jsonb) into v_rows
 from public.team_escalations e
 where (v_role in ('super_admin','owner') or e.escalation_level in ('vice_admin','super_admin') or e.assigned_to=v_uid);
 return jsonb_build_object('ok',true,'escalations',v_rows);
end;$function$;

create or replace function public.team_update_escalation(p_id uuid,p_status text,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false;
 if v_role not in ('vice_admin','super_admin','owner') then return jsonb_build_object('ok',false,'error','supervisor access required'); end if;
 if p_status is null or p_status not in ('open','in_progress','resolved','dismissed') then return jsonb_build_object('ok',false,'error','invalid status'); end if;
 update public.team_escalations set status=p_status,resolution_note=nullif(trim(p_note),''),updated_at=now(),resolved_at=case when p_status in ('resolved','dismissed') then now() else null end
 where id=p_id and (v_role in ('super_admin','owner') or assigned_to=v_uid or escalation_level='vice_admin');
 if not found then return jsonb_build_object('ok',false,'error','escalation not found or not authorized'); end if;
 insert into public.admin_audit_log(actor_id,action,target_table,target_id,new_value)
 values(v_uid,'team_escalation_'||p_status,'team_escalations',p_id,jsonb_build_object('note',p_note));
 return jsonb_build_object('ok',true);
end;$function$;

grant execute on function public.team_my_tasks() to authenticated;
grant execute on function public.team_assign_task(text,text,uuid,timestamptz,uuid) to authenticated;
grant execute on function public.team_update_task(uuid,text,text,text) to authenticated;
grant execute on function public.team_admin_overview() to authenticated;
grant execute on function public.team_create_conversation(text,text,uuid[],uuid) to authenticated;
grant execute on function public.team_list_conversations() to authenticated;
grant execute on function public.team_send_message(uuid,text,text) to authenticated;
grant execute on function public.team_raise_escalation(text,text,uuid,uuid,uuid) to authenticated;
grant execute on function public.team_list_escalations() to authenticated;
grant execute on function public.team_update_escalation(uuid,text,text) to authenticated;
