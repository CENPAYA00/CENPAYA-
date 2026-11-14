-- Read-only catalog inventory for the existing Neon PostgreSQL database.
-- Run against the intended database with a read-only role. This script makes no changes.

-- Schemas and relations (tables, partitioned tables, views, materialized views, foreign tables).
SELECT
  n.nspname AS schema_name,
  c.relname AS object_name,
  CASE c.relkind
    WHEN 'r' THEN 'table'
    WHEN 'p' THEN 'partitioned_table'
    WHEN 'v' THEN 'view'
    WHEN 'm' THEN 'materialized_view'
    WHEN 'f' THEN 'foreign_table'
    ELSE c.relkind::text
  END AS object_type,
  c.reltuples::bigint AS estimated_rows,
  c.relrowsecurity AS row_level_security_enabled,
  c.relforcerowsecurity AS row_level_security_forced
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%'
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
ORDER BY n.nspname, c.relname;

-- Columns, types, nullability, and defaults for application relations.
SELECT
  n.nspname AS schema_name,
  c.relname AS relation_name,
  a.attnum AS ordinal_position,
  a.attname AS column_name,
  pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
  NOT a.attnotnull AS is_nullable,
  pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS default_expression,
  a.attidentity AS identity_kind,
  a.attgenerated AS generated_kind
FROM pg_catalog.pg_attribute AS a
JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_attrdef AS d
  ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%'
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY n.nspname, c.relname, a.attnum;

-- Constraints and relationships.
SELECT
  n.nspname AS schema_name,
  c.relname AS relation_name,
  con.conname AS constraint_name,
  CASE con.contype
    WHEN 'p' THEN 'primary_key'
    WHEN 'f' THEN 'foreign_key'
    WHEN 'u' THEN 'unique'
    WHEN 'c' THEN 'check'
    WHEN 'x' THEN 'exclusion'
    ELSE con.contype::text
  END AS constraint_type,
  pg_catalog.pg_get_constraintdef(con.oid, true) AS definition,
  rn.nspname AS referenced_schema,
  rc.relname AS referenced_relation
FROM pg_catalog.pg_constraint AS con
JOIN pg_catalog.pg_class AS c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_class AS rc ON rc.oid = con.confrelid
LEFT JOIN pg_catalog.pg_namespace AS rn ON rn.oid = rc.relnamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, c.relname, con.conname;

-- Indexes.
SELECT
  schemaname AS schema_name,
  tablename AS relation_name,
  indexname AS index_name,
  indexdef AS definition
FROM pg_catalog.pg_indexes
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY schemaname, tablename, indexname;

-- Non-internal triggers.
SELECT
  n.nspname AS schema_name,
  c.relname AS relation_name,
  t.tgname AS trigger_name,
  pg_catalog.pg_get_triggerdef(t.oid, true) AS definition,
  p.proname AS function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS function_arguments
FROM pg_catalog.pg_trigger AS t
JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_proc AS p ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, c.relname, t.tgname;

-- RLS policies.
SELECT
  schemaname AS schema_name,
  tablename AS relation_name,
  policyname AS policy_name,
  permissive,
  roles,
  cmd AS command,
  qual AS using_expression,
  with_check AS check_expression
FROM pg_catalog.pg_policies
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY schemaname, tablename, policyname;

-- Functions and procedures (identity/signature and security metadata only; no source bodies).
SELECT
  n.nspname AS schema_name,
  p.proname AS routine_name,
  CASE p.prokind WHEN 'p' THEN 'procedure' ELSE 'function' END AS routine_type,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,
  pg_catalog.pg_get_function_result(p.oid) AS result_type,
  l.lanname AS language,
  p.prosecdef AS security_definer,
  p.provolatile AS volatility
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%'
ORDER BY n.nspname, p.proname, arguments;

-- User-defined enum types and labels.
SELECT
  n.nspname AS schema_name,
  t.typname AS enum_type,
  e.enumlabel AS enum_value,
  e.enumsortorder AS sort_order
FROM pg_catalog.pg_type AS t
JOIN pg_catalog.pg_namespace AS n ON n.oid = t.typnamespace
JOIN pg_catalog.pg_enum AS e ON e.enumtypid = t.oid
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, t.typname, e.enumsortorder;

-- Installed extensions.
SELECT
  e.extname AS extension_name,
  e.extversion AS version,
  n.nspname AS schema_name
FROM pg_catalog.pg_extension AS e
JOIN pg_catalog.pg_namespace AS n ON n.oid = e.extnamespace
ORDER BY e.extname;
