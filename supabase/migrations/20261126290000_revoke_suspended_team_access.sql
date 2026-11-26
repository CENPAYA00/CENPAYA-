-- Close every team-data path when an appointment is suspended or removed.

create or replace function public.is_active_team_member(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public,pg_temp
as $function$
 select exists(
  select 1 from public.users u
  where u.id=p_user_id and u.banned=false and (
   u.role in ('owner','super_admin') or
   (u.role in ('vice_admin','support_agent','staff_member') and exists(
     select 1 from public.staff_invitations i
     where i.accepted_by=u.id and i.role=u.role and i.appointment_status='active'
   ))
  )
 );
$function$;

create or replace function public.team_my_tasks()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_rows jsonb;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 if not public.is_active_team_member(v_uid) then return jsonb_build_object('ok',false,'error','active team appointment required'); end if;
 select role into v_role from public.users where id=v_uid and banned=false;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',t.id,'title',t.title,'description',t.description,'status',t.status,'due_at',t.due_at,
  'assigned_to',t.assigned_to,'assigned_by',t.assigned_by,'supervisor_id',t.supervisor_id,
  'department',(select name from public.team_departments where id=t.department_id),
  'created_at',t.created_at,'updated_at',t.updated_at,
  'updates',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'author_id',u.author_id,'update_type',u.update_type,'body',u.body,'attachment_url',u.attachment_url,'created_at',u.created_at) order by u.created_at),'[]'::jsonb) from public.team_task_updates u where u.task_id=t.id)
 ) order by t.due_at nulls last,t.created_at desc),'[]'::jsonb)
 into v_rows from public.team_tasks t
 where t.assigned_to=v_uid
    or (v_role in ('super_admin','owner'))
    or (v_role='vice_admin' and t.supervisor_id=v_uid and exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_manage_tasks'))
    or (v_role='support_agent' and t.supervisor_id=v_uid and exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_supervise_staff'));
 return jsonb_build_object('ok',true,'tasks',v_rows);
end;$function$;

create or replace function public.team_update_task(p_task_id uuid,p_status text,p_body text default null,p_attachment_url text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_task public.team_tasks%rowtype; v_role text; v_manager boolean:=false; v_supervisor boolean:=false;
begin
 if v_uid is null or not public.is_active_team_member(v_uid) then return jsonb_build_object('ok',false,'error','active team appointment required'); end if;
 select * into v_task from public.team_tasks where id=p_task_id for update;
 if v_task.id is null then return jsonb_build_object('ok',false,'error','task not found'); end if;
 select role into v_role from public.users where id=v_uid and banned=false;
 v_manager:=v_role in ('owner','super_admin') or (v_role='vice_admin' and exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_manage_tasks'));
 v_supervisor:=v_uid=v_task.supervisor_id and (
   v_role in ('owner','super_admin')
   or (v_role='vice_admin' and exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_manage_tasks'))
   or (v_role='support_agent' and exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_supervise_staff'))
 );
 if v_uid<>v_task.assigned_to and not v_supervisor and not v_manager then return jsonb_build_object('ok',false,'error','not authorized for this task'); end if;
 if v_uid=v_task.assigned_to and p_status not in ('todo','in_progress','blocked','submitted') then return jsonb_build_object('ok',false,'error','staff can only submit or update their own work'); end if;
 if v_uid<>v_task.assigned_to and p_status not in ('todo','in_progress','blocked','submitted','completed','cancelled') then return jsonb_build_object('ok',false,'error','invalid task status'); end if;
 if p_body is not null and char_length(p_body)>5000 then return jsonb_build_object('ok',false,'error','update too long'); end if;
 if p_attachment_url is not null and (char_length(p_attachment_url)>2048 or p_attachment_url !~ '^https://') then return jsonb_build_object('ok',false,'error','evidence must be a secure HTTPS link'); end if;
 update public.team_tasks set status=p_status,updated_at=now(),completed_at=case when p_status='completed' then now() when p_status<>'completed' then null else completed_at end where id=p_task_id;
 if p_body is not null or p_attachment_url is not null or p_status<>v_task.status then
  insert into public.team_task_updates(task_id,author_id,update_type,body,attachment_url)
  values(p_task_id,v_uid,case when p_status='submitted' then 'submission' when p_attachment_url is not null then 'evidence' when p_status<>v_task.status then 'status_change' else 'comment' end,nullif(trim(p_body),''),p_attachment_url);
 end if;
 insert into public.admin_audit_log(actor_id,action,target_user_id,target_table,target_id,old_value,new_value)
 values(v_uid,'team_task_updated',v_task.assigned_to,'team_tasks',p_task_id,jsonb_build_object('status',v_task.status),jsonb_build_object('status',p_status));
 return jsonb_build_object('ok',true);
end;$function$;

create or replace function public.team_list_conversations()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_rows jsonb;
begin
 if v_uid is null or not public.is_active_team_member(v_uid) then return jsonb_build_object('ok',false,'error','active team appointment required'); end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',c.id,'type',c.conversation_type,'title',c.title,'created_at',c.created_at,
  'last_message',(select body from public.team_messages m where m.conversation_id=c.id and m.deleted_at is null order by m.created_at desc limit 1),
  'last_message_at',(select max(created_at) from public.team_messages m where m.conversation_id=c.id)
 ) order by (select max(created_at) from public.team_messages m where m.conversation_id=c.id) desc nulls last),'[]'::jsonb)
 into v_rows from public.team_conversations c join public.team_conversation_members cm on cm.conversation_id=c.id
 where cm.user_id=v_uid and c.is_archived=false;
 return jsonb_build_object('ok',true,'conversations',v_rows);
end;$function$;

create or replace function public.team_get_messages(p_conversation_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_rows jsonb;
begin
 if v_uid is null or not public.is_active_team_member(v_uid) then return jsonb_build_object('ok',false,'error','active team appointment required'); end if;
 if not exists(select 1 from public.team_conversation_members where conversation_id=p_conversation_id and user_id=v_uid) then return jsonb_build_object('ok',false,'error','not a conversation member'); end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'sender_id',m.sender_id,'sender_name',u.username,'body',m.body,'attachment_url',m.attachment_url,'created_at',m.created_at) order by m.created_at),'[]'::jsonb)
 into v_rows from public.team_messages m join public.users u on u.id=m.sender_id
 where m.conversation_id=p_conversation_id and m.deleted_at is null;
 update public.team_conversation_members set last_read_at=now() where conversation_id=p_conversation_id and user_id=v_uid;
 return jsonb_build_object('ok',true,'messages',v_rows);
end;$function$;

create or replace function public.team_send_message(p_conversation_id uuid,p_body text,p_attachment_url text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_id uuid;
begin
 if v_uid is null or not public.is_active_team_member(v_uid) then return jsonb_build_object('ok',false,'error','active team appointment required'); end if;
 if p_body is null or char_length(trim(p_body))=0 or char_length(p_body)>10000 then return jsonb_build_object('ok',false,'error','invalid message'); end if;
 if p_attachment_url is not null and (char_length(p_attachment_url)>2048 or p_attachment_url !~ '^https://') then return jsonb_build_object('ok',false,'error','attachment must be a secure HTTPS link'); end if;
 if not exists(select 1 from public.team_conversation_members where conversation_id=p_conversation_id and user_id=v_uid) then return jsonb_build_object('ok',false,'error','not a conversation member'); end if;
 insert into public.team_messages(conversation_id,sender_id,body,attachment_url)
 values(p_conversation_id,v_uid,trim(p_body),p_attachment_url) returning id into v_id;
 return jsonb_build_object('ok',true,'message_id',v_id);
end;$function$;

create or replace function public.team_search_messages(p_query text,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_rows jsonb;
begin
 if v_uid is null or not public.is_active_team_member(v_uid) then return jsonb_build_object('ok',false,'error','active team appointment required'); end if;
 if p_query is null or char_length(trim(p_query))<2 then return jsonb_build_object('ok',false,'error','enter at least two search characters'); end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',m.id,'conversation_id',m.conversation_id,'conversation_title',c.title,
  'sender_id',m.sender_id,'sender_name',u.username,'body',m.body,'created_at',m.created_at
 ) order by m.created_at desc),'[]'::jsonb)
 into v_rows
 from (
  select * from public.team_messages
  where deleted_at is null and body ilike '%'||left(trim(p_query),100)||'%'
  order by created_at desc limit greatest(1,least(p_limit,100))
 ) m
 join public.team_conversation_members cm on cm.conversation_id=m.conversation_id and cm.user_id=v_uid
 join public.team_conversations c on c.id=m.conversation_id
 join public.users u on u.id=m.sender_id;
 return jsonb_build_object('ok',true,'results',v_rows);
