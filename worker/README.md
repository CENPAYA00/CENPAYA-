# CenPaya Supabase Cloudflare Worker

This Worker is the API boundary for CenPaya's Supabase financial database and finance/admin operations. It uses the existing Postgres tables, RLS policies, and financial RPCs. It does not create users or change existing financial data.

## Security boundaries

- D1 remains the account/session identity authority. The browser receives a D1 bearer only in memory; D1 also issues an HttpOnly Secure SameSite cookie for browser session restoration. The bearer is never treated as a Supabase token.
- The Worker calls D1 through the private `D1_IDENTITY` service binding, verifies a short-lived HMAC assertion, atomically consumes its `jti` to prevent replay, mints a short-lived Supabase user JWT, and checks the same UUID exists in `public.users.id`.
- Normal user and finance/admin database requests use `SUPABASE_ANON_KEY` plus that verified user JWT. Existing Supabase RLS and financial permission functions remain authoritative.
- Payment operations use a separate 60-second JWT with the existing `authenticated` Postgres role and a private signed `app_metadata.cenpaya_payment_worker` claim. Protected RPCs validate the claim internally. No custom Postgres role or service-role key is used.
- D1 roles do not grant financial admin permissions. Caller-supplied actor IDs and roles are not trusted.
- No Supabase Auth, login/password, OTP, email verification, OAuth, auth/signup migrations, or Supabase Edge Functions are added.
- No arbitrary table access or arbitrary Postgres RPC execution is exposed.

## Required Cloudflare configuration

Variables:
- `SUPABASE_URL`: configured in `wrangler.toml` for project `vtfwglrjjznxxujrlcnb`.
- `CENPAYA_ORIGINS`: comma-separated exact deployed frontend origins; no wildcard.
- `SUPABASE_JWT_ALGORITHM`: the active signing algorithm shown in Supabase Authentication → Signing Keys.
- `PAYMENT_ENVIRONMENT`: `sandbox` or `production`.

Secrets:
- `SUPABASE_ANON_KEY`: project anon/publishable API key.
- `D1_INTERNAL_CALL_SECRET`: private D1-to-Supabase Worker service-binding secret.
- `D1_TO_SUPABASE_HMAC_SECRET`: separate HMAC assertion-signing secret.
- HS256: `SUPABASE_JWT_SECRET`, the project's active legacy JWT secret.
- RS256/ES256: `SUPABASE_JWT_PRIVATE_JWK` containing the matching active private JWK; set `SUPABASE_JWT_KID` if required.

Do not put secret values in Git, browser bundles, Wrangler vars, D1 rows, or logs. Use Cloudflare Worker secrets. `worker/.dev.vars.example` contains placeholders only.

## Identity integration blocker

The payment role is minted only inside the Worker using the active Supabase JWT signing key, has a 60-second lifetime, and is never returned to the browser.

The service binding targets the existing Worker name `cenpaya-d1-worker`. The existing D1 Worker branch now implements private `POST /internal/v1/identity/assert`, authenticated with `X-CenPaya-Internal-Secret`, returning `{ "assertion": "<short-lived-HS256-JWT>" }`. The D1 Worker also exposes a secret-protected one-time assertion consumer (replay protection) and rate-limit consumer used for financial initiation. These branch changes must be deployed to the D1 Worker and both shared secrets must match before authenticated Supabase routes can work; otherwise requests fail closed.

The Worker also fails closed if the D1 subject is not a UUID, the active Supabase JWT signing key is not configured, or the same UUID does not exist in the existing `public.users.id` table. It never creates or maps users by email/phone.

## API routes

