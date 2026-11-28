# Country configuration rollout (Cloudflare)

This runbook prepares the country-management integration for deployment. It does not require the Cloudflare D1 database to be available while developing. **Do not deploy the Supabase Worker before the D1 Worker and its country projection migration are ready**: the Supabase Worker deliberately fails country saves closed when D1 synchronization is unavailable.

## Architecture and source of truth

- Supabase is authoritative for country metadata submitted by Owner/Super Admin, financial fees, country-specific prices, provider readiness, and activation.
- The Supabase Worker authenticates Owner/Super Admin actions and synchronizes a minimal country projection to the D1 Worker over the private `D1_IDENTITY` service binding.
- D1 stores the projection used by registration/profile/country-selection flows. It does not own financial prices or payment readiness.
- Country activation remains blocked until the country has enabled payment methods and at least one active provider/payment route. Adding a country does not activate a provider.

## Before applying D1 migrations

The D1 migration directory in this branch contains migrations **0052–0067**, not a full empty-database bootstrap. The documented source D1 export has the base schema through migration 0051. Therefore:

1. Use the existing CenPaya D1 database whose schema is already at the expected baseline, or restore the approved base schema/export through migration 0051 first.
2. Do not run migrations 0052–0067 against a blank D1 database.
3. Inspect the remote migration tracker before applying anything. Do not replay migrations already recorded as applied.
4. Confirm the target database is the intended CenPaya database before running a remote command.

## D1 Worker deployment

From the repository root, after configuring the D1 database binding in `d1-worker/wrangler.toml`:

```sh
cd d1-worker
npx wrangler d1 migrations list cenpaya-db --remote
npx wrangler d1 migrations apply cenpaya-db --remote
npm install
npm run typecheck
npm test
npm run build
```

Migration **0067_country_configuration_projection.sql** creates the D1 country projection, seeds the six CEMAC countries, and makes Cameroon the only initially active country. The other five are `coming_soon`. The migration is safe to apply once; Wrangler records applied migration files.

Configure the D1 Worker variables in Cloudflare:
- `ALLOWED_ORIGINS`: exact comma-separated frontend origins (no wildcard).
- `FRONTEND_URL`: canonical frontend origin.
- Other existing D1 Worker variables required by the current deployment (Google OAuth, AI Search, etc.) remain governed by the main D1 Worker runbook.

Configure these secrets on the D1 Worker:
- `D1_INTERNAL_CALL_SECRET`
- `D1_TO_SUPABASE_HMAC_SECRET`
- Existing D1 application secrets required by the current Worker (for example `OTP_PEPPER`).

The two D1/Supabase shared secrets must be generated as strong random values and match exactly on both Workers. Never commit them or put them in frontend variables.

Then deploy:

```sh
npx wrangler deploy
```

## Supabase Worker deployment

The Supabase Worker already declares the private service binding:

```toml
[[services]]
binding = "D1_IDENTITY"
service = "cenpaya-d1-worker"
```

This service name must match the deployed D1 Worker name. In `worker/`, configure the existing required Supabase secrets and the same shared internal-call secret:

```sh
cd ../worker
npx wrangler secret put D1_INTERNAL_CALL_SECRET
npx wrangler secret put D1_TO_SUPABASE_HMAC_SECRET
npm install
npm run typecheck
npm test
npm run build
npx wrangler deploy
```

Also configure the existing Supabase Worker secrets documented in `worker/README.md` (Supabase anon key and the active JWT signing-key configuration). Set exact frontend origins and the payment environment as documented there.

## Post-deployment verification

1. Check D1 Worker liveness: `GET /health`.
2. Check Supabase Worker liveness: `GET /healthz`.
3. Sign in as an authorized Owner or Super Admin.
4. Open Admin → Regions and load the country list.
5. Save an inactive test country with valid ISO code, name, calling prefix, currency, conversion value, fee values, and prices. Keep payment methods empty and inactive.
6. Confirm the save succeeds and the D1 `country_configuration_projection` row and `supported_countries` row are present.
7. Confirm the country is absent from the member-facing `GET /api/countries` list while inactive.
8. Configure an actual supported provider and aggregator route before activating a country. Confirm activation is rejected without readiness.
9. Activate only after the payment route has been tested in the intended environment; confirm it appears in `GET /api/countries`.
10. Change a country price and verify the admin read-back and the next purchase quote use the new amount/currency. Existing transactions must retain their saved amounts.
11. Check the Supabase `admin_audit_log` for country configuration, price, and activation changes.

## Failure and recovery behavior

- If D1 sync is unavailable, the country API returns `503 country_d1_sync_failed`; activation is restored to its previous state. Fix the service binding/secret/migration and save the country again to retry projection.
- D1 country sync requires `D1_INTERNAL_CALL_SECRET`; it is not a public API.
- Never manually edit the D1 projection as a substitute for the Supabase admin workflow.
- Do not enable other CEMAC countries merely because their metadata is seeded. Provider credentials, supported payment methods, country-specific gateway fees, and live transaction tests are separate readiness requirements.

## Not performed by repository changes

A GitHub commit and a Wrangler dry-run do not deploy a Cloudflare Worker or apply a remote D1 migration. Those final operations require Cloudflare account access and the production secrets. This repository contains the migration and the exact rollout procedure so they can be applied when the target D1 database is ready.
