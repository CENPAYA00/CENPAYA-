# Cenpaya D1 Worker database

The supplied export (2026-11-21) records 51 applied migrations and a live schema of 73 application tables, 3 views, 146 explicit indexes, and 68 triggers. The archive also contains user/profile/listing records; those data files are not committed here.

Migration 52, `migrations/0052_oauth_worker_identity_support.sql`, reconciles the Worker with the export:
- Adds `users.password_hash`, required by the existing password registration/login code but absent from the exported `users` table.
- Adds `oauth_states` and `oauth_identities`, required by the Google OAuth routes but absent from the export.
- Registration stores gender, date of birth, preferred language, and terms acceptance in existing `users` columns; the absent `user_onboarding_details` table is no longer referenced.

The export's views (`public_profiles`, `public_marketplace_search`, `stale_unverified_otps`) are present in the snapshot and used by the Worker. Backup tables are archival copies, not live application tables.

Do not import the export's CSV/JSON/SQL row data into Git. It includes personal user data. Apply migration 52 only when the target D1 migration tracker is at version 51.
