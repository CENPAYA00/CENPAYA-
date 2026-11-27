-- The Lead Engineer coordinates engineering tasks only; app-role authority remains unchanged.

create or replace function public.engineering_assign_task(
  p_title text,p_description text,p_assigned_to uuid,p_due_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_task_id uuid;
  v_is_lead boolean:=false;
begin
  select role into v_role from public.users
  where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;

  if v_uid is null then
    return jsonb_build_object('ok',false,'error','not authenticated');
  end if;

  v_is_lead:=exists(
    select 1 from public.engineering_appointments
    where user_id=v_uid and status='active' and is_lead
  );

  if v_role not in ('owner','super_admin') and not v_is_lead then
    return jsonb_build_object('ok',false,'error','Owner, Super Admin or Lead Engineer authority required');
  end if;

  if p_title is null or char_length(trim(p_title)) not between 3 and 160 then
    return jsonb_build_object('ok',false,'error','Task title must be 3-160 characters');
  end if;

  if not public.is_active_team_member(p_assigned_to)
     or not exists(select 1 from public.engineering_appointments where user_id=p_assigned_to and status='active') then
    return jsonb_build_object('ok',false,'error','Assignee has no active engineering appointment');
  end if;

  if v_is_lead and v_role not in ('owner','super_admin')
     and not exists(select 1 from public.engineering_appointments where user_id=p_assigned_to and status='active') then
    return jsonb_build_object('ok',false,'error','Lead Engineer can assign only engineering members');
  end if;

  insert into public.team_tasks(title,description,assigned_to,assigned_by,supervisor_id,due_at)
  values(trim(p_title),nullif(trim(p_description),''),p_assigned_to,v_uid,v_uid,p_due_at)
  returning id into v_task_id;

  insert into public.team_task_updates(task_id,author_id,update_type,body)
  values(v_task_id,v_uid,'status_change','Engineering task assigned');

  insert into public.admin_audit_log(actor_id,action,target_user_id,target_table,target_id,new_value)
  values(v_uid,'engineering_task_assigned',p_assigned_to,'team_tasks',v_task_id,
    jsonb_build_object('title',p_title,'due_at',p_due_at,'assigned_by_lead',v_is_lead));

  return jsonb_build_object('ok',true,'task_id',v_task_id);
end;
$function$;

create or replace function public.team_my_tasks()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_rows jsonb; v_engineering_lead boolean:=false;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 if not public.is_active_team_member(v_uid) then return jsonb_build_object('ok',false,'error','active team appointment required'); end if;
 select role into v_role from public.users where id=v_uid and banned=false;
 v_engineering_lead:=exists(select 1 from public.engineering_appointments where user_id=v_uid and status='active' and is_lead);
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
    or (v_role='vice_admin' and exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_manage_tasks'))
    or (v_role='support_agent' and t.supervisor_id=v_uid and exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_supervise_staff'))
    or (v_engineering_lead and t.supervisor_id=v_uid and exists(
      select 1 from public.engineering_appointments ea where ea.user_id=t.assigned_to and ea.status='active'
    ));
 return jsonb_build_object('ok',true,'tasks',v_rows);
end;
$function$;

create or replace function public.team_update_task(
  p_task_id uuid,p_status text,p_body text default null,p_attachment_url text default null
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare
 v_uid uuid:=auth.uid(); v_task public.team_tasks%rowtype; v_role text;
 v_manager boolean:=false; v_supervisor boolean:=false; v_engineering_lead boolean:=false;
begin
 if v_uid is null or not public.is_active_team_member(v_uid) then return jsonb_build_object('ok',false,'error','active team appointment required'); end if;
 select * into v_task from public.team_tasks where id=p_task_id for update;
 if v_task.id is null then return jsonb_build_object('ok',false,'error','task not found'); end if;
 select role into v_role from public.users where id=v_uid and banned=false;
 v_manager:=v_role in ('owner','super_admin') or (v_role='vice_admin' and exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_manage_tasks'));
 v_engineering_lead:=exists(select 1 from public.engineering_appointments where user_id=v_uid and status='active' and is_lead)
   and exists(select 1 from public.engineering_appointments where user_id=v_task.assigned_to and status='active');
 v_supervisor:=v_uid=v_task.supervisor_id and (
   v_role in ('owner','super_admin')
   or (v_role='vice_admin' and exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_manage_tasks'))
   or (v_role='support_agent' and exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_supervise_staff'))
   or v_engineering_lead
 );
 if v_uid<>v_task.assigned_to and not v_supervisor and not v_manager then return jsonb_build_object('ok',false,'error','not authorized for this task'); end if;
 if p_status is null or p_status not in ('todo','in_progress','blocked','submitted','completed','cancelled') then
   return jsonb_build_object('ok',false,'error','invalid task status');
 end if;
 if v_uid=v_task.assigned_to and not v_manager and not v_supervisor and p_status not in ('todo','in_progress','blocked','submitted') then
   return jsonb_build_object('ok',false,'error','team members can only submit or update their own work');
 end if;
 if p_body is not null and char_length(p_body)>5000 then return jsonb_build_object('ok',false,'error','update too long'); end if;
 if p_attachment_url is not null and (char_length(p_attachment_url)>2048 or p_attachment_url !~ '^https://') then
   return jsonb_build_object('ok',false,'error','evidence must be a secure HTTPS link');
 end if;
 update public.team_tasks set status=p_status,updated_at=now(),
   completed_at=case when p_status='completed' then now() when p_status<>'completed' then null else completed_at end
 where id=p_task_id;
 if p_body is not null or p_attachment_url is not null or p_status<>v_task.status then
  insert into public.team_task_updates(task_id,author_id,update_type,body,attachment_url)
  values(p_task_id,v_uid,case when p_status='submitted' then 'submission' when p_attachment_url is not null then 'evidence' when p_status<>v_task.status then 'status_change' else 'comment' end,nullif(trim(p_body),''),p_attachment_url);
 end if;
 insert into public.admin_audit_log(actor_id,action,target_user_id,target_table,target_id,old_value,new_value)
 values(v_uid,'team_task_updated',v_task.assigned_to,'team_tasks',p_task_id,
   jsonb_build_object('status',v_task.status),jsonb_build_object('status',p_status,'engineering_lead_review',v_engineering_lead));
 return jsonb_build_object('ok',true);
end;
$function$;

revoke all on function public.engineering_assign_task(text,text,uuid,timestamptz) from public,anon;
revoke all on function public.team_my_tasks() from public,anon;
revoke all on function public.team_update_task(uuid,text,text,text) from public,anon;
grant execute on function public.engineering_assign_task(text,text,uuid,timestamptz) to authenticated;
grant execute on function public.team_my_tasks() to authenticated;
grant execute on function public.team_update_task(uuid,text,text,text) to authenticated;
