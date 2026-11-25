-- Freelance service escrow foundation.
-- Service orders are distinct from physical marketplace orders.
-- All money movement remains server-side through authenticated Worker RPCs.

begin;

create table if not exists public.service_orders (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null,
  package_id uuid not null,
  buyer_id uuid not null references public.users(id) on delete restrict,
  seller_id uuid not null references public.users(id) on delete restrict,
  amount bigint not null check (amount > 0),
  fee_pct numeric(8,4) not null default 0,
  fee_fixed bigint not null default 0 check (fee_fixed >= 0),
  platform_fee bigint not null default 0 check (platform_fee >= 0),
  total_amount bigint not null check (total_amount >= amount),
  currency_code varchar(8) not null default 'XAF',
  payment_method text,
  payment_reference text,
  requirements text not null,
  escrow_status text not null default 'awaiting_acceptance'
    check (escrow_status in ('awaiting_acceptance','hold','in_progress','delivered','revision_requested','released','refunded','disputed','cancelled','deadline_refunded')),
  dispute_hold boolean not null default false,
  seller_accepted_at timestamptz,
  confirmed_delivery_at timestamptz,
  original_delivery_at timestamptz,
  delivery_note text,
  delivery_file_url text,
  delivered_at timestamptz,
  buyer_confirmed_received boolean not null default false,
  buyer_confirmed_received_at timestamptz,
  auto_release_deadline_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_orders_distinct_parties check (buyer_id <> seller_id)
);

create index if not exists service_orders_buyer_created_idx on public.service_orders (buyer_id, created_at desc);
create index if not exists service_orders_seller_created_idx on public.service_orders (seller_id, created_at desc);
create index if not exists service_orders_deadline_idx on public.service_orders (confirmed_delivery_at)
  where escrow_status in ('hold','in_progress') and dispute_hold=false;
create index if not exists service_orders_release_deadline_idx on public.service_orders (auto_release_deadline_at)
  where escrow_status='delivered' and dispute_hold=false;

create table if not exists public.service_order_deadline_changes (
  id uuid primary key default gen_random_uuid(),
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  requested_by uuid not null references public.users(id) on delete restrict,
  old_deadline_at timestamptz not null,
  proposed_deadline_at timestamptz not null,
  buyer_approved_at timestamptz,
  seller_approved_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  check (old_deadline_at <> proposed_deadline_at)
);
create index if not exists service_order_deadline_changes_order_idx on public.service_order_deadline_changes(service_order_id,created_at desc);

create table if not exists public.service_order_milestones (
  id uuid primary key default gen_random_uuid(),
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 160),
  description text,
  amount bigint not null check (amount > 0),
  sequence_no integer not null check (sequence_no > 0),
  status text not null default 'pending'
    check (status in ('pending','funded','in_progress','submitted','revision_requested','accepted','released','refunded')),
  delivery_note text,
  delivery_file_url text,
  due_at timestamptz,
  submitted_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(service_order_id,sequence_no)
);
create index if not exists service_order_milestones_order_idx on public.service_order_milestones(service_order_id,sequence_no);

alter table public.service_orders enable row level security;
alter table public.service_order_deadline_changes enable row level security;
alter table public.service_order_milestones enable row level security;

drop policy if exists service_orders_participant_read on public.service_orders;
create policy service_orders_participant_read on public.service_orders for select to authenticated
  using (buyer_id=(select auth.uid()) or seller_id=(select auth.uid()) or public.is_support_or_admin());

drop policy if exists service_order_deadline_changes_participant_read on public.service_order_deadline_changes;
create policy service_order_deadline_changes_participant_read on public.service_order_deadline_changes for select to authenticated
  using (exists(select 1 from public.service_orders so where so.id=service_order_id
    and (so.buyer_id=(select auth.uid()) or so.seller_id=(select auth.uid()) or public.is_support_or_admin())));

drop policy if exists service_order_milestones_participant_read on public.service_order_milestones;
create policy service_order_milestones_participant_read on public.service_order_milestones for select to authenticated
  using (exists(select 1 from public.service_orders so where so.id=service_order_id
    and (so.buyer_id=(select auth.uid()) or so.seller_id=(select auth.uid()) or public.is_support_or_admin())));

grant select on public.service_orders,public.service_order_deadline_changes,public.service_order_milestones to authenticated;
revoke insert,update,delete on public.service_orders,public.service_order_deadline_changes,public.service_order_milestones from anon,authenticated;

commit;
