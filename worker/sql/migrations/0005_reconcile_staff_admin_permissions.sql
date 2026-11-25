-- Reconcile all legacy staff/admin permission grants on role changes.
-- An accepted invitation must never restore a role after an administrator demotes it.

begin;

create or replace function public.admin_assign_role(p_target_user_id uuid, p_new_role text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_target_role text;
  v_actor_rank int;
  v_target_rank int;
  v_new_rank int;
begin
  if v_actor_id is null then return jsonb_build_object('ok', false, 'error', 'not authenticated'); end if;
  if p_new_role not in ('user','support_agent','staff_member','super_admin') then
    return jsonb_build_object('ok', false, 'error', 'invalid role');
  end if;
  select role into v_actor_role from public.users where id = v_actor_id;
  select role into v_target_role from public.users where id = p_target_user_id;
  if v_target_role is null then return jsonb_build_object('ok', false, 'error', 'target not found'); end if;
  if v_actor_role not in ('owner','super_admin') or not (public.is_owner() or public.is_super_admin()) then
    return jsonb_build_object('ok', false, 'error', 'not authorized');
  end if;
  if v_target_role = 'owner' or p_new_role = 'owner' then
    return jsonb_build_object('ok', false, 'error', 'owner role is protected');
  end if;
  v_actor_rank := public.role_rank(v_actor_role);
  v_target_rank := public.role_rank(v_target_role);
  v_new_rank := public.role_rank(p_new_role);
  if v_actor_role <> 'owner' and (v_new_rank >= v_actor_rank or v_target_rank >= v_actor_rank) then
    return jsonb_build_object('ok', false, 'error', 'cannot assign or modify a peer or superior');
  end if;
  if v_target_role = 'super_admin' and p_new_role <> 'super_admin'
     and (select count(*) from public.users where role = 'super_admin' and banned = false) <= 1 then
    return jsonb_build_object('ok', false, 'error', 'cannot demote the last super_admin');
  end if;

  perform set_config('app.role_change_authorized', 'true', true);
  update public.users set role = p_new_role where id = p_target_user_id;
  perform set_config('app.role_change_authorized', 'false', true);

  update public.admin_permissions
     set revoked_at = now()
   where user_id = p_target_user_id and permission_key <> 'owner' and revoked_at is null;

  if p_new_role in ('super_admin','support_agent','staff_member') then
    insert into public.admin_permissions(user_id,permission_key,granted_by)
    values (p_target_user_id,p_new_role,v_actor_id)
    on conflict (user_id,permission_key) do update
      set granted_by=excluded.granted_by,granted_at=now(),revoked_at=null;
  end if;

  insert into public.admin_audit_log(actor_id,action,target_table,target_id,old_value,new_value)
  values (v_actor_id,'assign_role','users',p_target_user_id,
    jsonb_build_object('role',v_target_role),jsonb_build_object('role',p_new_role));
  insert into public.outbound_notification_spool(user_id,notification_channel,destination_address,message_payload)
  select p_target_user_id,'EMAIL_RESEND',email,'Your account role has been changed to: '||p_new_role
  from public.users where id=p_target_user_id;
  return jsonb_build_object('ok',true,'old_role',v_target_role,'new_role',p_new_role);
end;
$function$;

create or replace function public.accept_staff_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_inv public.staff_invitations%rowtype;
  v_permission text;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  select email into v_email from public.users where id=v_uid;
  select * into v_inv from public.staff_invitations
   where invite_token=p_token and (status='pending' or (status='accepted' and accepted_by=v_uid))
   for update;
  if v_inv.id is null then return jsonb_build_object('ok',false,'error','invalid or expired invitation'); end if;
  if lower(coalesce(v_email,'')) <> lower(v_inv.email) then return jsonb_build_object('ok',false,'error','email does not match invitation'); end if;
  if v_inv.status='accepted' and v_inv.accepted_by=v_uid then
    if exists (select 1 from public.users where id=v_uid and role=v_inv.role)
       and exists (select 1 from public.admin_permissions where user_id=v_uid and permission_key=v_inv.role and revoked_at is null) then
      return jsonb_build_object('ok',true,'role',v_inv.role);
    end if;
    return jsonb_build_object('ok',false,'error','invitation was already used and this role is no longer active');
  end if;
  if v_inv.expires_at < now() then
    update public.staff_invitations set status='expired' where id=v_inv.id;
    return jsonb_build_object('ok',false,'error','invitation expired');
  end if;
  if exists (select 1 from public.admin_permissions where user_id=v_uid and permission_key in ('owner','super_admin') and revoked_at is null)
     or exists (select 1 from public.users where id=v_uid and role in ('owner','super_admin')) then
    return jsonb_build_object('ok',false,'error','administrators cannot accept staff invitations');
  end if;

  perform set_config('app.role_change_authorized','true',true);
  update public.users set role=v_inv.role where id=v_uid;
  perform set_config('app.role_change_authorized','false',true);

  update public.admin_permissions set revoked_at=now()
   where user_id=v_uid and permission_key <> 'owner' and revoked_at is null;

  insert into public.admin_permissions(user_id,permission_key,granted_by)
  values(v_uid,v_inv.role,v_inv.invited_by)
  on conflict(user_id,permission_key) do update
    set granted_by=excluded.granted_by,granted_at=now(),revoked_at=null;

  for v_permission in select value from jsonb_array_elements_text(coalesce(v_inv.permissions,'[]'::jsonb))
  loop
    insert into public.admin_permissions(user_id,permission_key,granted_by)
    values(v_uid,v_permission,v_inv.invited_by)
    on conflict(user_id,permission_key) do update
      set granted_by=excluded.granted_by,granted_at=now(),revoked_at=null;
  end loop;

  update public.staff_invitations set status='accepted',accepted_by=v_uid,accepted_at=now() where id=v_inv.id;
  insert into public.admin_audit_log(actor_id,action,target_user_id,target_table,new_value)
  values(v_inv.invited_by,'accept_staff_invitation',v_uid,'staff_invitations',
    jsonb_build_object('role',v_inv.role,'invitation_id',v_inv.id));
  return jsonb_build_object('ok',true,'role',v_inv.role);
end;
$function$;

revoke all on function public.admin_assign_role(uuid,text) from public, anon;
grant execute on function public.admin_assign_role(uuid,text) to authenticated;
revoke all on function public.accept_staff_invitation(text) from public, anon;
grant execute on function public.accept_staff_invitation(text) to authenticated;

commit;
