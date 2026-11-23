# Supabase database migrations

These migrations are committed to the existing `migration/supabase-worker-api` branch. They are applied separately from Worker deployment.

## Financial escrow migrations

1. `0001_secure_financial_worker_operations.sql` — secure Worker payment operations and gateway credential handling.
2. `0002_attach_order_escrow_hold.sql` — attaches the buyer wallet escrow hold to product order creation.
3. `0003_wallet_status_and_withdrawal_finalizer.sql` — wallet top-up status and withdrawal finalizer.
4. `0004_restrict_user_scoped_wallet_rpcs.sql` — restricts user-scoped wallet RPC privileges.
5. `0005_escrow_buyer_fee_and_verified_delivery_settlement.sql` — buyer-paid marketplace fee, full seller-price payout, verified delivery, inspection-window auto-release.
6. `0006_freelance_service_escrow_tables.sql` — service orders, mutually approved deadline changes, and milestone records with participant read policies.
7. `0007_freelance_service_escrow_lifecycle.sql` — atomic freelance wallet funding, seller acceptance and deadline confirmation, milestones, revisions, deadline changes, and service disputes.
8. `0008_escrow_auto_settlement_and_dispute_resolution.sql` — missed-deadline refunds, 72-hour submitted-milestone review auto-release, product/service dispute settlement, and admin escrow actions.

## Escrow rules implemented

- Buyer pays the listed amount plus the platform fee; seller receives the full listed amount. The fee is recognized separately.
- Physical orders remain held until buyer confirmation or verified delivery plus the configured inspection window. A dispatch event alone does not start automatic release.
- Freelance service escrow is a separate lifecycle. Seller accepts and confirms the delivery deadline; changing that deadline requires both parties' approval and is recorded.
- If the seller misses the confirmed project deadline, remaining escrow is refunded to the buyer by the hourly escrow scheduler.
- Freelance work can be split into separately funded milestones. Buyer acceptance releases each milestone; if no dispute or revision is raised, a submitted milestone is auto-released after the 72-hour review period.
- A dispute holds settlement until staff resolution. Admin actions cannot bypass service milestone review.
- Direct client-side writes to service escrow tables are disabled; financial mutations use authenticated Worker RPCs.

## Operational note

The Supabase project has these schema and function changes applied. The Worker is committed to this branch but is not deployed by this migration process. Do not test real-money checkout; use a dedicated test account and controlled test balance first.
