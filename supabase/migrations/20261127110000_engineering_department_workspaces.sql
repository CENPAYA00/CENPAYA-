-- CenPaya engineering department: separate appointments, isolated panels and team-wide communication.
-- Engineering functions are departmental appointments, never values in users.role.

create table if not exists public.engineering_appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  engineering_role text not null check (engineering_role in (
    'supabase_engineer','d1_engineer','application_code_engineer','security_engineer','ui_ux_designer'
  )),
  is_lead boolean not null default false,
  status text not null default 'active' check (status in ('active','suspended','removed')),
  role_description text not null,
  appointed_by uuid not null references public.users(id) on delete restrict,
  appointed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_by uuid references public.users(id) on delete set null,
  removed_at timestamptz
);
create unique index if not exists engineering_appointments_active_role_uidx
  on public.engineering_appointments(user_id,engineering_role) where status='active';
create unique index if not exists engineering_appointments_single_lead_uidx
  on public.engineering_appointments(is_lead) where status='active' and is_lead=true;
create index if not exists engineering_appointments_user_status_idx
  on public.engineering_appointments(user_id,status);
create index if not exists engineering_appointments_role_status_idx
  on public.engineering_appointments(engineering_role,status);

alter table public.engineering_appointments enable row level security;
revoke all on public.engineering_appointments from anon,authenticated;

create or replace function public.is_active_team_member(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public,pg_temp
as $function$
  select exists(
    select 1 from public.users u
    where u.id=p_user_id and u.banned=false and coalesce(u.is_deactivated,false)=false
      and (
        u.role in ('owner','super_admin')
        or (u.role in ('vice_admin','support_agent','staff_member') and exists(
          select 1 from public.staff_invitations i
          where i.accepted_by=u.id and i.role=u.role and i.appointment_status='active'
        ))
        or exists(select 1 from public.engineering_appointments ea where ea.user_id=u.id and ea.status='active')
      )
  );
$function$;

create or replace function public.engineering_my_profile()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_user public.users%rowtype; v_rows jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  select * into v_user from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;
  if v_user.id is null then return jsonb_build_object('ok',false,'error','account unavailable'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'role',engineering_role,'is_lead',is_lead,'status',status,
    'description',role_description,'appointed_at',appointed_at
  ) order by is_lead desc,engineering_role),'[]'::jsonb)
  into v_rows from public.engineering_appointments where user_id=v_uid and status='active';
  if jsonb_array_length(v_rows)=0 then return jsonb_build_object('ok',false,'error','no active engineering appointment'); end if;
  return jsonb_build_object('ok',true,'user_id',v_uid,'app_role',v_user.role,'appointments',v_rows);
end;$function$;

create or replace function public.engineering_admin_list()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_rows jsonb;
begin
  select role into v_role from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;
  if v_uid is null or v_role not in ('owner','super_admin') then
    return jsonb_build_object('ok',false,'error','Owner or Super Admin authority required');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',ea.id,'user_id',ea.user_id,'username',u.username,'email',u.email,
    'app_role',u.role,'engineering_role',ea.engineering_role,'is_lead',ea.is_lead,
    'status',ea.status,'description',ea.role_description,'appointed_at',ea.appointed_at,
    'appointed_by',ea.appointed_by,'removed_at',ea.removed_at
  ) order by ea.status,ea.is_lead desc,ea.engineering_role,u.username),'[]'::jsonb)
  into v_rows from public.engineering_appointments ea join public.users u on u.id=ea.user_id;
  return jsonb_build_object('ok',true,'appointments',v_rows);
end;$function$;

