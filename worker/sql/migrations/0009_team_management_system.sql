-- Consolidated team-management schema and RPC migration for the Supabase Worker branch.
-- Prepared for deployment; not applied by this commit.


-- ===== Source migration: supabase/migrations/20261126190000_support_ticket_operations_foundation.sql =====

-- Support operations foundation: restore the ticket tables referenced by the existing RPCs.
-- Additive and safe to re-run; no existing customer or financial records are modified.

create table if not exists public.ticket_categories (
  id uuid primary key default gen_random_uuid(),
  category_name text not null unique,
  handling_priority integer not null default 100 check (handling_priority between 1 and 1000),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  category_id uuid not null references public.ticket_categories(id) on delete restrict,
  associated_order_id uuid,
  subject text not null check (char_length(trim(subject)) between 3 and 240),
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  user_country varchar(3) not null default 'CM',
  assigned_agent_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.platform_tickets(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete restrict,
  sender_role text not null check (sender_role in ('user','support','admin')),
  body text not null check (char_length(trim(body)) between 1 and 10000),
  read_by_user boolean not null default false,
  read_by_staff boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists platform_tickets_queue_idx
  on public.platform_tickets(status, updated_at desc);
create index if not exists platform_tickets_assignee_idx
  on public.platform_tickets(assigned_agent_id, status, updated_at desc);
create index if not exists platform_tickets_user_idx
  on public.platform_tickets(user_id, updated_at desc);
create index if not exists ticket_messages_thread_idx
  on public.ticket_messages(ticket_id, created_at asc);
create index if not exists ticket_messages_staff_unread_idx
  on public.ticket_messages(ticket_id) where read_by_staff = false;

alter table public.ticket_categories enable row level security;
alter table public.platform_tickets enable row level security;
alter table public.ticket_messages enable row level security;

-- No direct client table access: the existing SECURITY DEFINER RPCs enforce
-- ownership/role checks and provide the only supported access path.
revoke all on public.ticket_categories, public.platform_tickets, public.ticket_messages from anon, authenticated;
grant select on public.ticket_categories to authenticated;

insert into public.ticket_categories(category_name, handling_priority)
values ('General Support', 100), ('Payments', 20), ('Account & Security', 10), ('Marketplace', 50), ('Complaints & Escalations', 5)
on conflict (category_name) do nothing;

-- Prevent ticket claims from silently stealing another agent's active assignment.
create or replace function public.staff_claim_ticket(p_ticket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_updated uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not authenticated');
  end if;
  if not public.is_support_or_admin() then
    return jsonb_build_object('ok', false, 'error', 'staff only');
  end if;

  update public.platform_tickets
     set assigned_agent_id = v_uid,
         status = 'in_progress',
         updated_at = now()
   where id = p_ticket_id
     and status in ('open','in_progress')
     and (assigned_agent_id is null or assigned_agent_id = v_uid)
  returning id into v_updated;

  if v_updated is null then
    return jsonb_build_object('ok', false, 'error', 'ticket unavailable or assigned to another agent');
  end if;
  return jsonb_build_object('ok', true, 'ticket_id', v_updated);
end;
$function$;

grant execute on function public.staff_claim_ticket(uuid) to authenticated;


-- ===== Source migration: supabase/migrations/20261126200000_lock_support_ticket_actions_to_assignees.sql =====

-- Tighten support-agent ticket isolation.
-- Agents can preview/claim unassigned tickets, but only the assignee (or Owner/Super Admin)
-- can reply to, resolve, close, or otherwise mutate an assigned ticket.

alter table public.ticket_messages
  drop constraint if exists ticket_messages_sender_role_check;
alter table public.ticket_messages
  add constraint ticket_messages_sender_role_check
  check (sender_role in ('user','support','admin'));

create or replace function public.get_ticket_thread(p_ticket_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_ticket public.platform_tickets%rowtype;
  v_messages jsonb;
  v_is_elevated boolean;
  v_is_support boolean;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  select * into v_ticket from public.platform_tickets where id=p_ticket_id;
  if v_ticket.id is null then return jsonb_build_object('ok',false,'error','not found'); end if;

  v_is_elevated := public.is_owner() or public.is_super_admin() or exists(select 1 from public.staff_invitations where accepted_by=v_uid and role='vice_admin' and appointment_status='active' and permissions ? 'can_manage_support_agents');
  v_is_support := public.is_support_or_admin() or exists(select 1 from public.staff_invitations where accepted_by=v_uid and role='vice_admin' and appointment_status='active' and (permissions ? 'can_manage_tickets' or permissions ? 'can_manage_support_agents'));
  if v_ticket.user_id <> v_uid and not v_is_elevated
     and not (v_is_support and (v_ticket.assigned_agent_id is null or v_ticket.assigned_agent_id=v_uid)) then
    return jsonb_build_object('ok',false,'error','not authorized');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'sender_id',m.sender_id,'sender_role',m.sender_role,
    'sender_username',(select username from public.users where id=m.sender_id),
    'body',m.body,'created_at',m.created_at
  ) order by m.created_at),'[]'::jsonb)
  into v_messages from public.ticket_messages m where m.ticket_id=p_ticket_id;

  return jsonb_build_object(
    'ok',true,
    'ticket',jsonb_build_object(
      'id',v_ticket.id,'subject',v_ticket.subject,'status',v_ticket.status,
      'category',(select category_name from public.ticket_categories where id=v_ticket.category_id),
      'user_id',v_ticket.user_id,
      'user_username',(select username from public.users where id=v_ticket.user_id),
      'assigned_agent_id',v_ticket.assigned_agent_id,
      'created_at',v_ticket.created_at
    ),
    'messages',v_messages
  );
end;
$function$;

create or replace function public.send_ticket_message(p_ticket_id uuid,p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_assignee uuid;
  v_is_support boolean;
  v_is_elevated boolean;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  if p_body is null or char_length(trim(p_body))=0 or char_length(p_body)>10000 then
    return jsonb_build_object('ok',false,'error','invalid message');
  end if;

  select user_id,assigned_agent_id into v_owner,v_assignee
  from public.platform_tickets where id=p_ticket_id for update;
  if v_owner is null then return jsonb_build_object('ok',false,'error','ticket not found'); end if;

  v_is_support := public.is_support_or_admin();
  v_is_elevated := public.is_owner() or public.is_super_admin();
  if v_owner <> v_uid and not v_is_support then
    return jsonb_build_object('ok',false,'error','not authorized');
  end if;
  if v_is_support and not v_is_elevated and v_assignee is distinct from v_uid then
    return jsonb_build_object('ok',false,'error','claim this ticket before replying');
  end if;

  insert into public.ticket_messages(ticket_id,sender_id,sender_role,body,read_by_user,read_by_staff)
  values(p_ticket_id,v_uid,case when v_is_support then 'support' else 'user' end,trim(p_body),not v_is_support,v_is_support);

  update public.platform_tickets
     set updated_at=now(),
         status=case when v_is_support and status='open' then 'in_progress' else status end
   where id=p_ticket_id;
  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function public.set_ticket_status(p_ticket_id uuid,p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_assignee uuid;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  if not (public.is_support_or_admin() or exists(select 1 from public.staff_invitations where accepted_by=v_uid and role='vice_admin' and appointment_status='active' and permissions ? 'can_manage_tickets')) then return jsonb_build_object('ok',false,'error','staff only'); end if;
  if p_status is null or p_status not in ('open','in_progress','resolved','closed') then
    return jsonb_build_object('ok',false,'error','invalid status');
  end if;

  select assigned_agent_id into v_assignee
  from public.platform_tickets where id=p_ticket_id for update;
  if not found then return jsonb_build_object('ok',false,'error','ticket not found'); end if;
  if not (public.is_owner() or public.is_super_admin())
     and v_assignee is distinct from v_uid then
    return jsonb_build_object('ok',false,'error','claim this ticket before changing its status');
  end if;

  update public.platform_tickets set status=p_status,updated_at=now() where id=p_ticket_id;
  return jsonb_build_object('ok',true);
end;
$function$;

grant execute on function public.get_ticket_thread(uuid) to authenticated;
grant execute on function public.send_ticket_message(uuid,text) to authenticated;
grant execute on function public.set_ticket_status(uuid,text) to authenticated;


-- ===== Source migration: supabase/migrations/20261126210000_team_management_roles_and_lifecycle.sql =====

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


-- ===== Source migration: supabase/migrations/20261126220000_team_operations_workflows.sql =====

-- Team task, communication, escalation and oversight RPCs.
-- All access is scoped to accepted, active appointments and audited actions.

create or replace function public.team_my_tasks()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_rows jsonb;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;
 if v_role not in ('staff_member','support_agent','vice_admin','super_admin','owner') then return jsonb_build_object('ok',false,'error','team role required'); end if;
 if v_role in ('staff_member','support_agent','vice_admin') and not exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active') then return jsonb_build_object('ok',false,'error','appointment inactive'); end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',t.id,'title',t.title,'description',t.description,'status',t.status,'due_at',t.due_at,
  'assigned_to',t.assigned_to,'assigned_by',t.assigned_by,'supervisor_id',t.supervisor_id,
  'created_at',t.created_at,'updated_at',t.updated_at,
  'updates',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'author_id',u.author_id,'update_type',u.update_type,'body',u.body,'attachment_url',u.attachment_url,'created_at',u.created_at) order by u.created_at),'[]'::jsonb) from public.team_task_updates u where u.task_id=t.id)
 ) order by t.due_at nulls last,t.created_at desc),'[]'::jsonb)
 into v_rows from public.team_tasks t
 where t.assigned_to=v_uid
    or (v_role in ('vice_admin','super_admin','owner') and (t.supervisor_id=v_uid or v_role in ('super_admin','owner')))
    or (v_role='support_agent' and exists(select 1 from public.staff_invitations i where i.accepted_by=v_uid and i.appointment_status='active' and i.permissions ? 'can_supervise_staff') and t.supervisor_id=v_uid);
 return jsonb_build_object('ok',true,'tasks',v_rows);
