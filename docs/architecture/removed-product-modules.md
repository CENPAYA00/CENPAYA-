# Cenpaya product scope removals

The following user-facing modules are out of scope and must not be rebuilt as part of the D1 + Supabase monolith:

- Communities
- Social Groups and group invitations/polls
- Standalone Pages
- User-facing Activity Log / personal browsing and action history

## Frontend changes

The integration branch removes their page components, routes, and sidebar links. Requests to the old `/groups`, `/communities`, `/pages`, and `/activity` paths redirect to `/home`. Direct messaging remains available; group conversation creation and group threads have been removed from the D1 chat API.

The placeholder Pages screen was not routed in the app, but its unused component has also been removed.

## Data safety

This is a product-scope removal, not permission to drop tables or erase existing records immediately. Existing D1 community/group tables and Supabase activity-history records are left intact for now. They must not be read or written by new frontend features. A separate reviewed migration can archive/drop obsolete data only after foreign keys, triggers, backups, and retention obligations are checked.

## Features deliberately retained

- One-to-one chat and notifications.
- Social feed, posts, comments, reactions, follows, and saved content.
- Support tickets and content reports.
- Admin security audit logs, financial ledger, escrow/payment history, and other financial records.

The admin audit trail and financial ledger are not the user-facing Activity Log and must not be removed.
