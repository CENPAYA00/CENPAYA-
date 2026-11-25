-- 0067: mirror centrally managed country configuration into the D1 Worker.
-- Supabase remains authoritative for financial pricing and payment state.
CREATE TABLE IF NOT EXISTS country_configuration_projection (
  country_code TEXT PRIMARY KEY NOT NULL CHECK (length(country_code)=2 AND country_code=upper(country_code)),
  name TEXT NOT NULL,
  phone_prefix TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  currency_value_in_xaf REAL NOT NULL DEFAULT 1 CHECK (currency_value_in_xaf > 0),
  flag_emoji TEXT,
  regions_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(regions_json)),
  enabled_methods_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(enabled_methods_json)),
  status TEXT NOT NULL CHECK (status IN ('active','coming_soon')),
  config_version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_country_configuration_projection_status
  ON country_configuration_projection(status,name);
INSERT OR IGNORE INTO cenpaya_migrations(version,migration_name)
VALUES (67,'country_configuration_projection');
