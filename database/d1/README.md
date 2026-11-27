# Cenpaya D1 database reference

Source: the supplied Cloudflare D1 export for database `cenpaya-db`, exported 2026-11-21.

The export describes 73 application tables, 3 views, 146 explicit indexes, and 68 triggers. It records migrations 1–51 in `cenpaya_migrations`.

## Canonical incremental migrations

Migrations **0052–0074** are maintained in `database/d1/migrations/` and are applied in numeric order. Migration 0072 adds the Owner/Super Admin global video switch; migration 0073 adds private chat, delivery-evidence and listing-video lifecycle metadata, retention queues, sold-listing retention fields, and per-user chat deletion records. They extend the supplied version-51 schema; they are not a bootstrap for an empty database.

Migration **0067_country_configuration_projection.sql** adds the D1 country configuration projection and seeds the six CEMAC countries. Cameroon is initially active with MTN MoMo and Orange Money enabled in the projection; the Central African Republic, Republic of the Congo, Gabon, Equatorial Guinea, and Chad are marked `coming_soon`.

Supabase remains authoritative for country financial prices, fees, provider readiness, and payment activation. The D1 Worker receives country metadata and activation through its authenticated private `POST /internal/v1/countries/sync` endpoint. Do not manually edit the projection as a substitute for the Owner/Super Admin workflow.

## Safe application procedure

1. Confirm that the target is the intended Cenpaya D1 database.
2. Inspect its remote `cenpaya_migrations` tracker.
3. Confirm the schema is based on the supplied export and currently at migration 51, or determine exactly which migrations from 52–73 are already applied.
4. Apply only the missing migrations, in numeric order. Never replay a migration already recorded as applied.
5. Do not apply migrations 52–73 to a blank database; restore the approved base schema through migration 51 first.
6. Do not deploy the D1 Worker or Supabase Worker as part of this migration preparation.

The D1 Worker's Wrangler configuration points `migrations_dir` to this canonical directory using `../database/d1/migrations`. Do not create a second migration directory under `d1-worker/`.

Migration **0077_cross_worker_contract_alignment.sql** records the D1 contract alignment reported as already applied on 2026-11-27. It permits `super_admin` in the D1 user-role validation triggers and appends the seller/price fields required by the Supabase checkout quote endpoint to `public_marketplace_search`. This is a source-control record, not authorization to replay it against production. Before any application, verify the remote `cenpaya_migrations` tracker and confirm the intervening migration history; do not assume migrations 75–76 are present or absent based only on this file.

The export also contains backup tables and user/profile/listing data. Backup tables and exported row data are intentionally not copied into source control. Do not commit `data.sql`, `full_dump.sql`, CSV/JSON data exports, credentials, or personal user records.

For the complete service-binding and deployment sequence, see [the country configuration rollout runbook](../../docs/CLOUDFLARE_COUNTRY_CONFIGURATION_ROLLOUT.md). That runbook is preparation only; no Cloudflare deployment or remote D1 migration is performed by this change.
