create or replace function public.engineering_assign_task(
  p_title text,p_description text,p_assigned_to uuid,p_due_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_task_id uuid; v_is_lead boolean:=false;
begin
  select role into v_role from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  v_is_lead:=exists(select 1 from public.engineering_appointments where user_id=v_uid and status='active' and is_lead);
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
  if v_is_lead and v_role not in ('owner','super_admin') and p_assigned_to=v_uid then
    return jsonb_build_object('ok',false,'error','Lead Engineer cannot assign a task to themselves');
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
revoke all on function public.engineering_assign_task(text,text,uuid,timestamptz) from public,anon;
grant execute on function public.engineering_assign_task(text,text,uuid,timestamptz) to authenticated;