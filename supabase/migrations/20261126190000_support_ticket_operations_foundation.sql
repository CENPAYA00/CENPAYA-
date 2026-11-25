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
