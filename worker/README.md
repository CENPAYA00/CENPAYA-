# CenPaya Supabase Cloudflare Worker

This Worker is the API boundary for CenPaya's Supabase financial database and finance/admin operations. It uses the existing Postgres tables, RLS policies, and financial RPCs. It does not create users or change existing financial data.

## Security boundaries

- D1 remains the account/session identity authority. The browser's D1 session token is sent to the Worker; it is never treated as a Supabase token.
- The Worker calls D1 through the private `D1_IDENTITY` service binding, verifies a short-lived HMAC assertion, mints a short-lived Supabase user JWT, and checks the same UUID exists in `public.users.id`.
- Normal user and finance/admin database requests use `SUPABASE_ANON_KEY` plus that verified user JWT. Existing Supabase RLS and financial permission functions remain authoritative.
- Payment operations use a separate, 60-second JWT for the restricted `cenpaya_payment_worker` Postgres role, signed with the project's active Supabase signing key. This role has no direct table or sequence privileges; its functions are restricted to provider credential retrieval and protected payment/withdrawal operations. The service-role key is not used by this Worker.
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

The service binding targets the existing Worker name `cenpaya-d1-worker`. The existing D1 Worker branch now implements private `POST /internal/v1/identity/assert`, authenticated with `X-CenPaya-Internal-Secret`, returning `{ "assertion": "<short-lived-HS256-JWT>" }`. The D1 Worker also exposes a secret-protected internal rate-limit consumer used for financial initiation. These branch changes must be deployed to the D1 Worker and both shared secrets must match before authenticated Supabase routes can work; otherwise requests fail closed.

The Worker also fails closed if the D1 subject is not a UUID, the active Supabase JWT signing key is not configured, or the same UUID does not exist in the existing `public.users.id` table. It never creates or maps users by email/phone.

## API routes

