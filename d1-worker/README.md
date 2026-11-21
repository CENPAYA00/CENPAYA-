# Cenpaya D1 Worker database

The database export supplied on 2026-11-21 records 51 applied migrations and the live schema (73 application tables, 3 views, 146 explicit indexes, 68 triggers). The export contains user/profile/listing records; those data files are not committed here.

Migration 52, `migrations/0052_oauth_worker_identity_support.sql`, closes the schema gap found during reconciliation:
- Adds `oauth_states` and `oauth_identities`, which the Google OAuth routes use but which were absent from the export.
- The registration route writes gender, date of birth, preferred language, and terms acceptance to existing `users` columns instead of the absent `user_onboarding_details` table.

The export's three views (`public_profiles`, `public_marketplace_search`, `stale_unverified_otps`) are present in the snapshot and are used by the Worker. The exported backup tables are archival copies and must not be treated as live application tables.

Do not import the export's CSV/JSON/SQL row data into Git. It includes personal user data. Apply migration 52 only when the target D1 migration tracker is at version 51.