end;$function$;

create or replace function public.team_assign_task(
 p_title text,p_description text,p_assigned_to uuid,p_due_at timestamptz default null,p_department_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_id uuid; v_allowed boolean:=false;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;
 if v_role in ('owner','super_admin') then v_allowed:=true;
 elsif v_role='vice_admin' then
   select exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_manage_tasks') into v_allowed;
 elsif v_role='support_agent' then
   select exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_supervise_staff') into v_allowed;
 end if;
 if not v_allowed then return jsonb_build_object('ok',false,'error','task assignment permission required'); end if;
 if p_title is null or char_length(trim(p_title)) not between 3 and 160 then return jsonb_build_object('ok',false,'error','task title must be 3-160 characters'); end if;
 if not exists(select 1 from public.users where id=p_assigned_to and role='staff_member' and banned=false and coalesce(is_deactivated,false)=false)
    or not exists(select 1 from public.staff_invitations where accepted_by=p_assigned_to and appointment_status='active') then
   return jsonb_build_object('ok',false,'error','assignee is not an active Staff Member');
 end if;
 insert into public.team_tasks(title,description,assigned_to,assigned_by,supervisor_id,due_at,department_id)
 values(trim(p_title),nullif(trim(p_description),''),p_assigned_to,v_uid,v_uid,p_due_at,p_department_id)
 returning id into v_id;
 insert into public.team_task_updates(task_id,author_id,update_type,body)
 values(v_id,v_uid,'status_change','Task assigned');
 insert into public.admin_audit_log(actor_id,action,target_user_id,target_table,target_id,new_value)
 values(v_uid,'team_task_assigned',p_assigned_to,'team_tasks',v_id,jsonb_build_object('title',p_title,'due_at',p_due_at));
 return jsonb_build_object('ok',true,'task_id',v_id);
end;$function$;

create or replace function public.team_update_task(p_task_id uuid,p_status text,p_body text default null,p_attachment_url text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_task public.team_tasks%rowtype; v_role text; v_manager boolean:=false;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select * into v_task from public.team_tasks where id=p_task_id for update;
 if v_task.id is null then return jsonb_build_object('ok',false,'error','task not found'); end if;
 select role into v_role from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;
 v_manager:=v_role in ('owner','super_admin','vice_admin') and (v_role<>'vice_admin' or exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_manage_tasks'));
 if v_uid<>v_task.assigned_to and v_uid<>v_task.supervisor_id and not v_manager then return jsonb_build_object('ok',false,'error','not authorized for this task'); end if;
 if v_uid=v_task.assigned_to and p_status not in ('todo','in_progress','blocked','submitted') then return jsonb_build_object('ok',false,'error','staff can only submit or update their own work'); end if;
 if v_uid<>v_task.assigned_to and p_status not in ('todo','in_progress','blocked','submitted','completed','cancelled') then return jsonb_build_object('ok',false,'error','invalid task status'); end if;
 if p_body is not null and char_length(p_body)>5000 then return jsonb_build_object('ok',false,'error','update too long'); end if;
 update public.team_tasks set status=p_status,updated_at=now(),completed_at=case when p_status='completed' then now() when p_status<>'completed' then null else completed_at end where id=p_task_id;
 if p_body is not null or p_attachment_url is not null or p_status<>v_task.status then
  insert into public.team_task_updates(task_id,author_id,update_type,body,attachment_url)
  values(p_task_id,v_uid,case when p_status='submitted' then 'submission' when p_attachment_url is not null then 'evidence' when p_status<>v_task.status then 'status_change' else 'comment' end,nullif(trim(p_body),''),p_attachment_url);
 end if;
 insert into public.admin_audit_log(actor_id,action,target_user_id,target_table,target_id,old_value,new_value)
 values(v_uid,'team_task_updated',v_task.assigned_to,'team_tasks',p_task_id,jsonb_build_object('status',v_task.status),jsonb_build_object('status',p_status));
 return jsonb_build_object('ok',true);
end;$function$;

create or replace function public.team_admin_overview()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_can boolean:=false; v_result jsonb;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;
 if v_role in ('owner','super_admin') then v_can:=true;
 elsif v_role='vice_admin' then select exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_view_team_metrics') into v_can;
 end if;
 if not v_can then return jsonb_build_object('ok',false,'error','team oversight permission required'); end if;
 select jsonb_build_object(
  'active_members',(select count(*) from public.staff_invitations where appointment_status='active'),
  'pending_appointments',(select count(*) from public.staff_invitations where appointment_status='pending'),
  'suspended_members',(select count(*) from public.staff_invitations where appointment_status='suspended'),
  'tasks_pending',(select count(*) from public.team_tasks where status in ('todo','in_progress','blocked','submitted')),
  'tasks_overdue',(select count(*) from public.team_tasks where due_at<now() and status not in ('completed','cancelled')),
  'tasks_completed',(select count(*) from public.team_tasks where status='completed' and completed_at>=now()-interval '30 days'),
  'tasks_completed_today',(select count(*) from public.team_tasks where status='completed' and completed_at>=date_trunc('day',now())),
  'tasks_completed_week',(select count(*) from public.team_tasks where status='completed' and completed_at>=date_trunc('week',now())),
  'tasks_completed_month',(select count(*) from public.team_tasks where status='completed' and completed_at>=date_trunc('month',now())),
  'member_performance',(select coalesce(jsonb_agg(to_jsonb(perf) order by perf.username),'[]'::jsonb) from (
    select u.id as user_id,u.username,count(t.id) as assigned,
      count(t.id) filter(where t.status='completed') as completed,
      count(t.id) filter(where t.due_at<now() and t.status not in ('completed','cancelled')) as overdue
    from public.users u join public.team_tasks t on t.assigned_to=u.id
    group by u.id,u.username order by u.username limit 50
  ) perf),
  'open_escalations',(select count(*) from public.team_escalations where status in ('open','in_progress')),
  'tickets_open',(select count(*) from public.platform_tickets where status in ('open','in_progress')),
  'recent_audit',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'actor_id',a.actor_id,'action',a.action,'target_user_id',a.target_user_id,'created_at',a.created_at,'new_value',a.new_value) order by a.created_at desc),'[]'::jsonb) from (select * from public.admin_audit_log where target_table in ('staff_invitations','team_tasks','team_escalations') order by created_at desc limit 30) a)
 ) into v_result;
 return jsonb_build_object('ok',true,'overview',v_result);
