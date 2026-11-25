-- A provider transaction reference must not credit multiple wallet top-ups.
-- Existing-data preflight found no duplicate provider/reference pairs.
create unique index if not exists wallet_topups_provider_reference_uidx
  on public.wallet_topups (upper(provider), transaction_id)
  where transaction_id is not null
    and transaction_id not like 'pending:%'
    and transaction_id not like 'initiating:%';
