-- RDS provisioning: the application role. Run as the master user, once per env.
--
-- WHY THIS EXISTS (ADR-0007): row-level security is the second enforcement
-- layer for territory scoping and employer masking. Two identities bypass RLS:
--   * superusers — always, regardless of FORCE ROW LEVEL SECURITY
--   * table owners — unless FORCE is set (our migrations set it)
-- The application must therefore connect as a NOSUPERUSER role that does NOT
-- own the tables. Migrations run as a separate, privileged role (the owner).
--
-- Usage:
--   psql "$MASTER_URL" -v app_password="'<strong password from secrets manager>'" -f scripts/provision-db-role.sql
-- Then set the app's DATABASE_URL to connect as app_ursainyk.

CREATE ROLE app_ursainyk LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :app_password;

GRANT CONNECT ON DATABASE nabhahita TO app_ursainyk;
GRANT USAGE ON SCHEMA public TO app_ursainyk;

-- Data access: full DML; DDL stays with the migration role.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_ursainyk;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_ursainyk;

-- Future tables created by the migration role inherit the grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_ursainyk;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_ursainyk;

-- Note: UPDATE/DELETE on AuditLog, Verification and LedgerEntry are still
-- blocked for this role by the append-only triggers — grants do not override
-- triggers. RLS policies on Candidate/Requirement/Placement now actually
-- apply to every application query.