end;$function$;

create or replace function public.team_create_conversation(
 p_type text,p_title text,p_member_ids uuid[],p_department_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_id uuid; v_role text;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;
 if v_role not in ('owner','super_admin','vice_admin','support_agent','staff_member') then return jsonb_build_object('ok',false,'error','team access required'); end if;
 if p_type not in ('direct','department','announcement','escalation') then return jsonb_build_object('ok',false,'error','invalid conversation type'); end if;
 if p_type in ('announcement','department') and v_role not in ('owner','super_admin','vice_admin') then return jsonb_build_object('ok',false,'error','supervisor permission required'); end if;
 insert into public.team_conversations(conversation_type,title,department_id,created_by)
 values(p_type,nullif(trim(p_title),''),p_department_id,v_uid) returning id into v_id;
 insert into public.team_conversation_members(conversation_id,user_id,added_by)
 values(v_id,v_uid,v_uid) on conflict do nothing;
 insert into public.team_conversation_members(conversation_id,user_id,added_by)
 select v_id,m,v_uid from unnest(coalesce(p_member_ids,'{}'::uuid[])) m
 join public.users u on u.id=m and u.role in ('owner','super_admin','vice_admin','support_agent','staff_member') and u.banned=false
 on conflict do nothing;
 return jsonb_build_object('ok',true,'conversation_id',v_id);
end;$function$;

create or replace function public.team_list_conversations()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_rows jsonb;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',c.id,'type',c.conversation_type,'title',c.title,'created_at',c.created_at,
  'last_message',(select body from public.team_messages m where m.conversation_id=c.id and m.deleted_at is null order by m.created_at desc limit 1),
  'last_message_at',(select max(created_at) from public.team_messages m where m.conversation_id=c.id)
 ) order by (select max(created_at) from public.team_messages m where m.conversation_id=c.id) desc nulls last),'[]'::jsonb)
 into v_rows from public.team_conversations c join public.team_conversation_members cm on cm.conversation_id=c.id
 where cm.user_id=v_uid and c.is_archived=false;
 return jsonb_build_object('ok',true,'conversations',v_rows);