end;$function$;

create or replace function public.team_my_notifications(p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_rows jsonb;
begin
 if v_uid is null or not public.is_active_team_member(v_uid) then return jsonb_build_object('ok',false,'error','active team appointment required'); end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'event_type',event_type,'title',title,'body',body,'entity_type',entity_type,'entity_id',entity_id,'read_at',read_at,'created_at',created_at) order by created_at desc),'[]'::jsonb)
 into v_rows from (select * from public.team_notifications where recipient_id=v_uid order by created_at desc limit greatest(1,least(p_limit,100))) n;
 return jsonb_build_object('ok',true,'notifications',v_rows);
end;$function$;

create or replace function public.team_mark_notification_read(p_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid();
begin
 if v_uid is null or not public.is_active_team_member(v_uid) then return jsonb_build_object('ok',false,'error','active team appointment required'); end if;
 update public.team_notifications set read_at=now() where id=p_id and recipient_id=v_uid;
 if not found then return jsonb_build_object('ok',false,'error','notification not found'); end if;
 return jsonb_build_object('ok',true);
end;$function$;

create or replace function public.notify_team_message()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $function$
begin
 insert into public.team_notifications(recipient_id,event_type,title,body,entity_type,entity_id)
 select cm.user_id,'team_message','New team message',left(new.body,240),'team_conversation',new.conversation_id
 from public.team_conversation_members cm
 where cm.conversation_id=new.conversation_id and cm.user_id<>new.sender_id
   and public.is_active_team_member(cm.user_id);
 return new;
end;$function$;

create or replace function public.notify_team_task_update()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_assigned uuid; v_supervisor uuid; v_title text;
begin
 select assigned_to,supervisor_id,title into v_assigned,v_supervisor,v_title from public.team_tasks where id=new.task_id;
 insert into public.team_notifications(recipient_id,event_type,title,body,entity_type,entity_id)
 select distinct target.user_id,'task_update','Task update: '||coalesce(v_title,'Team task'),coalesce(new.body,new.update_type),'team_task',new.task_id
 from (values(v_assigned),(v_supervisor)) as target(user_id)
 where target.user_id is not null and target.user_id<>new.author_id
   and public.is_active_team_member(target.user_id);
 return new;
end;$function$;

create or replace function public.notify_team_escalation()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $function$
begin
 if new.assigned_to is not null and public.is_active_team_member(new.assigned_to) then
  insert into public.team_notifications(recipient_id,event_type,title,body,entity_type,entity_id)
  values(new.assigned_to,'escalation','New escalation',left(new.reason,240),'team_escalation',new.id);
 else
  insert into public.team_notifications(recipient_id,event_type,title,body,entity_type,entity_id)
  select u.id,'escalation','New '||replace(new.escalation_level,'_',' ')||' escalation',left(new.reason,240),'team_escalation',new.id
  from public.users u
  where ((new.escalation_level='vice_admin' and u.role='vice_admin')
     or (new.escalation_level='super_admin' and u.role='super_admin')
     or (new.escalation_level='owner' and u.role='owner'))
     and public.is_active_team_member(u.id);
 end if;
 return new;
end;$function$;

grant execute on function public.is_active_team_member(uuid) to authenticated;
grant execute on function public.team_list_conversations() to authenticated;
grant execute on function public.team_get_messages(uuid) to authenticated;
grant execute on function public.team_send_message(uuid,text,text) to authenticated;
grant execute on function public.team_search_messages(text,integer) to authenticated;
grant execute on function public.team_my_notifications(integer) to authenticated;
grant execute on function public.team_mark_notification_read(uuid) to authenticated;
