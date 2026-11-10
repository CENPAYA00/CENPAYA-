# CenPaya Cloudflare Worker — Neon API foundation

This Worker is Stage 1 foundation only. It does not migrate application queries, payments, wallet, subscriptions, or orders. Existing Supabase Auth remains in use temporarily; the Worker verifies a bearer session by calling the project's Supabase Auth `/auth/v1/user` endpoint. The browser never supplies a trusted user ID.

## Cloudflare configuration required

In **Workers & Pages → cenpaya-neon → Settings → Variables and Secrets**:

1. Bind the existing Hyperdrive configuration to this Worker with binding name **`HYPERDRIVE`**. Find the Hyperdrive configuration ID in **Workers & Pages → Hyperdrive** and replace `REPLACE_WITH_EXISTING_HYPERDRIVE_ID` in `wrangler.toml` only if you later use Wrangler deploy. Do not create another Hyperdrive configuration.
2. Add `CENPAYA_ORIGIN` as a variable containing the exact deployed Pages origin, e.g. `https://<your-pages-project>.pages.dev` (use the real production/custom domain; no wildcard).
3. Add `SUPABASE_URL` as a variable with the existing Supabase project URL (no trailing slash).
4. Add `SUPABASE_ANON_KEY` as a Worker secret or variable containing the existing public anon key. It is only forwarded to Supabase Auth's user verification endpoint; never use a service-role key here.

Set the existing Worker name to `cenpaya-neon`. Keep secrets out of Git and do not add a Neon URL/password to Vite variables. Hyperdrive supplies the connection string to the Worker through the binding.

## Routes

- `GET /healthz`: public liveness check; returns only `{ "status": "ok" }`.
- `GET /api/v1/me`: verifies the existing Supabase bearer session and returns the verified user's ID and email.
- `GET /api/v1/healthz/db`: authenticated `SELECT 1` through the existing `HYPERDRIVE` binding; returns only healthy/unavailable.
- Unknown `/api/*` routes return `501` until a stage adds a specific implementation.

Browser CORS requests are allowed only when their Origin exactly matches `CENPAYA_ORIGIN`. Requests without an Origin are allowed for server-to-server use; authentication is still required for the identity and database checks.

## Local checks

From this directory:

```sh
npm install
npm run typecheck
npm run dev
```

Do not run `wrangler deploy` until the existing Hyperdrive ID and Worker variables/secrets are configured and the API has been reviewed. No deployment is performed by this repository change.
