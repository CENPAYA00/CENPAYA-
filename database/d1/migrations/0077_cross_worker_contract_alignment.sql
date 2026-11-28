-- CenPaya D1 migration 0077: align D1 with the Supabase Worker contracts.
-- Reported applied to the live cenpaya-db on 2026-11-27.
-- Keep this file in source control so the repository records the live schema change.
--
-- 1) Allow 'super_admin' in users.role.
--    The Supabase Worker's admin role assignment mirrors this role through
--    /internal/v1/staff/workspace/sync. vice_admin and staff_member remain
--    represented in their dedicated workspace membership tables.
DROP TRIGGER IF EXISTS trg_users_validate_insert;
CREATE TRIGGER trg_users_validate_insert BEFORE INSERT ON users BEGIN
  SELECT RAISE(ABORT, 'users: invalid role') WHERE NEW.role NOT IN ('user','support_agent','moderator','admin','super_admin','owner');
  SELECT RAISE(ABORT, 'users: invalid moderation_state') WHERE NEW.moderation_state NOT IN ('active','warned','restricted','suspended','banned');
END;

DROP TRIGGER IF EXISTS trg_users_validate_update;
CREATE TRIGGER trg_users_validate_update BEFORE UPDATE OF role, moderation_state ON users BEGIN
  SELECT RAISE(ABORT, 'users: invalid role') WHERE NEW.role NOT IN ('user','support_agent','moderator','admin','super_admin','owner');
  SELECT RAISE(ABORT, 'users: invalid moderation_state') WHERE NEW.moderation_state NOT IN ('active','warned','restricted','suspended','banned');
END;

-- 2) Expose the fields required by the Supabase checkout quote endpoint.
--    Preserve the existing view columns and append the contract fields.
DROP VIEW IF EXISTS public_marketplace_search;
CREATE VIEW public_marketplace_search AS
SELECT l.id AS listing_id, l.title AS product_title, l.price_amount AS product_price, l.currency_code,
       l.listing_type, l.category_id, l.country_code, l.city,
       u.username AS merchant_name, u.is_premium AS merchant_is_premium,
       (l.boosted_until IS NOT NULL AND l.boosted_until > strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS is_boosted,
       COALESCE(l.published_at, l.created_at) AS published_date,
       l.seller_id AS seller_id, l.price_amount AS price_amount, l.price_type AS price_type,
       l.price_is_range AS price_is_range, l.price_min AS price_min, l.price_max AS price_max
FROM marketplace_listings l
JOIN users u ON u.id = l.seller_id
WHERE u.banned = 0 AND u.account_status = 'active' AND l.status = 'active'
  AND l.deleted_at IS NULL AND l.moderation_status = 'approved';

INSERT OR IGNORE INTO cenpaya_migrations(version, migration_name)
VALUES (77, 'cross_worker_contract_alignment_roles_and_search_view');
