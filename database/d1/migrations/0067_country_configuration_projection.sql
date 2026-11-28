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

INSERT INTO country_configuration_projection
(country_code,name,phone_prefix,currency_code,currency_value_in_xaf,flag_emoji,regions_json,enabled_methods_json,status)
VALUES
('CM','Cameroon','+237','XAF',1,'🇨🇲','[]','["mtn_momo","orange_money"]','active'),
('CF','Central African Republic','+236','XAF',1,'🇨🇫','[]','[]','coming_soon'),
('CG','Republic of the Congo','+242','XAF',1,'🇨🇬','[]','[]','coming_soon'),
('GA','Gabon','+241','XAF',1,'🇬🇦','[]','[]','coming_soon'),
('GQ','Equatorial Guinea','+240','XAF',1,'🇬🇶','[]','[]','coming_soon'),
('TD','Chad','+235','XAF',1,'🇹🇩','[]','[]','coming_soon')
ON CONFLICT(country_code) DO NOTHING;

INSERT INTO supported_countries(country_code,name,currency_code,phone_prefix,status)
VALUES
('CM','Cameroon','XAF','+237','active'),
('CF','Central African Republic','XAF','+236','coming_soon'),
('CG','Republic of the Congo','XAF','+242','coming_soon'),
('GA','Gabon','XAF','+241','coming_soon'),
('GQ','Equatorial Guinea','XAF','+240','coming_soon'),
('TD','Chad','XAF','+235','coming_soon')
ON CONFLICT(country_code) DO UPDATE SET
  name=excluded.name,currency_code=excluded.currency_code,
  phone_prefix=excluded.phone_prefix,status=excluded.status;
INSERT OR IGNORE INTO cenpaya_migrations(version,migration_name)
VALUES (67,'country_configuration_projection');
