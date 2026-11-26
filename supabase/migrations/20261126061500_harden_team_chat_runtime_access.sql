-- Keep team conversations behind active appointment checks and make message reads writable.
-- The read endpoint updates last_read_at, so it must be VOLATILE (the default).

revoke all on table public.staff_invitations from anon, authenticated;

create or replace function public.team_get_messages(p_conversation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_rows jsonb;
begin
 if v_uid is null or not public.is_active_team_member(v_uid) then
  return jsonb_build_object('ok',false,'error','active team appointment required');
 end if;
 if not exists(
  select 1 from public.team_conversation_members
  where conversation_id=p_conversation_id and user_id=v_uid
 ) then
  return jsonb_build_object('ok',false,'error','not a conversation member');
 end if;

 select coalesce(jsonb_agg(jsonb_build_object(
  'id',m.id,'sender_id',m.sender_id,'sender_name',u.username,
  'body',m.body,'attachment_url',m.attachment_url,'created_at',m.created_at
 ) order by m.created_at),'[]'::jsonb)
 into v_rows
 from public.team_messages m
 join public.users u on u.id=m.sender_id
 where m.conversation_id=p_conversation_id and m.deleted_at is null;

 update public.team_conversation_members
 set last_read_at=now()
 where conversation_id=p_conversation_id and user_id=v_uid;

 return jsonb_build_object('ok',true,'messages',v_rows);
end;$function$;

create or replace function public.team_available_colleagues()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_rows jsonb;
begin
 if v_uid is null or not public.is_active_team_member(v_uid) then
  return jsonb_build_object('ok',false,'error','active team appointment required');
 end if;

 select coalesce(jsonb_agg(jsonb_build_object(
  'id',u.id,'username',u.username,'role',u.role,
  'title',i.official_title,'department',i.department
 ) order by u.username),'[]'::jsonb)
 into v_rows
 from public.users u
 left join lateral (
  select official_title,department
  from public.staff_invitations si
  where si.accepted_by=u.id and si.appointment_status='active'
  order by accepted_at desc limit 1
 ) i on true
 where u.banned=false and coalesce(u.is_deactivated,false)=false
   and (
    u.role in ('owner','super_admin')
    or exists(
     select 1 from public.staff_invitations si
     where si.accepted_by=u.id and si.appointment_status='active'
    )
   );

 return jsonb_build_object('ok',true,'members',v_rows);
end;$function$;

create or replace function public.team_create_conversation(
 p_type text,p_title text,p_member_ids uuid[],p_department_id uuid default null
)
returns jsonb language plpgsql volatile security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_id uuid; v_role text; v_allowed boolean:=false;
begin
 if v_uid is null or not public.is_active_team_member(v_uid) then
  return jsonb_build_object('ok',false,'error','active team appointment required');
 end if;
 select role into v_role from public.users
 where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;

 if p_type is null or p_type not in ('direct','department','announcement','escalation') then
  return jsonb_build_object('ok',false,'error','invalid conversation type');
 end if;
 if v_role in ('owner','super_admin') then
  v_allowed:=true;
 elsif v_role='vice_admin' then
  select exists(
   select 1 from public.staff_invitations
   where accepted_by=v_uid and appointment_status='active'
    and permissions ? 'can_manage_team_communications'
  ) into v_allowed;
 end if;
 if p_type<>'direct' and not v_allowed then
  return jsonb_build_object('ok',false,'error','team communication management permission required');
 end if;
 if p_type='direct' and coalesce(array_length(p_member_ids,1),0)<>1 then
  return jsonb_build_object('ok',false,'error','direct message requires exactly one recipient');
 end if;
 if p_type='department' and p_department_id is null then
  return jsonb_build_object('ok',false,'error','department required for department conversation');
 end if;
 if p_title is not null and char_length(p_title)>160 then
  return jsonb_build_object('ok',false,'error','conversation title too long');
 end if;

 insert into public.team_conversations(conversation_type,title,department_id,created_by)
 values(p_type,nullif(trim(p_title),''),p_department_id,v_uid) returning id into v_id;

 insert into public.team_conversation_members(conversation_id,user_id,added_by)
 values(v_id,v_uid,v_uid) on conflict do nothing;

 insert into public.team_conversation_members(conversation_id,user_id,added_by)
 select v_id,selected.user_id,v_uid
 from unnest(coalesce(p_member_ids,'{}'::uuid[])) as selected(user_id)
 join public.users u on u.id=selected.user_id
  and u.banned=false and coalesce(u.is_deactivated,false)=false
  and (
   u.role in ('owner','super_admin')
   or (
    u.role in ('vice_admin','support_agent','staff_member')
    and exists(
     select 1 from public.staff_invitations si
     where si.accepted_by=u.id and si.appointment_status='active'
    )
   )
  )
 on conflict do nothing;

 if p_type='announcement' then
  insert into public.team_conversation_members(conversation_id,user_id,added_by)
  select v_id,u.id,v_uid from public.users u
  where u.id<>v_uid and public.is_active_team_member(u.id)
  on conflict do nothing;
 elsif p_type='department' then
  insert into public.team_conversation_members(conversation_id,user_id,added_by)
  select v_id,si.accepted_by,v_uid
  from public.staff_invitations si
  join public.team_departments d
   on lower(d.name)=lower(si.department) and d.id=p_department_id
  where si.appointment_status='active' and si.accepted_by is not null
   and si.accepted_by<>v_uid and public.is_active_team_member(si.accepted_by)
  on conflict do nothing;
 end if;

 insert into public.admin_audit_log(actor_id,action,target_table,target_id,new_value)
 values(v_uid,'team_conversation_created','team_conversations',v_id,
  jsonb_build_object('type',p_type,'member_count',coalesce(array_length(p_member_ids,1),0)));

 return jsonb_build_object('ok',true,'conversation_id',v_id);
end;$function$;

grant execute on function public.team_get_messages(uuid) to authenticated;
grant execute on function public.team_available_colleagues() to authenticated;
grant execute on function public.team_create_conversation(text,text,uuid[],uuid) to authenticated;