end;$function$;

create or replace function public.team_send_message(p_conversation_id uuid,p_body text,p_attachment_url text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_id uuid;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 if p_body is null or char_length(trim(p_body))=0 or char_length(p_body)>10000 then return jsonb_build_object('ok',false,'error','invalid message'); end if;
 if not exists(select 1 from public.team_conversation_members where conversation_id=p_conversation_id and user_id=v_uid) then return jsonb_build_object('ok',false,'error','not a conversation member'); end if;
 insert into public.team_messages(conversation_id,sender_id,body,attachment_url)
 values(p_conversation_id,v_uid,trim(p_body),p_attachment_url) returning id into v_id;
 return jsonb_build_object('ok',true,'message_id',v_id);
end;$function$;

create or replace function public.team_raise_escalation(p_reason text,p_level text,p_ticket_id uuid default null,p_task_id uuid default null,p_assigned_to uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_id uuid;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;
 if v_role not in ('support_agent','staff_member','vice_admin','super_admin','owner') then return jsonb_build_object('ok',false,'error','team access required'); end if;
 if v_role='staff_member' and not exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active') then return jsonb_build_object('ok',false,'error','appointment inactive'); end if;
 if p_level is null or p_level not in ('vice_admin','super_admin','owner') or p_reason is null or char_length(trim(p_reason)) not between 5 and 5000 then return jsonb_build_object('ok',false,'error','invalid escalation'); end if;
 if p_level='owner' and v_role not in ('vice_admin','super_admin','owner') then return jsonb_build_object('ok',false,'error','owner escalation only for supervisors'); end if;
 insert into public.team_escalations(ticket_id,task_id,raised_by,assigned_to,escalation_level,reason)
 values(p_ticket_id,p_task_id,v_uid,p_assigned_to,p_level,trim(p_reason)) returning id into v_id;
 insert into public.admin_audit_log(actor_id,action,target_table,target_id,new_value)
 values(v_uid,'team_escalation_created','team_escalations',v_id,jsonb_build_object('level',p_level,'ticket_id',p_ticket_id,'task_id',p_task_id));
 return jsonb_build_object('ok',true,'escalation_id',v_id);
end;$function$;

create or replace function public.team_list_escalations()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_rows jsonb;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;
 if v_role not in ('vice_admin','super_admin','owner') then return jsonb_build_object('ok',false,'error','supervisor access required'); end if;
 select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]'::jsonb) into v_rows
 from public.team_escalations e
 where (v_role in ('super_admin','owner') or e.escalation_level in ('vice_admin','super_admin') or e.assigned_to=v_uid);
 return jsonb_build_object('ok',true,'escalations',v_rows);
end;$function$;

create or replace function public.team_update_escalation(p_id uuid,p_status text,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;
 if v_role not in ('vice_admin','super_admin','owner') then return jsonb_build_object('ok',false,'error','supervisor access required'); end if;
 if p_status is null or p_status not in ('open','in_progress','resolved','dismissed') then return jsonb_build_object('ok',false,'error','invalid status'); end if;
 update public.team_escalations set status=p_status,resolution_note=nullif(trim(p_note),''),updated_at=now(),resolved_at=case when p_status in ('resolved','dismissed') then now() else null end
 where id=p_id and (v_role in ('super_admin','owner') or assigned_to=v_uid or escalation_level='vice_admin');
 if not found then return jsonb_build_object('ok',false,'error','escalation not found or not authorized'); end if;
 insert into public.admin_audit_log(actor_id,action,target_table,target_id,new_value)
 values(v_uid,'team_escalation_'||p_status,'team_escalations',p_id,jsonb_build_object('note',p_note));
 return jsonb_build_object('ok',true);
end;$function$;

grant execute on function public.team_my_tasks() to authenticated;
grant execute on function public.team_assign_task(text,text,uuid,timestamptz,uuid) to authenticated;
grant execute on function public.team_update_task(uuid,text,text,text) to authenticated;
grant execute on function public.team_admin_overview() to authenticated;
grant execute on function public.team_create_conversation(text,text,uuid[],uuid) to authenticated;
grant execute on function public.team_list_conversations() to authenticated;
grant execute on function public.team_send_message(uuid,text,text) to authenticated;
grant execute on function public.team_raise_escalation(text,text,uuid,uuid,uuid) to authenticated;
grant execute on function public.team_list_escalations() to authenticated;
grant execute on function public.team_update_escalation(uuid,text,text) to authenticated;


-- ===== Source migration: supabase/migrations/20261126230000_team_access_and_permission_hardening.sql =====

-- Team communications read APIs and permission hardening.

create or replace function public.team_available_colleagues()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_rows jsonb;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 if not exists(select 1 from public.users where id=v_uid and role in ('owner','super_admin','vice_admin','support_agent','staff_member') and banned=false) then return jsonb_build_object('ok',false,'error','team access required'); end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'username',u.username,'role',u.role,'title',i.official_title,'department',i.department) order by u.username),'[]'::jsonb)
 into v_rows
 from public.users u left join lateral (
   select official_title,department from public.staff_invitations si
   where si.accepted_by=u.id and si.appointment_status='active' order by accepted_at desc limit 1
 ) i on true
 where u.banned=false and coalesce(u.is_deactivated,false)=false and (
   u.role in ('owner','super_admin') or exists(select 1 from public.staff_invitations si where si.accepted_by=u.id and si.appointment_status='active')
 );
 return jsonb_build_object('ok',true,'members',v_rows);
