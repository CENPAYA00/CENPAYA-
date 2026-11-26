-- Allow delegated Vice Admins to manage only the team scopes granted by Owner.

create or replace function public.admin_list_invitations()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_rows jsonb; v_can boolean:=false;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false;
 if v_role in ('owner','super_admin') then v_can:=true;
 elsif v_role='vice_admin' then
  select exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and (permissions ? 'can_manage_staff' or permissions ? 'can_manage_support_agents')) into v_can;
 end if;
 if not v_can then return jsonb_build_object('ok',false,'error','team appointment management permission required'); end if;
 select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at desc),'[]'::jsonb) into v_rows
 from public.staff_invitations i
 where v_role in ('owner','super_admin')
    or (i.role='support_agent' and exists(select 1 from public.staff_invitations me where me.accepted_by=v_uid and me.appointment_status='active' and me.permissions ? 'can_manage_support_agents'))
    or (i.role='staff_member' and exists(select 1 from public.staff_invitations me where me.accepted_by=v_uid and me.appointment_status='active' and me.permissions ? 'can_manage_staff'));
 return jsonb_build_object('ok',true,'invitations',v_rows);
end;$function$;

create or replace function public.team_available_colleagues()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_rows jsonb;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 if not exists(select 1 from public.users where id=v_uid and role in ('owner','super_admin','vice_admin','support_agent','staff_member') and banned=false) then return jsonb_build_object('ok',false,'error','team access required'); end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',u.id,'username',u.username,'role',u.role,'title',i.official_title,
  'department',i.department,'invitation_id',i.id,'appointment_status',i.appointment_status,
  'permissions',coalesce(i.permissions,'[]'::jsonb)
 ) order by u.username),'[]'::jsonb)
 into v_rows
 from public.users u left join lateral (
   select id,official_title,department,appointment_status,permissions
   from public.staff_invitations si where si.accepted_by=u.id
   order by accepted_at desc nulls last limit 1
 ) i on true
 where u.banned=false and (
   u.role in ('owner','super_admin') or exists(select 1 from public.staff_invitations si where si.accepted_by=u.id and si.appointment_status='active')
 );
 return jsonb_build_object('ok',true,'members',v_rows);
end;$function$;

create or replace function public.team_create_conversation(
 p_type text,p_title text,p_member_ids uuid[],p_department_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_id uuid; v_role text; v_allowed boolean:=false;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false;
 if v_role not in ('owner','super_admin','vice_admin','support_agent','staff_member') then return jsonb_build_object('ok',false,'error','team access required'); end if;
 if p_type is null or p_type not in ('direct','department','announcement','escalation') then return jsonb_build_object('ok',false,'error','invalid conversation type'); end if;
 if v_role in ('owner','super_admin') then v_allowed:=true;
 elsif v_role='vice_admin' then
  select exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_manage_team_communications') into v_allowed;
 end if;
 if p_type<>'direct' and not v_allowed then return jsonb_build_object('ok',false,'error','team communication management permission required'); end if;
 if p_type='direct' and coalesce(array_length(p_member_ids,1),0)<>1 then return jsonb_build_object('ok',false,'error','direct message requires exactly one recipient'); end if;
 insert into public.team_conversations(conversation_type,title,department_id,created_by)
 values(p_type,nullif(trim(p_title),''),p_department_id,v_uid) returning id into v_id;
 insert into public.team_conversation_members(conversation_id,user_id,added_by)
 values(v_id,v_uid,v_uid) on conflict do nothing;
 insert into public.team_conversation_members(conversation_id,user_id,added_by)
 select v_id,selected.user_id,v_uid from unnest(coalesce(p_member_ids,'{}'::uuid[])) as selected(user_id)
 join public.users u on u.id=selected.user_id and (u.role in ('owner','super_admin')
    or (u.role in ('vice_admin','support_agent','staff_member')
        and exists(select 1 from public.staff_invitations si where si.accepted_by=u.id and si.appointment_status='active')))
 on conflict do nothing;
 insert into public.admin_audit_log(actor_id,action,target_table,target_id,new_value)
 values(v_uid,'team_conversation_created','team_conversations',v_id,jsonb_build_object('type',p_type,'member_count',coalesce(array_length(p_member_ids,1),0)));
 return jsonb_build_object('ok',true,'conversation_id',v_id);
end;$function$;

grant execute on function public.admin_list_invitations() to authenticated;
grant execute on function public.team_available_colleagues() to authenticated;
grant execute on function public.team_create_conversation(text,text,uuid[],uuid) to authenticated;
