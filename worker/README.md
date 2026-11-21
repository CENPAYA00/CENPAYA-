# CenPaya Supabase Cloudflare Worker

This Worker is the backend API boundary for CenPaya financial data and finance/admin operations. It uses the existing Supabase Postgres project over Supabase's HTTPS API.

## Ownership boundaries

- Supabase Postgres remains the financial system of record.
- This Worker is the only intended browser-facing API for financial data and privileged finance/admin operations.
- Identity, login, OTP, email verification, password recovery, and OAuth are owned by the separate Cloudflare/D1 identity system. This Worker must not implement them.
- Do not add Supabase Edge Functions, Supabase Auth flows, or auth/signup tables or migrations here.
- Do not expose database service keys or JWT signing secrets to the browser.

## Runtime configuration

Configure these as Cloudflare Worker variables/secrets only when the corresponding implementation is enabled:

- `CENPAYA_ORIGIN`: exact deployed frontend origin.
- `SUPABASE_URL`: existing Supabase project URL.
- `SUPABASE_ANON_KEY`: project anon/publishable key used with a short-lived, verified user-scoped database JWT.
- `SUPABASE_JWT_SECRET`: secret used only by the Worker to create short-lived database JWT claims after validating the external D1 identity token.
- `D1_IDENTITY_HMAC_SECRET`: shared secret for validating identity tokens issued by the D1 Worker.

The D1 identity token contract must be agreed with the D1 Worker before production use. Reject requests when identity, issuer, audience, signature, or expiry cannot be verified. Never trust a user ID or role supplied in an unverified request body.

## Routes and status

- `GET /healthz`: public Worker liveness.
- `GET /api/v1/healthz/db`: database connectivity check.
- Financial and admin routes are being implemented against the live schema and existing database RPCs. A route must not be exposed until its authorization and behavior are covered by tests.

## Development

From this directory:

```sh
npm install
npm run typecheck
npm test
npm run build
```

The CI workflow uses `npm install` because this Worker package currently has no committed lockfile. Commit a Worker-specific lockfile before changing CI to `npm ci`.
