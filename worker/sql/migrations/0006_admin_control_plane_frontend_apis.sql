-- Complete the authenticated admin control-plane APIs used by the frontend.
-- Owner and Super Admin have equivalent platform administration authority.
-- Staff permissions remain narrowly scoped to their workspace role.

begin;

create or replace function public.admin_grant_permission(p_target_user_id uuid, p_permission_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_actor_role text;
  v_target_role text;
  v_allowed text[];
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  select role into v_actor_role from public.users where id=v_uid;
  if v_actor_role not in ('owner','super_admin') or not (public.is_owner() or public.is_super_admin()) then
    return jsonb_build_object('ok',false,'error','admin access required');
  end if;
  select role into v_target_role from public.users where id=p_target_user_id and banned=false;
  if v_target_role is null then return jsonb_build_object('ok',false,'error','active staff account not found'); end if;
  if v_target_role='support_agent' then
    v_allowed := array['can_resolve_disputes','can_manage_tickets','can_review_reports']::text[];
  elsif v_target_role='staff_member' then
    v_allowed := array['can_manage_listings','can_review_reports','can_review_kyc']::text[];
  else
    return jsonb_build_object('ok',false,'error','permissions may only be assigned to Support Agents or Staff Members');
  end if;
  if p_permission_key <> all(v_allowed) then
    return jsonb_build_object('ok',false,'error','permission is not allowed for this role');
  end if;
  insert into public.admin_permissions(user_id,permission_key,granted_by)
  values(p_target_user_id,p_permission_key,v_uid)
  on conflict(user_id,permission_key) do update
    set granted_by=excluded.granted_by,granted_at=now(),revoked_at=null;
  insert into public.admin_audit_log(actor_id,action,target_user_id,target_table,new_value)
  values(v_uid,'grant_permission',p_target_user_id,'admin_permissions',jsonb_build_object('permission_key',p_permission_key));
  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function public.admin_revoke_permission(p_target_user_id uuid, p_permission_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_actor_role text;
  v_target_role text;
  v_allowed text[];
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  select role into v_actor_role from public.users where id=v_uid;
  if v_actor_role not in ('owner','super_admin') or not (public.is_owner() or public.is_super_admin()) then
    return jsonb_build_object('ok',false,'error','admin access required');
  end if;
  select role into v_target_role from public.users where id=p_target_user_id;
  if v_target_role='support_agent' then
    v_allowed := array['can_resolve_disputes','can_manage_tickets','can_review_reports']::text[];
  elsif v_target_role='staff_member' then
    v_allowed := array['can_manage_listings','can_review_reports','can_review_kyc']::text[];
  else
    return jsonb_build_object('ok',false,'error','permissions may only be changed for Support Agents or Staff Members');
  end if;
  if p_permission_key <> all(v_allowed) then
    return jsonb_build_object('ok',false,'error','permission is not allowed for this role');
  end if;
  update public.admin_permissions
     set revoked_at=now()
   where user_id=p_target_user_id and permission_key=p_permission_key and revoked_at is null;
  insert into public.admin_audit_log(actor_id,action,target_user_id,target_table,new_value)
  values(v_uid,'revoke_permission',p_target_user_id,'admin_permissions',jsonb_build_object('permission_key',p_permission_key));
  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function public.admin_list_staff_permissions()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  if not (public.is_owner() or public.is_super_admin()) then
    return jsonb_build_object('ok',false,'error','admin access required');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',user_id,'permission_key',permission_key,'granted_at',granted_at
  ) order by granted_at desc),'[]'::jsonb)
  into v_result
  from public.admin_permissions
  where revoked_at is null and permission_key like 'can\_%' escape '\';
  return jsonb_build_object('ok',true,'permissions',v_result);
end;
$function$;

