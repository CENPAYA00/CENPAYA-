# CenPaya Supabase Cloudflare Worker

This Cloudflare Worker is the server-side API boundary for CenPaya's Supabase financial database and finance/admin operations. It connects to the existing Supabase project over HTTPS and uses the existing Postgres tables, RLS policies, and RPC functions. It does not create or migrate database schema.

## Non-negotiable boundaries

- Supabase Postgres remains the financial system of record.
- D1 remains the identity/session authority. The browser's D1 session token is never treated as a Supabase token.
- The Worker validates identity through the private `D1_IDENTITY` service binding, verifies the short-lived D1 assertion, and mints a short-lived Supabase user JWT.
- User database calls use `SUPABASE_ANON_KEY` plus the verified user JWT. The service-role key is not used or accepted by this Worker.
- Existing Supabase RLS and financial authorization functions remain authoritative. A D1 role does not grant financial admin permission.
- No Supabase Auth, login, password, OTP, email verification, OAuth, auth/signup migrations, or Supabase Edge Functions are implemented here.
- Do not weaken RLS or bypass it to make an endpoint work. Do not trust caller-supplied actor IDs or roles.
- Payment webhooks must be added only with the exact provider signature, amount/currency/reference, and idempotency rules verified for that provider. No unsigned generic webhook is exposed.

## Cloudflare configuration

Set these Worker variables:

- `SUPABASE_URL`: already set in `wrangler.toml` for project `vtfwglrjjznxxujrlcnb`.
- `CENPAYA_ORIGINS`: comma-separated exact frontend origins; no wildcard.
- `SUPABASE_JWT_ALGORITHM`: the active signing algorithm shown in the Supabase project's Authentication → Signing Keys settings.

Set these Worker secrets:

- `SUPABASE_ANON_KEY`: the project's enabled anon or publishable API key.
- `D1_INTERNAL_CALL_SECRET`: long random secret shared only with the D1 Worker.
- `D1_TO_SUPABASE_HMAC_SECRET`: a different long random secret used to sign/verify D1 identity assertions.
- For `HS256`: `SUPABASE_JWT_SECRET`, the project's currently accepted legacy JWT secret.
- For `RS256` or `ES256`: `SUPABASE_JWT_PRIVATE_JWK`, the private JWK for the currently accepted signing key, and `SUPABASE_JWT_KID` when the key requires a key ID.

Never put private key material or shared secrets in Git, browser variables, D1 rows, Wrangler vars, logs, or support tickets. `worker/.dev.vars.example` is a placeholder only; local values belong in the ignored `.dev.vars` file.

The `D1_IDENTITY` service binding is configured to the existing Cloudflare service name `cenpaya-d1-worker`. The D1 Worker must implement `POST /internal/v1/identity/assert`, require `X-CenPaya-Internal-Secret`, validate the active D1 session and account state, and return JSON `{ "assertion": "<short-lived-HS256-JWT>" }`. The currently inspected D1 Worker source does not yet contain that endpoint. Until it is implemented and deployed with the two shared secrets, this Worker intentionally fails closed with HTTP 503 for authenticated API requests. Do not treat the service binding alone as a completed identity integration.

The Worker also fails closed if the D1 subject is not a UUID, the Supabase signing key is not configured, or the same UUID does not exist in the existing `public.users.id` table. It never creates or maps users by email/phone.

## API

All routes below, except liveness and database health, require a valid D1 bearer session and a matching Supabase financial user.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/healthz` | Worker liveness |
| GET | `/api/v1/healthz/db` | Public-read `currencies` connectivity probe using anon key only |
| GET | `/api/v1/me/profile` | Authenticated user's existing financial profile |
| GET | `/api/v1/wallet` | Current user's wallet balances; RLS and verified subject restrict the row |
| GET | `/api/v1/ledger` | Current user's ledger rows; RLS and verified subject restrict the rows |
| GET | `/api/v1/orders` | Orders where the current user is buyer or seller |
| POST | `/api/v1/orders/services` | Create a wallet-paid service order through the existing `create_service_order` RPC |
| GET | `/api/v1/admin/ledger` | Existing `admin_list_ledger` RPC |
| GET | `/api/v1/admin/escrows` | Existing `admin_list_open_escrows` RPC |
| GET | `/api/v1/admin/finance` | Existing gains and money-circulation RPCs |
| GET | `/api/v1/admin/gains` | RLS-protected platform gains list |
| GET | `/api/v1/admin/payment-methods` | Payment-method configuration |
| GET | `/api/v1/admin/regions` | Financial regional fee configuration |
| GET | `/api/v1/admin/providers` | Provider metadata, never provider secrets |
| GET | `/api/v1/admin/users` | Existing admin user-list RPC |
| GET | `/api/v1/admin/reports` | Existing report-list RPC |
| GET | `/api/v1/admin/tickets` | Existing admin ticket-list RPC |
| POST | `/api/v1/admin/escrows/:id/action` | Existing escrow action RPC |
| PATCH | `/api/v1/admin/reports/:id` | Existing report resolution RPC |
| POST | `/api/v1/admin/rpc/:name` | Explicit allowlist of existing financial/admin RPCs only |

The legacy `/api/admin/...` prefix is accepted as an alias for the corresponding `/api/v1/admin/...` path. RPC names are allowlisted; arbitrary Postgres functions and arbitrary table names cannot be supplied by callers. Database functions still perform their own financial role/permission checks.

Pagination is bounded to 200 rows per request. Responses use `Cache-Control: no-store`. CORS permits only configured exact origins. No endpoint returns the D1 assertion or Supabase user JWT.

## Existing database behavior

- `public.currencies` has an explicit public-read policy and is used for the unauthenticated DB health probe.
- `public.wallets`, `public.transactional_ledger`, and `public.orders` are queried with the verified user's JWT and existing RLS.
- Admin RPCs are invoked with the same verified user's JWT. Functions such as `admin_list_ledger`, `admin_escrow_action`, `admin_available_gains`, and `admin_withdraw_from_my_wallet` retain their internal authorization checks.
- The Worker does not read `platform_api_vault` directly and does not return provider credentials.
- No service-role client, Supabase Auth call, Edge Function invocation, schema migration, or live database write is part of Worker startup or health checks.

## Local verification

From `worker/`:

```sh
npm install
npm run typecheck
npm test
npm run build
```

The tests cover HTTP/CORS helpers, identity assertion signature and claim validation, short-lived Supabase JWT claims, and API route allowlisting. The build is a Wrangler dry run; it does not deploy.

The GitHub Actions workflow runs typecheck, tests, and dry-run build on pushes to `migration/supabase-worker-api`. This repository currently has no Worker-specific lockfile, so CI uses `npm install`, not `npm ci`.

## Not complete until external prerequisites are met

This branch contains the Supabase Worker-side implementation, but it is not production-ready until all of the following are completed and verified:

1. The D1 Worker implements and deploys the agreed private identity assertion endpoint. That code is not present in the inspected D1 branch and is intentionally not modified by this Supabase-only task.
2. The active Supabase JWT signing algorithm/key is confirmed in the project settings and the matching private signing material is configured as a Cloudflare secret.
3. D1 user UUIDs are verified to match the existing `public.users.id` values for real accounts.
4. Cloudflare binding/secrets/origins are configured and a live end-to-end request confirms RLS sees the expected `auth.uid()`.
5. Provider-specific top-up/withdrawal webhook flows are implemented only after their actual provider contracts and signatures are verified. The Worker does not invent or trust payment callbacks.

No Supabase database schema or data is changed by this Worker branch.
