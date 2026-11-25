-- A provider transaction/payout reference must never settle two different withdrawals.
-- Existing-data preflight found no duplicate provider/reference pairs.
create unique index if not exists user_withdrawals_gateway_reference_uidx
  on public.user_withdrawals (upper(gateway_provider), gateway_reference)
  where gateway_reference is not null
    and gateway_reference not like 'initiating:%';