create or replace function public.engineering_appoint_member(
  p_user_id uuid,p_engineering_role text,p_is_lead boolean default false
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_appointment_id uuid; v_description text;
begin
  select role into v_role from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;
  if v_uid is null or v_role not in ('owner','super_admin') then
    return jsonb_build_object('ok',false,'error','Only Owner or Super Admin can appoint engineering members');
  end if;
  if p_engineering_role not in ('supabase_engineer','d1_engineer','application_code_engineer','security_engineer','ui_ux_designer') then
    return jsonb_build_object('ok',false,'error','Invalid engineering function');
  end if;
  if not exists(select 1 from public.users where id=p_user_id and banned=false and coalesce(is_deactivated,false)=false) then
    return jsonb_build_object('ok',false,'error','Selected user account is unavailable');
  end if;
  if p_is_lead and v_role<>'owner' then
    return jsonb_build_object('ok',false,'error','Only the Owner can appoint the Lead Engineer');
  end if;
  if p_is_lead and exists(select 1 from public.engineering_appointments where status='active' and is_lead and user_id<>p_user_id) then
    return jsonb_build_object('ok',false,'error','A Lead Engineer is already appointed');
  end if;
  v_description:=case p_engineering_role
    when 'supabase_engineer' then 'Responsible for Supabase database schema, migrations, SQL functions, RLS policies, integrity and database performance.'
    when 'd1_engineer' then 'Responsible for Cloudflare D1 schemas and migrations, Worker APIs, storage bindings, scheduled jobs and runtime reliability.'
    when 'application_code_engineer' then 'Responsible for CenPaya application code, feature implementation, bug fixes, pull requests, type checks and automated tests.'
    when 'security_engineer' then 'Responsible for authorized security reviews, threat analysis, access-control testing, vulnerability reports and verification of security fixes.'
    when 'ui_ux_designer' then 'Responsible for user flows, interface design, responsive layouts, accessibility, design consistency and implementation handoff.'
  end;
  insert into public.engineering_appointments(user_id,engineering_role,is_lead,status,role_description,appointed_by)
  values(p_user_id,p_engineering_role,coalesce(p_is_lead,false),'active',v_description,v_uid)
  on conflict (user_id,engineering_role) where status='active' do update
    set is_lead=excluded.is_lead,role_description=excluded.role_description,
        appointed_by=excluded.appointed_by,updated_at=now(),removed_by=null,removed_at=null
  returning id into v_appointment_id;
  insert into public.admin_audit_log(actor_id,action,target_user_id,target_table,target_id,new_value)
  values(v_uid,'engineering_member_appointed',p_user_id,'engineering_appointments',v_appointment_id,
    jsonb_build_object('engineering_role',p_engineering_role,'is_lead',coalesce(p_is_lead,false)));
  -- Ensure one shared General Team Room exists and automatically include all active team members.
  if not exists(select 1 from public.team_conversations where conversation_type='announcement' and title='General Team Room' and is_archived=false) then
    insert into public.team_conversations(conversation_type,title,created_by)
    values('announcement','General Team Room',v_uid);
  end if;
  insert into public.team_conversation_members(conversation_id,user_id,added_by)
  select c.id,ea.user_id,v_uid from public.team_conversations c
  cross join public.engineering_appointments ea
  where c.conversation_type='announcement' and c.title='General Team Room' and c.is_archived=false
    and ea.status='active' and public.is_active_team_member(ea.user_id)
  on conflict do nothing;
  insert into public.team_conversation_members(conversation_id,user_id,added_by)
  select c.id,u.id,v_uid from public.team_conversations c cross join public.users u
  where c.conversation_type='announcement' and c.title='General Team Room' and c.is_archived=false
    and public.is_active_team_member(u.id)
  on conflict do nothing;
  return jsonb_build_object('ok',true,'appointment_id',v_appointment_id,'role',p_engineering_role);
exception when unique_violation then
  return jsonb_build_object('ok',false,'error','The appointment conflicts with an existing active role or Lead Engineer assignment');
end;$function$;

create or replace function public.engineering_remove_member(p_appointment_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_target uuid; v_function text;
begin
  select role into v_role from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;
  if v_uid is null or v_role not in ('owner','super_admin') then
    return jsonb_build_object('ok',false,'error','Only Owner or Super Admin can remove engineering members');
  end if;
  update public.engineering_appointments set status='removed',is_lead=false,removed_by=v_uid,removed_at=now(),updated_at=now()
  where id=p_appointment_id and status='active'
  returning user_id,engineering_role into v_target,v_function;
  if v_target is null then return jsonb_build_object('ok',false,'error','Active engineering appointment not found'); end if;
  insert into public.admin_audit_log(actor_id,action,target_user_id,target_table,target_id,new_value)
  values(v_uid,'engineering_member_removed',v_target,'engineering_appointments',p_appointment_id,
    jsonb_build_object('engineering_role',v_function));
  return jsonb_build_object('ok',true,'removed_user_id',v_target,'engineering_role',v_function);
end;$function$;

create or replace function public.engineering_assign_task(
  p_title text,p_description text,p_assigned_to uuid,p_due_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_task_id uuid;
begin
  select role into v_role from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;
  if v_uid is null or v_role not in ('owner','super_admin') then
    return jsonb_build_object('ok',false,'error','Only Owner or Super Admin can assign engineering tasks');
  end if;
  if p_title is null or char_length(trim(p_title)) not between 3 and 160 then
    return jsonb_build_object('ok',false,'error','Task title must be 3-160 characters');
  end if;
  if not public.is_active_team_member(p_assigned_to) or not exists(
    select 1 from public.engineering_appointments where user_id=p_assigned_to and status='active'
  ) then return jsonb_build_object('ok',false,'error','Assignee has no active engineering appointment'); end if;
  insert into public.team_tasks(title,description,assigned_to,assigned_by,supervisor_id,due_at)
  values(trim(p_title),nullif(trim(p_description),''),p_assigned_to,v_uid,v_uid,p_due_at)
  returning id into v_task_id;
  insert into public.team_task_updates(task_id,author_id,update_type,body)
  values(v_task_id,v_uid,'status_change','Engineering task assigned');
  insert into public.admin_audit_log(actor_id,action,target_user_id,target_table,target_id,new_value)
  values(v_uid,'engineering_task_assigned',p_assigned_to,'team_tasks',v_task_id,jsonb_build_object('title',p_title,'due_at',p_due_at));
  return jsonb_build_object('ok',true,'task_id',v_task_id);
end;$function$;

-- Colleague roster now includes engineering appointments without changing users.role.
create or replace function public.team_available_colleagues()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_rows jsonb;
begin
  if v_uid is null or not public.is_active_team_member(v_uid) then
    return jsonb_build_object('ok',false,'error','active team appointment required');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',u.id,'username',u.username,'role',u.role,'title',i.official_title,'department',i.department,
    'engineering_roles',coalesce(er.roles,'[]'::jsonb),
    'appointment_status',case when u.role in ('owner','super_admin') then 'active'
      when i.appointment_status='active' then 'active'
      when jsonb_array_length(coalesce(er.roles,'[]'::jsonb))>0 then 'active' else null end
  ) order by u.username),'[]'::jsonb)
  into v_rows
  from public.users u
  left join lateral (
    select official_title,department,appointment_status from public.staff_invitations si
    where si.accepted_by=u.id and si.appointment_status='active' order by accepted_at desc limit 1
  ) i on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('role',engineering_role,'is_lead',is_lead)) as roles
    from public.engineering_appointments ea where ea.user_id=u.id and ea.status='active'
  ) er on true
  where u.banned=false and coalesce(u.is_deactivated,false)=false
    and (u.role in ('owner','super_admin') or i.appointment_status='active'
      or jsonb_array_length(coalesce(er.roles,'[]'::jsonb))>0);
  return jsonb_build_object('ok',true,'members',v_rows);
