-- Unified team-management roles and appointment lifecycle.
-- Prepared for review/deployment; this migration is intentionally not applied here.

alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('user','support_agent','staff_member','vice_admin','super_admin','owner'));

alter table public.staff_invitations drop constraint if exists staff_invitations_role_check;
alter table public.staff_invitations add constraint staff_invitations_role_check
  check (role in ('support_agent','staff_member','vice_admin'));

alter table public.staff_invitations
  add column if not exists official_title text,
  add column if not exists department text,
  add column if not exists supervisor_id uuid references public.users(id) on delete set null,
  add column if not exists appointment_status text not null default 'pending',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by uuid references public.users(id) on delete set null;

update public.staff_invitations set appointment_status=case when status='accepted' then 'active' when status in ('revoked','expired') then 'removed' else 'pending' end where appointment_status='pending' and status<>'pending';

alter table public.staff_invitations drop constraint if exists staff_invitations_appointment_status_check;
alter table public.staff_invitations add constraint staff_invitations_appointment_status_check
  check (appointment_status in ('pending','active','suspended','removed'));

create index if not exists staff_invitations_active_role_idx
  on public.staff_invitations(role, appointment_status, accepted_by);

create table if not exists public.team_departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);

create table if not exists public.team_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 3 and 160),
  description text,
  department_id uuid references public.team_departments(id) on delete set null,
  assigned_to uuid not null references public.users(id) on delete restrict,
  assigned_by uuid not null references public.users(id) on delete restrict,
  supervisor_id uuid references public.users(id) on delete set null,
  status text not null default 'todo' check (status in ('todo','in_progress','blocked','submitted','completed','cancelled')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists team_tasks_assignee_idx on public.team_tasks(assigned_to,status,due_at);
create index if not exists team_tasks_supervisor_idx on public.team_tasks(supervisor_id,status,due_at);

create table if not exists public.team_task_updates (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.team_tasks(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete restrict,
  update_type text not null check (update_type in ('comment','evidence','submission','status_change')),
  body text,
  attachment_url text,
  created_at timestamptz not null default now()
);
create index if not exists team_task_updates_task_idx on public.team_task_updates(task_id,created_at);

create table if not exists public.team_conversations (
  id uuid primary key default gen_random_uuid(),
  conversation_type text not null check (conversation_type in ('direct','department','announcement','escalation')),
  title text,
  department_id uuid references public.team_departments(id) on delete set null,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  is_archived boolean not null default false
);
create table if not exists public.team_conversation_members (
  conversation_id uuid not null references public.team_conversations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  added_by uuid references public.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key(conversation_id,user_id)
);
create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.team_conversations(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete restrict,
  body text not null check (char_length(trim(body)) between 1 and 10000),
  attachment_url text,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create index if not exists team_messages_conversation_idx on public.team_messages(conversation_id,created_at);
create table if not exists public.team_escalations (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.platform_tickets(id) on delete set null,
  task_id uuid references public.team_tasks(id) on delete set null,
  raised_by uuid not null references public.users(id) on delete restrict,
  assigned_to uuid references public.users(id) on delete set null,
  escalation_level text not null check (escalation_level in ('vice_admin','super_admin','owner')),
  reason text not null check (char_length(trim(reason)) between 5 and 5000),
  status text not null default 'open' check (status in ('open','in_progress','resolved','dismissed')),
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.team_departments enable row level security;
alter table public.team_tasks enable row level security;
alter table public.team_task_updates enable row level security;
alter table public.team_conversations enable row level security;
alter table public.team_conversation_members enable row level security;
alter table public.team_messages enable row level security;
alter table public.team_escalations enable row level security;
revoke all on public.team_departments,public.team_tasks,public.team_task_updates,
  public.team_conversations,public.team_conversation_members,public.team_messages,
  public.team_escalations from anon,authenticated;

drop function if exists public.admin_invite_staff(text,text,jsonb);

create or replace function public.admin_invite_staff(
  p_email text,p_role text,p_permissions jsonb default '[]'::jsonb,
  p_title text default null,p_department text default null,p_supervisor_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_id uuid; v_token text; v_allowed text[];
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 if not (public.is_owner() or public.is_super_admin()) and not (p_role='support_agent' and exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_manage_support_agents')) and not (p_role='staff_member' and exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_manage_staff')) then return jsonb_build_object('ok',false,'error','team appointment management permission required'); end if;
 if p_role is null or p_role not in ('support_agent','staff_member','vice_admin') then return jsonb_build_object('ok',false,'error','invalid team role'); end if;
 if p_role='vice_admin' and not (public.is_owner() or public.is_super_admin()) then return jsonb_build_object('ok',false,'error','Owner or Super Admin required to appoint a Vice Admin'); end if;
 if p_role='vice_admin' and not public.is_owner() and jsonb_array_length(p_permissions)>0 then return jsonb_build_object('ok',false,'error','only Owner may grant Vice Admin permissions'); end if;
 if p_email is null or p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then return jsonb_build_object('ok',false,'error','invalid email'); end if;
 if p_permissions is null or jsonb_typeof(p_permissions)<>'array' or jsonb_array_length(p_permissions)>30 then return jsonb_build_object('ok',false,'error','invalid permissions'); end if;
 v_allowed:=case p_role
   when 'support_agent' then array['can_manage_tickets','can_resolve_disputes','can_review_reports','can_escalate','can_supervise_staff']::text[]
   when 'staff_member' then array['can_manage_listings','can_review_reports','can_review_kyc','can_submit_reports']::text[]
   else array['can_manage_support_agents','can_manage_staff','can_manage_departments','can_manage_tasks','can_review_reports','can_manage_escalations','can_view_team_metrics','can_manage_team_communications']::text[]
 end;
 if exists(select 1 from jsonb_array_elements_text(p_permissions) x(value) where x.value<>all(v_allowed)) then return jsonb_build_object('ok',false,'error','permission is not allowed for this role'); end if;
 if p_role='support_agent' then
   p_permissions:=p_permissions || jsonb_build_array('can_manage_tickets','can_escalate','can_supervise_staff');
 elsif p_role='staff_member' then
   p_permissions:=p_permissions || jsonb_build_array('can_submit_reports');
 end if;
 if p_supervisor_id is not null and not exists(select 1 from public.users u where u.id=p_supervisor_id and u.role in ('vice_admin','super_admin','owner') and u.banned=false) then return jsonb_build_object('ok',false,'error','invalid supervisor'); end if;
 insert into public.staff_invitations(email,role,permissions,invited_by,official_title,department,supervisor_id,appointment_status)
 values(lower(trim(p_email)),p_role,p_permissions,v_uid,coalesce(nullif(trim(p_title),''),initcap(replace(p_role,'_',' '))),nullif(trim(p_department),''),p_supervisor_id,'pending')
 returning id,invite_token into v_id,v_token;
 insert into public.admin_audit_log(actor_id,action,target_table,target_id,new_value)
 values(v_uid,'team_invitation_created','staff_invitations',v_id,jsonb_build_object('email',lower(trim(p_email)),'role',p_role,'permissions',p_permissions,'title',p_title,'department',p_department,'supervisor_id',p_supervisor_id));
 return jsonb_build_object('ok',true,'invitation_id',v_id,'token',v_token);
end;$function$;

create or replace function public.accept_staff_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_email text; v_inv public.staff_invitations%rowtype; v_permission text;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select email into v_email from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;
 if v_email is null then return jsonb_build_object('ok',false,'error','account is unavailable'); end if;
 select * into v_inv from public.staff_invitations where invite_token=p_token and status='pending' and appointment_status='pending' for update;
 if v_inv.id is null then return jsonb_build_object('ok',false,'error','invalid or expired invitation'); end if;
 if lower(coalesce(v_email,''))<>lower(v_inv.email) then return jsonb_build_object('ok',false,'error','email does not match invitation'); end if;
 if exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and id<>v_inv.id) then return jsonb_build_object('ok',false,'error','an active team appointment already exists for this account'); end if;
 if v_inv.expires_at<now() then update public.staff_invitations set status='expired',appointment_status='removed',updated_at=now() where id=v_inv.id; return jsonb_build_object('ok',false,'error','invitation expired'); end if;
 if exists(select 1 from public.users where id=v_uid and role in ('owner','super_admin')) then return jsonb_build_object('ok',false,'error','administrators cannot accept team invitations'); end if;
 perform set_config('app.role_change_authorized','true',true);
 update public.users set role=v_inv.role where id=v_uid;
 perform set_config('app.role_change_authorized','false',true);
 update public.admin_permissions set revoked_at=now() where user_id=v_uid and revoked_at is null and permission_key not in ('owner','super_admin');
 insert into public.admin_permissions(user_id,permission_key,granted_by)
 values(v_uid,v_inv.role,v_inv.invited_by)
 on conflict(user_id,permission_key) do update set granted_by=excluded.granted_by,granted_at=now(),revoked_at=null;
 for v_permission in select value from jsonb_array_elements_text(coalesce(v_inv.permissions,'[]'::jsonb)) loop
   insert into public.admin_permissions(user_id,permission_key,granted_by) values(v_uid,v_permission,v_inv.invited_by)
   on conflict(user_id,permission_key) do update set granted_by=excluded.granted_by,granted_at=now(),revoked_at=null;
 end loop;
 update public.staff_invitations set status='accepted',appointment_status='active',accepted_by=v_uid,accepted_at=now(),updated_at=now() where id=v_inv.id;
 insert into public.admin_audit_log(actor_id,action,target_user_id,target_table,target_id,new_value)
 values(v_inv.invited_by,'team_appointment_accepted',v_uid,'staff_invitations',v_inv.id,jsonb_build_object('role',v_inv.role,'title',v_inv.official_title,'department',v_inv.department,'supervisor_id',v_inv.supervisor_id));
 return jsonb_build_object('ok',true,'role',v_inv.role,'title',v_inv.official_title,'department',v_inv.department,'supervisor_id',v_inv.supervisor_id,'permissions',coalesce(v_inv.permissions,'[]'::jsonb));
end;$function$;

create or replace function public.staff_my_profile()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_perms jsonb; v_inv public.staff_invitations%rowtype;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;
 if v_role is null or v_role not in ('owner','super_admin','vice_admin','support_agent','staff_member') then return jsonb_build_object('ok',false,'error','not staff'); end if;
 if v_role in ('vice_admin','support_agent','staff_member') then
   select * into v_inv from public.staff_invitations where accepted_by=v_uid and appointment_status='active' order by accepted_at desc limit 1;
   if v_inv.id is null then return jsonb_build_object('ok',false,'error','appointment is not active'); end if;
 end if;
 select coalesce(jsonb_agg(permission_key),'[]'::jsonb) into v_perms from public.admin_permissions where user_id=v_uid and revoked_at is null;
 return jsonb_build_object('ok',true,'user_id',v_uid,'role',v_role,'permissions',v_perms,'title',v_inv.official_title,'department',v_inv.department,'supervisor_id',v_inv.supervisor_id,'supervisor_username',(select username from public.users where id=v_inv.supervisor_id),'appointment_status',case when v_role in ('owner','super_admin') then 'active' else v_inv.appointment_status end);
end;$function$;

create or replace function public.admin_list_invitations()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_rows jsonb;
begin
 if not (public.is_owner() or public.is_super_admin()) then return jsonb_build_object('ok',false,'error','owner or super admin required'); end if;
 select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at desc),'[]'::jsonb) into v_rows from public.staff_invitations i;
 return jsonb_build_object('ok',true,'invitations',v_rows);
end;$function$;

create or replace function public.admin_set_team_member_status(p_invitation_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_inv public.staff_invitations%rowtype; v_permission text;
begin
 if v_uid is null or not (public.is_owner() or public.is_super_admin() or exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and (permissions ? 'can_manage_staff' or permissions ? 'can_manage_support_agents'))) then return jsonb_build_object('ok',false,'error','team appointment management permission required'); end if;
 if p_status is null or p_status not in ('active','suspended','removed') then return jsonb_build_object('ok',false,'error','invalid appointment status'); end if;
 select * into v_inv from public.staff_invitations where id=p_invitation_id for update;
 if v_inv.id is null or v_inv.accepted_by is null then return jsonb_build_object('ok',false,'error','accepted appointment not found'); end if;
 if v_inv.role='vice_admin' and not (public.is_owner() or public.is_super_admin()) then return jsonb_build_object('ok',false,'error','Owner or Super Admin required to manage Vice Admin appointment'); end if;
 if v_inv.role='support_agent' and not (public.is_owner() or public.is_super_admin() or exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_manage_support_agents')) then return jsonb_build_object('ok',false,'error','support agent management permission required'); end if;
 if v_inv.role='staff_member' and not (public.is_owner() or public.is_super_admin() or exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_manage_staff')) then return jsonb_build_object('ok',false,'error','staff management permission required'); end if;
 if v_inv.role in ('owner','super_admin') then return jsonb_build_object('ok',false,'error','protected role'); end if;
 update public.staff_invitations set appointment_status=p_status,updated_at=now(),removed_at=case when p_status='removed' then now() else null end,removed_by=case when p_status='removed' then v_uid else null end where id=v_inv.id;
 if p_status='active' then
   perform set_config('app.role_change_authorized','true',true);
   update public.users set role=v_inv.role where id=v_inv.accepted_by;
   perform set_config('app.role_change_authorized','false',true);
   insert into public.admin_permissions(user_id,permission_key,granted_by)
   values(v_inv.accepted_by,v_inv.role,v_uid)
   on conflict(user_id,permission_key) do update set granted_by=excluded.granted_by,granted_at=now(),revoked_at=null;
   for v_permission in select value from jsonb_array_elements_text(coalesce(v_inv.permissions,'[]'::jsonb)) loop
     insert into public.admin_permissions(user_id,permission_key,granted_by)
     values(v_inv.accepted_by,v_permission,v_uid)
     on conflict(user_id,permission_key) do update set granted_by=excluded.granted_by,granted_at=now(),revoked_at=null;
   end loop;
 else
   update public.admin_permissions set revoked_at=now() where user_id=v_inv.accepted_by and permission_key not in ('owner','super_admin') and revoked_at is null;
   perform set_config('app.role_change_authorized','true',true);
   update public.users set role='user' where id=v_inv.accepted_by and role=v_inv.role;
   perform set_config('app.role_change_authorized','false',true);
 end if;
 insert into public.admin_audit_log(actor_id,action,target_user_id,target_table,target_id,old_value,new_value)
 values(v_uid,'team_appointment_'||p_status,v_inv.accepted_by,'staff_invitations',v_inv.id,jsonb_build_object('status',v_inv.appointment_status),jsonb_build_object('status',p_status,'role',v_inv.role));
 return jsonb_build_object('ok',true,'status',p_status);
end;$function$;

create or replace function public.admin_update_team_permissions(p_invitation_id uuid,p_permissions jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_inv public.staff_invitations%rowtype; v_allowed text[];
begin
 if v_uid is null or not (public.is_owner() or public.is_super_admin() or exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and (permissions ? 'can_manage_staff' or permissions ? 'can_manage_support_agents'))) then return jsonb_build_object('ok',false,'error','team permissions management required'); end if;
 select * into v_inv from public.staff_invitations where id=p_invitation_id and appointment_status='active' for update;
 if v_inv.id is null then return jsonb_build_object('ok',false,'error','active appointment not found'); end if;
 if v_inv.role='vice_admin' and not public.is_owner() then return jsonb_build_object('ok',false,'error','only Owner may change Vice Admin permissions'); end if;
 if v_inv.role='support_agent' and not (public.is_owner() or public.is_super_admin() or exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_manage_support_agents')) then return jsonb_build_object('ok',false,'error','support agent management permission required'); end if;
 if v_inv.role='staff_member' and not (public.is_owner() or public.is_super_admin() or exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_manage_staff')) then return jsonb_build_object('ok',false,'error','staff management permission required'); end if;
 v_allowed:=case v_inv.role
   when 'support_agent' then array['can_manage_tickets','can_resolve_disputes','can_review_reports','can_escalate','can_supervise_staff']::text[]
   when 'staff_member' then array['can_manage_listings','can_review_reports','can_review_kyc','can_submit_reports']::text[]
   else array['can_manage_support_agents','can_manage_staff','can_manage_departments','can_manage_tasks','can_review_reports','can_manage_escalations','can_view_team_metrics','can_manage_team_communications']::text[]
 end;
 if p_permissions is null or jsonb_typeof(p_permissions)<>'array' or jsonb_array_length(p_permissions)>30
 or exists(select 1 from jsonb_array_elements_text(p_permissions) x(value) where x.value<>all(v_allowed)) then return jsonb_build_object('ok',false,'error','invalid permissions for role'); end if;
 if v_inv.role='support_agent' then
   p_permissions:=p_permissions || jsonb_build_array('can_manage_tickets','can_escalate','can_supervise_staff');
 elsif v_inv.role='staff_member' then
   p_permissions:=p_permissions || jsonb_build_array('can_submit_reports');
 end if;
 update public.staff_invitations set permissions=p_permissions,updated_at=now() where id=v_inv.id;
 update public.admin_permissions set revoked_at=now() where user_id=v_inv.accepted_by and permission_key not in ('owner','super_admin') and revoked_at is null;
 insert into public.admin_permissions(user_id,permission_key,granted_by)
 values(v_inv.accepted_by,v_inv.role,auth.uid())
 on conflict(user_id,permission_key) do update set granted_by=excluded.granted_by,granted_at=now(),revoked_at=null;
 insert into public.admin_permissions(user_id,permission_key,granted_by)
 select v_inv.accepted_by,value,auth.uid() from jsonb_array_elements_text(p_permissions)
 on conflict(user_id,permission_key) do update set granted_by=excluded.granted_by,granted_at=now(),revoked_at=null;
 insert into public.admin_audit_log(actor_id,action,target_user_id,target_table,target_id,new_value)
 values(auth.uid(),'team_permissions_updated',v_inv.accepted_by,'staff_invitations',v_inv.id,jsonb_build_object('permissions',p_permissions));
 return jsonb_build_object('ok',true);
end;$function$;

create or replace function public.staff_list_tickets(p_scope text default 'all')
returns jsonb language plpgsql stable security definer set search_path=public
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_rows jsonb;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false;
 if v_role not in ('support_agent','vice_admin','super_admin','owner') then return jsonb_build_object('ok',false,'error','support role required'); end if;
 if v_role='support_agent' and not exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active') then return jsonb_build_object('ok',false,'error','appointment inactive'); end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',t.id,'subject',t.subject,'status',t.status,'user_id',t.user_id,
  'username',(select username from public.users where id=t.user_id),
  'assigned_agent_id',t.assigned_agent_id,'assigned_to_me',t.assigned_agent_id=v_uid,
  'category',(select category_name from public.ticket_categories where id=t.category_id),
  'priority',(select handling_priority from public.ticket_categories where id=t.category_id),
  'created_at',t.created_at,'updated_at',t.updated_at,
  'unread',(select count(*) from public.ticket_messages m where m.ticket_id=t.id and m.read_by_staff=false)
 ) order by t.updated_at desc),'[]'::jsonb) into v_rows
 from public.platform_tickets t
 where t.status in ('open','in_progress')
 and (p_scope='all' and v_role<>'support_agent' or p_scope='mine' and t.assigned_agent_id=v_uid or p_scope='all' and (t.assigned_agent_id is null or t.assigned_agent_id=v_uid))
 limit 200;
 return jsonb_build_object('ok',true,'tickets',v_rows);
end;$function$;

grant execute on function public.admin_invite_staff(text,text,jsonb,text,text,uuid) to authenticated;
grant execute on function public.accept_staff_invitation(text) to authenticated;
grant execute on function public.staff_my_profile() to authenticated;
grant execute on function public.admin_list_invitations() to authenticated;
grant execute on function public.admin_set_team_member_status(uuid,text) to authenticated;
grant execute on function public.admin_update_team_permissions(uuid,jsonb) to authenticated;
grant execute on function public.staff_list_tickets(text) to authenticated;
