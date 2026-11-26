-- Reassign appointment titles, departments and supervisors without code changes.

create or replace function public.admin_update_team_appointment(
 p_invitation_id uuid,p_title text,p_department text,p_supervisor_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_inv public.staff_invitations%rowtype; v_role text;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;
 select * into v_inv from public.staff_invitations where id=p_invitation_id and appointment_status='active' for update;
 if v_inv.id is null then return jsonb_build_object('ok',false,'error','active appointment not found'); end if;
 if v_inv.role='vice_admin' and v_role<>'owner' then return jsonb_build_object('ok',false,'error','only Owner can change Vice Admin appointment details'); end if;
 if v_role not in ('owner','super_admin') and not (
   (v_inv.role='support_agent' and exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_manage_support_agents'))
   or (v_inv.role='staff_member' and exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_manage_staff'))
 ) then return jsonb_build_object('ok',false,'error','appointment management permission required'); end if;
 if p_title is null or char_length(trim(p_title)) not between 2 and 100 then return jsonb_build_object('ok',false,'error','title must be 2-100 characters'); end if;
 if p_department is not null and char_length(trim(p_department))>100 then return jsonb_build_object('ok',false,'error','department too long'); end if;
 if p_supervisor_id is not null and not exists(
  select 1 from public.users u where u.id=p_supervisor_id and u.banned=false and coalesce(u.is_deactivated,false)=false and
   (u.role in ('owner','super_admin')
    or exists(select 1 from public.staff_invitations si where si.accepted_by=u.id and si.role='vice_admin' and si.appointment_status='active')
    or (v_inv.role='staff_member' and u.role='support_agent' and exists(select 1 from public.staff_invitations si where si.accepted_by=u.id and si.role='support_agent' and si.appointment_status='active' and si.permissions ? 'can_supervise_staff')))
 ) then return jsonb_build_object('ok',false,'error','supervisor must be an active authorized team supervisor'); end if;
 update public.staff_invitations set official_title=trim(p_title),department=nullif(trim(p_department),''),supervisor_id=p_supervisor_id,updated_at=now() where id=v_inv.id;
 insert into public.admin_audit_log(actor_id,action,target_user_id,target_table,target_id,old_value,new_value)
 values(v_uid,'team_appointment_details_updated',v_inv.accepted_by,'staff_invitations',v_inv.id,
  jsonb_build_object('title',v_inv.official_title,'department',v_inv.department,'supervisor_id',v_inv.supervisor_id),
  jsonb_build_object('title',trim(p_title),'department',nullif(trim(p_department),''),'supervisor_id',p_supervisor_id));
 return jsonb_build_object('ok',true);
end;$function$;

create or replace function public.admin_upsert_team_department(p_name text,p_description text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_id uuid;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;
 if not (v_role in ('owner','super_admin') or (v_role='vice_admin' and exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_manage_departments'))) then
  return jsonb_build_object('ok',false,'error','department management permission required');
 end if;
 if p_name is null or char_length(trim(p_name)) not between 2 and 100 then return jsonb_build_object('ok',false,'error','department name must be 2-100 characters'); end if;
 insert into public.team_departments(name,description,created_by)
 values(trim(p_name),nullif(trim(p_description),''),v_uid)
 on conflict(name) do update set description=excluded.description,is_active=true
 returning id into v_id;
 insert into public.admin_audit_log(actor_id,action,target_table,target_id,new_value)
 values(v_uid,'team_department_saved','team_departments',v_id,jsonb_build_object('name',trim(p_name)));
 return jsonb_build_object('ok',true,'department_id',v_id);
end;$function$;

create or replace function public.team_list_departments()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_rows jsonb;
begin
 if v_uid is null or not exists(select 1 from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false and role in ('owner','super_admin','vice_admin','support_agent','staff_member')) then
  return jsonb_build_object('ok',false,'error','team access required');
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'description',description) order by name),'[]'::jsonb)
 into v_rows from public.team_departments where is_active=true;
 return jsonb_build_object('ok',true,'departments',v_rows);
end;$function$;

grant execute on function public.admin_update_team_appointment(uuid,text,text,uuid) to authenticated;
grant execute on function public.admin_upsert_team_department(text,text) to authenticated;
grant execute on function public.team_list_departments() to authenticated;
