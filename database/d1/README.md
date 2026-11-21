# Cenpaya D1 database reference

Source: the supplied Cloudflare D1 export for database `cenpaya-db`, exported 2026-11-21.

The export describes 73 application tables, 3 views, 146 explicit indexes, and 68 triggers. It records migrations 1–51 in `cenpaya_migrations`.

Migration 52 is maintained in this folder and adds the Google OAuth persistence tables required by the D1 Worker. The Worker registration path stores gender, date of birth, preferred language, and terms acceptance directly in the existing `users` columns; it does not require a separate `user_onboarding_details` table.

The export also contains backup tables and user/profile/listing data. Backup tables and exported row data are intentionally not copied into source control. Do not commit `data.sql`, `full_dump.sql`, CSV/JSON data exports, credentials, or personal user records.

Apply migration 52 only to a D1 database whose migration tracker is at version 51. Do not replay it on a database already at version 52 or later.
