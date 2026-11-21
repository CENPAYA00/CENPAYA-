# Cenpaya D1 database reference

Source: the supplied Cloudflare D1 export for database `cenpaya-db`, exported 2026-11-21.

The export describes 73 application tables, 3 views, 146 explicit indexes, and 68 triggers. It records migrations 1–51 in `cenpaya_migrations`.

Migration 52 is maintained in `migrations/0052_oauth_worker_identity_support.sql`. It reconciles the exported schema with the D1 Worker's existing auth routes by adding `users.password_hash`, `oauth_states`, and `oauth_identities`. Registration profile and consent values are written to existing `users` columns; no separate `user_onboarding_details` table is required.

The export also contains backup tables and user/profile/listing data. Backup tables and exported row data are intentionally not copied into source control. Do not commit `data.sql`, `full_dump.sql`, CSV/JSON data exports, credentials, or personal user records.

Apply migration 52 only to a D1 database whose migration tracker is at version 51. It is an incremental migration, not a replacement for migrations 1–51.