All routes below, except liveness and DB health, require a valid D1 session and a matching Supabase financial user. No provider webhook/callback routes are exposed.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/healthz` | Worker liveness |
| GET | `/api/v1/healthz/db` | Public-read database connectivity probe |
| GET | `/api/v1/me/profile` | Existing financial user profile |
| GET | `/api/v1/wallet` | Active legacy XAF wallet plus non-XAF rows from `user_balances` under RLS; returns a unified `balances` array |
| GET | `/api/v1/ledger` | Current user's ledger under RLS |
| GET | `/api/v1/orders` | Orders where current user is buyer or seller |\n| GET | `/api/v1/orders/:id` | User-scoped order detail |\n| POST | `/api/v1/orders/:id/action` | Typed seller delivery, buyer receipt, or dispute action |\n| GET | `/api/v1/checkout/quote?listing_id=:id` | D1-verified listing price and server-calculated membership fee quote |\n| POST | `/api/v1/checkout/orders` | Server-validated XAF wallet marketplace order creation with balance and idempotency checks |\n| POST | `/api/v1/checkout/service-orders` | Explicitly unavailable until the service-order schema exists in the financial database (501) |\n| GET | `/api/v1/subscriptions/options` | Configured Fapshi/Campay membership payment options and database plan price |\n| POST | `/api/v1/subscriptions` | Atomic wallet membership activation or Fapshi/Campay mobile-money initiation |\n| GET | `/api/v1/subscriptions/:id` | User-scoped membership payment status with provider reconciliation |
| POST | `/api/v1/wallet/topups` | Idempotent XAF top-up initiation (Fapshi/Campay) |
| GET | `/api/v1/wallet/topups/:id` | User-scoped top-up status with provider polling and idempotent settlement |
| POST | `/api/v1/wallet/withdrawals` | Idempotent XAF withdrawal request |
| GET | `/api/v1/wallet/withdrawals/:id` | User-scoped withdrawal status with provider polling and idempotent finalization |
| GET | `/api/v1/admin/ledger` | Existing `admin_list_ledger` RPC |
| GET | `/api/v1/admin/escrows` | Existing `admin_list_open_escrows` RPC |
| GET | `/api/v1/admin/finance` | Existing gains and money-circulation RPCs |
| GET | `/api/v1/admin/gains` | RLS-protected platform gains |
| GET | `/api/v1/admin/payment-methods` | Payment-method configuration |
| GET | `/api/v1/admin/regions` or `/api/v1/admin/countries` | Financial regional fee configuration |
| GET | `/api/v1/admin/providers` | Provider metadata only; never secrets |
| GET | `/api/v1/admin/users` | Existing admin user-list RPC |
| POST | `/api/v1/admin/escrows/:id/action` | Existing escrow action RPC with typed action/reason validation |
| POST | `/api/v1/admin/users/:id/ban` or `/unban` | Typed user ban controls |
| POST | `/api/v1/admin/users/:id/role`, `/permissions`, `/membership`, `/membership/revoke`, or `/moderation` | Typed role, permission, membership and moderation actions |
| GET | `/api/v1/admin/security/password/status` | Check whether the signed-in Owner/Super Admin has configured a second admin password |
| POST | `/api/v1/admin/security/password/verify` or `/api/v1/admin/security/password` | Verify or update the second admin password through dedicated typed endpoints; password RPCs are not exposed through the generic RPC gateway |
| POST | `/api/v1/admin/disputes/:id/resolve` or `/api/v1/admin/kyc/:id/review` | Typed dispute and KYC decisions |
| POST | `/api/v1/admin/support-agents/:id/remove` | Typed support-agent removal |
| POST | `/api/v1/admin/platform-gains/withdraw` | Typed platform-gains withdrawal request |
| POST | `/api/v1/admin/wallet/topup` or `/withdraw` | Typed admin wallet operations |
| POST | `/api/v1/admin/gains/withdraw-to-wallet` | Typed platform-gains-to-wallet operation |
| POST | `/api/v1/admin/gateway-credentials` or `/remove` | Typed gateway credential configuration |
| POST | `/api/v1/admin/rpc/:name` | Strict per-RPC schemas; generic gateway is limited to explicitly approved lower-risk operations |

The legacy `/api/admin/...` prefix is accepted as an alias for implemented admin paths. Pagination is bounded to 200 rows. Responses use `Cache-Control: no-store`. No endpoint returns the D1 assertion or Supabase user JWT.

## Payment behavior and limits

- The existing Edge Function code only provided initiation adapters for Fapshi and Campay. Those are the only two providers implemented here. Other active rows in `system_providers` do not automatically imply a working Worker adapter.
- Fapshi top-ups use the hosted Initiate Pay flow and status verification. The provider requires a valid customer email and the Worker reads it from that user's existing `public.users` row. [Fapshi payment guidance](https://www.fapshi.com/en/help-and-support/topics/payments).
- Campay top-ups use the existing project's Token-authenticated collect flow. Provider status is checked by authenticated status polling; this Worker does not implement payment webhooks.
- Top-up settlement checks the stored provider reference, exact amount, currency, and pending status through idempotent database RPCs. Authenticated status polling queries the gateway and safely finalizes confirmed outcomes.
- Withdrawals reserve funds through the existing `create_withdrawal` function with a new idempotency wrapper. The Worker does **not** mark a payout completed merely because an initiation endpoint returned HTTP 200. It requires a provider transaction reference and a verifiable status response; uncertain requests remain pending for reconciliation rather than being blindly retried or refunded.
- Top-up initiation is limited to 5 requests per user per 60 seconds; withdrawal initiation to 3; marketplace wallet checkout to 5; and payment-status polling to 30. The Supabase Worker calls the D1 Worker through its private service binding and fails closed if the limiter is unavailable. Redis/Upstash is used when configured, with the existing D1 rate-limit table as fallback.
- When a provider definitively rejects an initiation with HTTP 4xx, the Worker retries the separate database failure transition up to three times. If it cannot confirm that transition, it logs a structured critical event for Cloudflare observability and returns an uncertain-support response; it does not claim the reserved funds were released.
- Confirm the Fapshi/Campay payout status/reference contracts with the provider accounts before enabling live withdrawals. If a provider does not return a usable reference or verifiable status, the Worker leaves the withdrawal pending.
- No payment webhook implementation or callback endpoint is included. Top-up and withdrawal status routes independently query the gateway and preserve pending/reserved state whenever the provider result is uncertain.
- No production provider credentials are currently configured in `platform_api_vault`. Configure them through the super-admin gateway credential flow after applying the SQL migration.


## Checkout security and supported payment scope

Marketplace checkout now obtains the authoritative listing price from the D1 Worker through the private service binding. The Supabase Worker calculates member/non-member percentage and fixed fees, checks the authenticated user's XAF wallet balance, consumes a one-time idempotency key through D1, and inserts the order using the verified user's Supabase JWT and existing RLS. The browser only displays the quote; the Worker recalculates seller-specific fees with `cenpaya_calculate_platform_fee` before creating the order. The database migration `worker/sql/migrations/0002_attach_order_escrow_hold.sql` is applied in the live project: it attaches the existing `hold_escrow_on_order_insert()` function to `public.orders`. The trigger performs the atomic wallet debit and escrow-ledger write. Marketplace checkout also has a fail-closed D1-backed rate limit.

Marketplace product checkout is wallet-only. Mobile Money marketplace checkout remains explicitly blocked with HTTP 501. Service-order checkout remains fail-closed (HTTP 501) because the live financial database does not contain the required service-order schema; do not enable Mobile Money service checkout. Wallet membership activation uses the existing atomic `cenpaya_activate_membership` database function. Fapshi/Campay membership payments use the existing membership payment ledger and authenticated provider-status polling. Wallet top-ups and withdrawals use the Fapshi/Campay routes and provider-status polling; uncertain outcomes remain pending/reserved.

## Database migration required

`worker/sql/migrations/0001_secure_financial_worker_operations.sql` is required before top-up/withdrawal routes can operate. It:
- repairs gateway credential storage to use the project's existing Supabase Vault and `platform_api_vault.secret_id` metadata (the live table does not have the old API-key columns referenced by the current credential RPC);
- adds idempotency and provider-attempt metadata;
- adds user-scoped top-up intent/status functions;
- adds protected provider-reference, settlement, and withdrawal-finalization functions. They use the existing `authenticated` role plus the signed private `app_metadata.cenpaya_payment_worker` claim; no custom Postgres role is created.

Migrations 0001–0006 are committed. Migrations 0004 (`staff_member_role_and_invitation_sync`) and 0005 (`reconcile_staff_admin_permissions`) were applied to the connected Supabase database during the previous implementation session. Migration 0006 (`admin_control_plane_frontend_apis`) is code-only and has NOT been applied; it completes the authenticated frontend RPCs for invitations, permission management, admin-password controls, membership views, and Owner/Super Admin parity. Migration 0005 removes stale role-specific grants during role changes and prevents an already-used invitation from restoring a role after it has been revoked. It adds the distinct Staff Member role, validates role-scoped invitation permissions, synchronizes role changes to the D1 identity service, and makes invitation acceptance idempotent. It does not create users or move existing wallet balances.

## Features intentionally not hosted here

The current Supabase database does not contain the support-ticket, social-report, social-post/chat, app-settings, or service-order tables referenced by some old Supabase RPCs/Edge Functions. Those are D1/non-financial responsibilities under the agreed architecture, so this Worker does not expose stale `admin_list_tickets`, `admin_list_reports`, `admin_resolve_report`, feature-toggle, or service-order RPCs.

Support tickets, staff tasks, reports, and feature flags remain D1 responsibilities and are handled by the D1 Worker branch. This Worker only handles staff invitation acceptance and role changes that must be synchronized to D1. It does not expose stale support-ticket, report, or feature-toggle RPCs. The authenticated routes `/api/v1/staff/invitations/accept` and `/api/v1/admin/users/:id/role` call the private D1 role-sync endpoint after the Supabase permission change succeeds. Service-order and subscription settlement are also intentionally fail-closed: the live financial database export does not contain the required service-order tables or a verified atomic subscription debit/settlement function.

## Local verification

From `worker/`:

```sh
npm install
npm run typecheck
npm test
npm run build
```

Wrangler build is a dry run; it does not deploy. Run typecheck, tests, and the dry-run build before deployment. These commands have not been executed from this chat. There is no Worker-specific lockfile, so use `npm install`, not `npm ci`.

## Not production-ready until

1. D1 implements and deploys the agreed identity assertion endpoint and staff-workspace role-sync endpoint.
2. D1 migrations 0063–0066 are applied in order after checking the D1 migration tracker.
3. The active Supabase JWT algorithm/key is confirmed and configured in Cloudflare.
4. Supabase migration 0004 and the existing financial SQL migrations are reviewed and applied.
5. D1 user UUIDs are confirmed to match existing `public.users.id` values.
6. Fapshi/Campay API credentials are configured in Vault; no webhook secret is required by this Worker.
7. Provider payout status/reference contracts are confirmed and live end-to-end top-up/withdrawal tests pass.
8. Cloudflare binding, origins, and secrets are configured and CI passes.
9. Apply Supabase migration 0006 and D1 migrations 0063–0065 only after reviewing both migration trackers.
10. Run frontend and Worker build/test suites; verify invitation acceptance, role sync, permission grants/revocations, task isolation, ticket isolation, and membership management.
11. Deploy only after all checks pass and the user explicitly approves deployment.

The staff invitation and role-sync routes depend on the D1 Worker's private `/internal/v1/staff/workspace/sync` endpoint and the matching `D1_INTERNAL_CALL_SECRET`. Before deployment, apply Supabase migration 0006 and D1 migrations 0063–0065 in order after checking each migration tracker. No Worker or frontend deployment is part of this change.