end;$function$;

create or replace function public.team_get_messages(p_conversation_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_rows jsonb;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 if not exists(select 1 from public.team_conversation_members where conversation_id=p_conversation_id and user_id=v_uid) then return jsonb_build_object('ok',false,'error','not a conversation member'); end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'sender_id',m.sender_id,'sender_name',u.username,'body',m.body,'attachment_url',m.attachment_url,'created_at',m.created_at) order by m.created_at),'[]'::jsonb)
 into v_rows from public.team_messages m join public.users u on u.id=m.sender_id
 where m.conversation_id=p_conversation_id and m.deleted_at is null;
 update public.team_conversation_members set last_read_at=now() where conversation_id=p_conversation_id and user_id=v_uid;
 return jsonb_build_object('ok',true,'messages',v_rows);
end;$function$;

create or replace function public.team_list_escalations()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_rows jsonb; v_allowed boolean:=false;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;
 if v_role in ('super_admin','owner') then v_allowed:=true;
 elsif v_role='vice_admin' then
  select exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_manage_escalations') into v_allowed;
 end if;
 if not v_allowed then return jsonb_build_object('ok',false,'error','escalation permission required'); end if;
 select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]'::jsonb) into v_rows
 from public.team_escalations e
 where (v_role in ('super_admin','owner') or e.escalation_level in ('vice_admin','super_admin') or e.assigned_to=v_uid);
 return jsonb_build_object('ok',true,'escalations',v_rows);