end;$function$;

-- Allow active engineers to be selected as direct-message recipients in existing team chat.
create or replace function public.team_create_conversation(
  p_type text,p_title text,p_member_ids uuid[],p_department_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_id uuid; v_role text; v_allowed boolean:=false;
begin
  if v_uid is null or not public.is_active_team_member(v_uid) then
    return jsonb_build_object('ok',false,'error','active team appointment required');
  end if;
  select role into v_role from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;
  if p_type is null or p_type not in ('direct','department','announcement','escalation') then
    return jsonb_build_object('ok',false,'error','invalid conversation type');
  end if;
  if v_role in ('owner','super_admin') then v_allowed:=true;
  elsif v_role='vice_admin' then
    select exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_manage_team_communications') into v_allowed;
  end if;
  if p_type<>'direct' and not v_allowed then return jsonb_build_object('ok',false,'error','team communication management permission required'); end if;
  if p_type='direct' and coalesce(array_length(p_member_ids,1),0)<>1 then return jsonb_build_object('ok',false,'error','direct message requires exactly one recipient'); end if;
  if p_type='department' and p_department_id is null then return jsonb_build_object('ok',false,'error','department required for department conversation'); end if;
  if p_title is not null and char_length(p_title)>160 then return jsonb_build_object('ok',false,'error','conversation title too long'); end if;
  insert into public.team_conversations(conversation_type,title,department_id,created_by)
  values(p_type,nullif(trim(p_title),''),p_department_id,v_uid) returning id into v_id;
  insert into public.team_conversation_members(conversation_id,user_id,added_by)
  values(v_id,v_uid,v_uid) on conflict do nothing;
  if exists(
    select 1 from unnest(coalesce(p_member_ids,'{}'::uuid[])) s(user_id)
    where not public.is_active_team_member(s.user_id)
  ) then return jsonb_build_object('ok',false,'error','one or more recipients are not active team members'); end if;
  insert into public.team_conversation_members(conversation_id,user_id,added_by)
  select v_id,s.user_id,v_uid from unnest(coalesce(p_member_ids,'{}'::uuid[])) s(user_id)
  on conflict do nothing;
  if p_type='announcement' then
    insert into public.team_conversation_members(conversation_id,user_id,added_by)
    select v_id,u.id,v_uid from public.users u where u.id<>v_uid and public.is_active_team_member(u.id)
    on conflict do nothing;
  elsif p_type='department' then
    insert into public.team_conversation_members(conversation_id,user_id,added_by)
    select v_id,si.accepted_by,v_uid from public.staff_invitations si
    join public.team_departments d on lower(d.name)=lower(si.department) and d.id=p_department_id
    where si.appointment_status='active' and si.accepted_by is not null and si.accepted_by<>v_uid
      and public.is_active_team_member(si.accepted_by)
    on conflict do nothing;
  end if;
  insert into public.admin_audit_log(actor_id,action,target_table,target_id,new_value)
  values(v_uid,'team_conversation_created','team_conversations',v_id,
    jsonb_build_object('type',p_type,'member_count',coalesce(array_length(p_member_ids,1),0)));
  return jsonb_build_object('ok',true,'conversation_id',v_id);
end;$function$;

-- Existing General Team Room is kept and active engineers are added on appointment.
create or replace function public.engineering_sync_general_room_member()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $function$
begin
  if new.status='active' then
    insert into public.team_conversation_members(conversation_id,user_id,added_by)
    select c.id,new.user_id,new.appointed_by from public.team_conversations c
    where c.conversation_type='announcement' and c.title='General Team Room' and c.is_archived=false
    on conflict do nothing;
  end if;
  return new;
end;$function$;
drop trigger if exists engineering_general_room_membership on public.engineering_appointments;
create trigger engineering_general_room_membership after insert or update of status on public.engineering_appointments
for each row execute function public.engineering_sync_general_room_member();

revoke all on function public.engineering_my_profile() from public,anon;
revoke all on function public.engineering_admin_list() from public,anon;
revoke all on function public.engineering_appoint_member(uuid,text,boolean) from public,anon;
revoke all on function public.engineering_remove_member(uuid) from public,anon;
revoke all on function public.engineering_assign_task(text,text,uuid,timestamptz) from public,anon;
revoke all on function public.team_available_colleagues() from public,anon;
revoke all on function public.team_create_conversation(text,text,uuid[],uuid) from public,anon;
grant execute on function public.engineering_my_profile() to authenticated;
grant execute on function public.engineering_admin_list() to authenticated;
grant execute on function public.engineering_appoint_member(uuid,text,boolean) to authenticated;
grant execute on function public.engineering_remove_member(uuid) to authenticated;
grant execute on function public.engineering_assign_task(text,text,uuid,timestamptz) to authenticated;
grant execute on function public.team_available_colleagues() to authenticated;
grant execute on function public.team_create_conversation(text,text,uuid[],uuid) to authenticated;
