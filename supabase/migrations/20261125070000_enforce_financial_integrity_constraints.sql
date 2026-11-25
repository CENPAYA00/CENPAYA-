-- Financial invariants: reject impossible balances and settlement totals at the database boundary.
-- A preflight against the live data returned zero violations for every invariant.

alter table public.wallets
  add constraint wallets_available_funds_nonnegative
    check (available_funds >= 0) not valid,
  add constraint wallets_referral_available_nonnegative
    check (referral_earnings_available >= 0) not valid;

alter table public.wallet_topups
  add constraint wallet_topups_amount_positive
    check (amount > 0) not valid;

alter table public.user_withdrawals
  add constraint user_withdrawals_amount_positive
    check (requested_amount > 0) not valid,
  add constraint user_withdrawals_fee_nonnegative
    check (fee_charged >= 0) not valid,
  add constraint user_withdrawals_net_nonnegative
    check (net_disbursement >= 0 and net_disbursement <= requested_amount) not valid;

alter table public.service_orders
  add constraint service_orders_amounts_valid
    check (amount > 0 and platform_fee >= 0 and total_amount >= amount) not valid,
  add constraint service_orders_settlement_within_escrow
    check (released_amount >= 0 and refunded_amount >= 0
       and released_amount + refunded_amount <= amount) not valid,
  add constraint service_orders_fee_within_fee
    check (fee_earned >= 0 and fee_earned <= platform_fee) not valid;

alter table public.service_order_milestones
  add constraint service_order_milestones_amount_positive
    check (amount > 0) not valid;

alter table public.wallets validate constraint wallets_available_funds_nonnegative;
alter table public.wallets validate constraint wallets_referral_available_nonnegative;
alter table public.wallet_topups validate constraint wallet_topups_amount_positive;
alter table public.user_withdrawals validate constraint user_withdrawals_amount_positive;
alter table public.user_withdrawals validate constraint user_withdrawals_fee_nonnegative;
alter table public.user_withdrawals validate constraint user_withdrawals_net_nonnegative;
alter table public.service_orders validate constraint service_orders_amounts_valid;
alter table public.service_orders validate constraint service_orders_settlement_within_escrow;
alter table public.service_orders validate constraint service_orders_fee_within_fee;
alter table public.service_order_milestones validate constraint service_order_milestones_amount_positive;