end;$function$;

create or replace function public.team_update_escalation(p_id uuid,p_status text,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_allowed boolean:=false;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;
 if v_role in ('super_admin','owner') then v_allowed:=true;
 elsif v_role='vice_admin' then
  select exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_manage_escalations') into v_allowed;
 end if;
 if not v_allowed then return jsonb_build_object('ok',false,'error','escalation permission required'); end if;
 if p_status is null or p_status not in ('open','in_progress','resolved','dismissed') then return jsonb_build_object('ok',false,'error','invalid status'); end if;
 update public.team_escalations set status=p_status,resolution_note=nullif(trim(p_note),''),updated_at=now(),resolved_at=case when p_status in ('resolved','dismissed') then now() else null end
 where id=p_id and (v_role in ('super_admin','owner') or assigned_to=v_uid or escalation_level='vice_admin');
 if not found then return jsonb_build_object('ok',false,'error','escalation not found or not authorized'); end if;
 insert into public.admin_audit_log(actor_id,action,target_table,target_id,new_value)
 values(v_uid,'team_escalation_'||p_status,'team_escalations',p_id,jsonb_build_object('note',p_note));
 return jsonb_build_object('ok',true);
end;$function$;

grant execute on function public.team_available_colleagues() to authenticated;
grant execute on function public.team_get_messages(uuid) to authenticated;
grant execute on function public.team_list_escalations() to authenticated;
grant execute on function public.team_update_escalation(uuid,text,text) to authenticated;


-- ===== Source migration: supabase/migrations/20261126240000_team_delegation_and_roster_access.sql =====

-- Allow delegated Vice Admins to manage only the team scopes granted by Owner.

create or replace function public.admin_list_invitations()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_rows jsonb; v_can boolean:=false;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;
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
 if not exists(select 1 from public.users where id=v_uid and role in ('owner','super_admin','vice_admin','support_agent','staff_member') and banned=false and coalesce(is_deactivated,false)=false) then return jsonb_build_object('ok',false,'error','team access required'); end if;
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
 where u.banned=false and coalesce(u.is_deactivated,false)=false and (
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
 select role into v_role from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;
 if v_role not in ('owner','super_admin','vice_admin','support_agent','staff_member') then return jsonb_build_object('ok',false,'error','team access required'); end if;
 if p_type is null or p_type not in ('direct','department','announcement','escalation') then return jsonb_build_object('ok',false,'error','invalid conversation type'); end if;
 if v_role in ('owner','super_admin') then v_allowed:=true;
 elsif v_role='vice_admin' then
  select exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_manage_team_communications') into v_allowed;
 end if;
 if p_type<>'direct' and not v_allowed then return jsonb_build_object('ok',false,'error','team communication management permission required'); end if;
 if p_type='direct' and coalesce(array_length(p_member_ids,1),0)<>1 then return jsonb_build_object('ok',false,'error','direct message requires exactly one recipient'); end if;
 if p_type='department' and p_department_id is null then return jsonb_build_object('ok',false,'error','department required for department conversation'); end if;
 insert into public.team_conversations(conversation_type,title,department_id,created_by)
 values(p_type,nullif(trim(p_title),''),p_department_id,v_uid) returning id into v_id;
 insert into public.team_conversation_members(conversation_id,user_id,added_by)
 values(v_id,v_uid,v_uid) on conflict do nothing;
 insert into public.team_conversation_members(conversation_id,user_id,added_by)
 select v_id,selected.user_id,v_uid from unnest(coalesce(p_member_ids,'{}'::uuid[])) as selected(user_id)
 join public.users u on u.id=selected.user_id and u.banned=false and coalesce(u.is_deactivated,false)=false and (u.role in ('owner','super_admin')
    or (u.role in ('vice_admin','support_agent','staff_member')
        and exists(select 1 from public.staff_invitations si where si.accepted_by=u.id and si.appointment_status='active')))
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
  join public.team_departments d on lower(d.name)=lower(si.department) and d.id=p_department_id
  where si.appointment_status='active' and si.accepted_by is not null
    and si.accepted_by<>v_uid and public.is_active_team_member(si.accepted_by)
  on conflict do nothing;
 end if;
 insert into public.admin_audit_log(actor_id,action,target_table,target_id,new_value)
 values(v_uid,'team_conversation_created','team_conversations',v_id,jsonb_build_object('type',p_type,'member_count',coalesce(array_length(p_member_ids,1),0)));
 return jsonb_build_object('ok',true,'conversation_id',v_id);
end;$function$;

grant execute on function public.admin_list_invitations() to authenticated;
grant execute on function public.team_available_colleagues() to authenticated;
grant execute on function public.team_create_conversation(text,text,uuid[],uuid) to authenticated;


-- ===== Source migration: supabase/migrations/20261126250000_team_escalation_scope.sql =====

-- Final permission scope for Vice Admin ticket oversight and team escalations.

create or replace function public.staff_list_tickets(p_scope text default 'all')
returns jsonb language plpgsql stable security definer set search_path=public
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_rows jsonb; v_allowed boolean:=false;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;
 if v_role in ('owner','super_admin') then v_allowed:=true;
 elsif v_role='support_agent' then
   select exists(select 1 from public.staff_invitations where accepted_by=v_uid and role='support_agent' and appointment_status='active') into v_allowed;
 elsif v_role='vice_admin' then
   select exists(select 1 from public.staff_invitations where accepted_by=v_uid and role='vice_admin' and appointment_status='active' and (permissions ? 'can_manage_tickets' or permissions ? 'can_manage_support_agents')) into v_allowed;
 end if;
 if not v_allowed then return jsonb_build_object('ok',false,'error','support ticket access permission required'); end if;
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
 and (
   (p_scope='mine' and t.assigned_agent_id=v_uid)
   or (p_scope='all' and (v_role in ('owner','super_admin','vice_admin') or t.assigned_agent_id is null or t.assigned_agent_id=v_uid))
 );
 return jsonb_build_object('ok',true,'tickets',v_rows);
end;$function$;

create or replace function public.team_raise_escalation(
 p_reason text,p_level text,p_ticket_id uuid default null,p_task_id uuid default null,p_assigned_to uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_allowed boolean:=false; v_id uuid;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;
 if v_role='owner' or v_role='super_admin' then v_allowed:=true;
 elsif v_role='support_agent' then
   select exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_escalate') into v_allowed;
 elsif v_role='staff_member' then
   select exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_submit_reports') into v_allowed;
 elsif v_role='vice_admin' then
   select exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_manage_escalations') into v_allowed;
 end if;
 if not v_allowed then return jsonb_build_object('ok',false,'error','escalation permission required'); end if;
 if p_level is null or p_level not in ('vice_admin','super_admin','owner') or p_reason is null or char_length(trim(p_reason)) not between 5 and 5000 then
   return jsonb_build_object('ok',false,'error','invalid escalation');
 end if;
 if v_role in ('support_agent','staff_member') and p_level<>'vice_admin' then
   return jsonb_build_object('ok',false,'error','this role may escalate only to Vice Admin');
 end if;
 if v_role='vice_admin' and p_level not in ('super_admin','owner') then
   return jsonb_build_object('ok',false,'error','Vice Admin escalations must go to Super Admin or Owner');
 end if;
 if p_ticket_id is not null and not exists(select 1 from public.platform_tickets where id=p_ticket_id) then return jsonb_build_object('ok',false,'error','ticket not found'); end if;
 if p_task_id is not null and not exists(select 1 from public.team_tasks where id=p_task_id) then return jsonb_build_object('ok',false,'error','task not found'); end if;
 insert into public.team_escalations(ticket_id,task_id,raised_by,assigned_to,escalation_level,reason)
 values(p_ticket_id,p_task_id,v_uid,p_assigned_to,p_level,trim(p_reason)) returning id into v_id;
 insert into public.admin_audit_log(actor_id,action,target_table,target_id,new_value)
 values(v_uid,'team_escalation_created','team_escalations',v_id,jsonb_build_object('level',p_level,'ticket_id',p_ticket_id,'task_id',p_task_id));
 return jsonb_build_object('ok',true,'escalation_id',v_id);
end;$function$;

grant execute on function public.staff_list_tickets(text) to authenticated;
grant execute on function public.team_raise_escalation(text,text,uuid,uuid,uuid) to authenticated;


-- ===== Source migration: supabase/migrations/20261126260000_team_notifications.sql =====

-- Private team notifications for internal messages, task updates and escalations.

create table if not exists public.team_notifications (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references public.users(id) on delete cascade,
 event_type text not null check (event_type in ('team_message','task_update','escalation')),
 title text not null,
 body text,
 entity_type text,
 entity_id uuid,
 read_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists team_notifications_inbox_idx on public.team_notifications(recipient_id,read_at,created_at desc);
alter table public.team_notifications enable row level security;
revoke all on public.team_notifications from anon,authenticated;

create or replace function public.notify_team_message()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_name text;
begin
 select username into v_name from public.users where id=new.sender_id;
 insert into public.team_notifications(recipient_id,event_type,title,body,entity_type,entity_id)
 select cm.user_id,'team_message','New team message',left(new.body,240),'team_conversation',new.conversation_id
 from public.team_conversation_members cm
 where cm.conversation_id=new.conversation_id and cm.user_id<>new.sender_id;
 return new;
end;$function$;
drop trigger if exists team_message_notification_trigger on public.team_messages;
create trigger team_message_notification_trigger after insert on public.team_messages
for each row execute function public.notify_team_message();

create or replace function public.notify_team_task_update()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_assigned uuid; v_supervisor uuid; v_title text;
begin
 select assigned_to,supervisor_id,title into v_assigned,v_supervisor,v_title from public.team_tasks where id=new.task_id;
 insert into public.team_notifications(recipient_id,event_type,title,body,entity_type,entity_id)
 select distinct target.user_id,'task_update','Task update: '||coalesce(v_title,'Team task'),coalesce(new.body,new.update_type),'team_task',new.task_id
 from (values(v_assigned),(v_supervisor)) as target(user_id)
 where target.user_id is not null and target.user_id<>new.author_id;
 return new;
end;$function$;
drop trigger if exists team_task_update_notification_trigger on public.team_task_updates;
create trigger team_task_update_notification_trigger after insert on public.team_task_updates
for each row execute function public.notify_team_task_update();

create or replace function public.notify_team_escalation()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $function$
begin
 if new.assigned_to is not null then
  insert into public.team_notifications(recipient_id,event_type,title,body,entity_type,entity_id)
  values(new.assigned_to,'escalation','New escalation',left(new.reason,240),'team_escalation',new.id);
 else
  insert into public.team_notifications(recipient_id,event_type,title,body,entity_type,entity_id)
  select u.id,'escalation','New '||replace(new.escalation_level,'_',' ')||' escalation',left(new.reason,240),'team_escalation',new.id
  from public.users u
  where (new.escalation_level='vice_admin' and u.role='vice_admin')
     or (new.escalation_level='super_admin' and u.role='super_admin')
     or (new.escalation_level='owner' and u.role='owner');
 end if;
 return new;
end;$function$;
drop trigger if exists team_escalation_notification_trigger on public.team_escalations;
create trigger team_escalation_notification_trigger after insert on public.team_escalations
for each row execute function public.notify_team_escalation();

create or replace function public.team_my_notifications(p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_rows jsonb;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'event_type',event_type,'title',title,'body',body,'entity_type',entity_type,'entity_id',entity_id,'read_at',read_at,'created_at',created_at) order by created_at desc),'[]'::jsonb)
 into v_rows from (select * from public.team_notifications where recipient_id=v_uid order by created_at desc limit greatest(1,least(p_limit,100))) n;
 return jsonb_build_object('ok',true,'notifications',v_rows);
end;$function$;

create or replace function public.team_mark_notification_read(p_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid();
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 update public.team_notifications set read_at=now() where id=p_id and recipient_id=v_uid;
 if not found then return jsonb_build_object('ok',false,'error','notification not found'); end if;
 return jsonb_build_object('ok',true);
end;$function$;

grant execute on function public.team_my_notifications(integer) to authenticated;
grant execute on function public.team_mark_notification_read(uuid) to authenticated;


-- ===== Source migration: supabase/migrations/20261126270000_team_message_search.sql =====

-- Searchable, membership-scoped internal communication history.

create or replace function public.team_search_messages(p_query text,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_rows jsonb;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
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
grant execute on function public.team_search_messages(text,integer) to authenticated;


-- ===== Source migration: supabase/migrations/20261126280000_team_appointment_and_department_management.sql =====

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
  select 1 from public.users u where u.id=p_supervisor_id and u.banned=false and
   (u.role in ('owner','super_admin') or exists(select 1 from public.staff_invitations si where si.accepted_by=u.id and si.role='vice_admin' and si.appointment_status='active'))
 ) then return jsonb_build_object('ok',false,'error','supervisor must be an active Vice Admin, Super Admin or Owner'); end if;
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


-- ===== Source migration: supabase/migrations/20261126290000_revoke_suspended_team_access.sql =====

-- Close every team-data path when an appointment is suspended or removed.

create or replace function public.is_active_team_member(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public,pg_temp
as $function$
 select exists(
  select 1 from public.users u
  where u.id=p_user_id and u.banned=false and coalesce(u.is_deactivated,false)=false and (
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
 if p_status is null then return jsonb_build_object('ok',false,'error','task status required'); end if;
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