All routes below, except liveness, DB health, and provider callbacks, require a valid D1 session and a matching Supabase financial user.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/healthz` | Worker liveness |
| GET | `/api/v1/healthz/db` | Public-read database connectivity probe |
| GET | `/api/v1/me/profile` | Existing financial user profile |
| GET | `/api/v1/wallet` | Legacy XAF wallet plus all rows from the multi-currency `user_balances` table under RLS |
| GET | `/api/v1/ledger` | Current user's ledger under RLS |
| GET | `/api/v1/orders` | Orders where current user is buyer or seller |
| POST | `/api/v1/wallet/topups` | Idempotent XAF top-up initiation (Fapshi/Campay) |
| GET | `/api/v1/wallet/topups/:id` | Current user's top-up status |
| POST | `/api/v1/wallet/withdrawals` | Idempotent XAF withdrawal request |
| GET | `/api/v1/wallet/withdrawals/:id` | Current user's withdrawal status |
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
| POST | `/api/v1/admin/disputes/:id/resolve` or `/api/v1/admin/kyc/:id/review` | Typed dispute and KYC decisions |
| POST | `/api/v1/admin/support-agents/:id/remove` | Typed support-agent removal |
| POST | `/api/v1/admin/platform-gains/withdraw` | Typed platform-gains withdrawal request |
| POST | `/api/v1/admin/wallet/topup` or `/withdraw` | Typed admin wallet operations |
| POST | `/api/v1/admin/gains/withdraw-to-wallet` | Typed platform-gains-to-wallet operation |
| POST | `/api/v1/admin/gateway-credentials` or `/remove` | Typed gateway credential configuration |
| POST | `/api/v1/admin/rpc/:name` | Strict per-RPC schemas; generic gateway is limited to explicitly approved lower-risk operations |
| POST | `/api/v1/webhooks/fapshi` | Verify Fapshi webhook secret and query provider status |
| POST | `/api/v1/webhooks/campay` | Verify Campay HS256 callback token and query provider status |

The legacy `/api/admin/...` prefix is accepted as an alias for implemented admin paths. Pagination is bounded to 200 rows. Responses use `Cache-Control: no-store`. No endpoint returns the D1 assertion or Supabase user JWT.

## Payment behavior and limits

- The existing Edge Function code only provided initiation adapters for Fapshi and Campay. Those are the only two providers implemented here. Other active rows in `system_providers` do not automatically imply a working Worker adapter.
- Fapshi top-ups use the hosted Initiate Pay flow and status verification. The provider requires a valid customer email and the Worker reads it from that user's existing `public.users` row. [Fapshi payment guidance](https://www.fapshi.com/en/help-and-support/topics/payments).
- Campay top-ups use the existing project's Token-authenticated collect flow. The callback verifier currently expects an HS256 JWT signature; confirm that exact callback contract with Campay before production enablement.
- Top-up settlement checks the stored provider reference, exact amount, currency, and pending status in a database transaction. Repeated callbacks cannot credit the same top-up twice.
- Withdrawals reserve funds through the existing `create_withdrawal` function with a new idempotency wrapper. The Worker does **not** mark a payout completed merely because an initiation endpoint returned HTTP 200. It requires a provider transaction reference and a verifiable status response; uncertain requests remain pending for reconciliation rather than being blindly retried or refunded.
- Top-up initiation is limited to 5 requests per user per 60 seconds; withdrawal initiation is limited to 3 per user per 60 seconds. The Supabase Worker calls the D1 Worker through its private service binding for this limiter and fails closed if the limiter is unavailable. Redis/Upstash is used when configured, with the existing D1 rate-limit table as fallback.
- When a provider definitively rejects an initiation with HTTP 4xx, the Worker retries the separate database failure transition up to three times. If it cannot confirm that transition, it logs a structured critical event for Cloudflare observability and returns an uncertain-support response; it does not claim the reserved funds were released.
- Confirm the Fapshi/Campay payout status/reference contracts with the provider accounts before enabling live withdrawals. If a provider does not return a usable reference or verifiable status, the Worker leaves the withdrawal pending.
- Webhooks are notifications only. The Worker verifies the configured webhook credential and independently queries provider status before changing financial state.
- No production provider credentials are currently configured in `platform_api_vault`. Configure them through the super-admin gateway credential flow after applying the SQL migration.

## Database migration required

`worker/sql/migrations/0001_secure_financial_worker_operations.sql` is required before top-up/withdrawal routes can operate. It:
- repairs gateway credential storage to use the project's existing Supabase Vault and `platform_api_vault.secret_id` metadata (the live table does not have the old API-key columns referenced by the current credential RPC);
- adds idempotency and provider-attempt metadata;
- adds user-scoped top-up intent/status functions;
- creates the restricted `cenpaya_payment_worker` database role and adds its protected provider reference, settlement, and withdrawal finalization functions.

This migration is committed as a file only. It has **not** been applied to the live Supabase database. Review and apply it through the project's normal migration process before deployment. No live schema or data was changed by this GitHub work.

## Features intentionally not hosted here

The current Supabase database does not contain the support-ticket, social-report, social-post/chat, app-settings, or service-order tables referenced by some old Supabase RPCs/Edge Functions. Those are D1/non-financial responsibilities under the agreed architecture, so this Worker does not expose stale `admin_list_tickets`, `admin_list_reports`, `admin_resolve_report`, feature-toggle, or service-order RPCs.

The current main frontend helper still sends some staff/support/report/feature requests to the Supabase Worker. Those routes must be redirected to the D1 Worker in a separately approved frontend/D1 phase; they are deliberately not backed by nonexistent Supabase tables here.

## Local verification

From `worker/`:

```sh
npm install
npm run typecheck
npm test
npm run build
```

Wrangler build is a dry run; it does not deploy. GitHub Actions runs typecheck, tests, and dry-run build on branch pushes. There is no Worker-specific lockfile, so CI uses `npm install`, not `npm ci`.

## Not production-ready until

1. D1 implements and deploys the agreed identity assertion endpoint.
2. The active Supabase JWT algorithm/key is confirmed and configured in Cloudflare.
3. The SQL migration is reviewed and applied.
4. D1 user UUIDs are confirmed to match existing `public.users.id` values.
5. Fapshi/Campay credentials and webhook secrets are configured in Vault.
6. Provider payout status/reference contracts are confirmed and live end-to-end top-up/withdrawal tests pass.
7. Cloudflare binding, origins, and secrets are configured and CI passes.

No Supabase Auth, Supabase Edge Functions, D1-branch changes, frontend changes, or live Supabase schema/data changes are included in this branch.