create or replace function public.admin_grant_membership(p_target_user_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  if not (public.is_owner() or public.is_super_admin()) then
    return jsonb_build_object('ok',false,'error','admin access required');
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 or length(p_reason) > 1000 then
    return jsonb_build_object('ok',false,'error','a reason of at least 5 characters is required');
  end if;
  if not exists(select 1 from public.users where id=p_target_user_id and banned=false) then
    return jsonb_build_object('ok',false,'error','active user not found');
  end if;
  if not exists(select 1 from public.user_memberships where user_id=p_target_user_id and status='active' and expires_at is null) then
    insert into public.user_memberships(user_id,tier,status,starts_at,expires_at,granted_by,grant_reason)
    values(p_target_user_id,'premium','active',now(),null,v_uid,trim(p_reason));
  end if;
  insert into public.admin_audit_log(actor_id,action,target_user_id,target_table,new_value)
  values(v_uid,'grant_membership',p_target_user_id,'user_memberships',jsonb_build_object('reason',trim(p_reason)));
  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function public.admin_revoke_membership(p_target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  if not (public.is_owner() or public.is_super_admin()) then
    return jsonb_build_object('ok',false,'error','admin access required');
  end if;
  if exists(select 1 from public.users where id=p_target_id and is_subscribed=true and is_membership_exempt=false) then
    return jsonb_build_object('ok',false,'error','paid membership cannot be revoked by an administrator');
  end if;
  update public.user_memberships set status='cancelled',updated_at=now()
   where user_id=p_target_id and status='active';
  insert into public.admin_audit_log(actor_id,action,target_user_id,target_table)
  values(v_uid,'revoke_membership',p_target_id,'user_memberships');
  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function public.admin_list_users(
  p_search text default null,
  p_role_filter text default null,
  p_banned_only boolean default false,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
  v_total int;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  if not (public.is_owner() or public.is_super_admin()) then
    return jsonb_build_object('ok',false,'error','admin access required');
  end if;
  p_limit := least(greatest(coalesce(p_limit,50),1),200);
  p_offset := greatest(coalesce(p_offset,0),0);
  select count(*) into v_total
  from public.users u
  where (p_search is null or p_search='' or u.username ilike '%'||p_search||'%' or u.email ilike '%'||p_search||'%')
    and (p_role_filter is null or p_role_filter='' or u.role=p_role_filter)
    and (not p_banned_only or u.banned=true);
  select coalesce(jsonb_agg(item order by item->>'created_at' desc),'[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id',u.id,
      'username',u.username,
      'email',u.email,
      'role',u.role,
      'banned',u.banned,
      'is_subscribed',u.is_subscribed,
      'is_membership_exempt',u.is_membership_exempt,
      'membership_active',exists(select 1 from public.user_memberships m where m.user_id=u.id and m.status='active' and (m.expires_at is null or m.expires_at>now())),
      'country_iso',u.country_iso,
      'followers_count',u.followers_count,
      'created_at',u.created_at
    ) as item,u.created_at
    from public.users u
    where (p_search is null or p_search='' or u.username ilike '%'||p_search||'%' or u.email ilike '%'||p_search||'%')
      and (p_role_filter is null or p_role_filter='' or u.role=p_role_filter)
      and (not p_banned_only or u.banned=true)
    order by u.created_at desc
    limit p_limit offset p_offset
  ) sub;
  return jsonb_build_object('ok',true,'users',v_result,'total',v_total);
end;
$function$;

revoke all on function public.admin_grant_permission(uuid,text) from public,anon;
grant execute on function public.admin_grant_permission(uuid,text) to authenticated;
revoke all on function public.admin_revoke_permission(uuid,text) from public,anon;
grant execute on function public.admin_revoke_permission(uuid,text) to authenticated;
revoke all on function public.admin_list_staff_permissions() from public,anon;
grant execute on function public.admin_list_staff_permissions() to authenticated;
revoke all on function public.admin_grant_membership(uuid,text) from public,anon;
grant execute on function public.admin_grant_membership(uuid,text) to authenticated;
revoke all on function public.admin_revoke_membership(uuid) from public,anon;
grant execute on function public.admin_revoke_membership(uuid) to authenticated;
revoke all on function public.admin_list_users(text,text,boolean,integer,integer) from public,anon;
grant execute on function public.admin_list_users(text,text,boolean,integer,integer) to authenticated;

commit;
