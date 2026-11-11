
-- CENPAYA: First-party authentication storage
-- Target: Neon PostgreSQL
-- Additive migration. Does not modify existing user or financial records.

BEGIN;

-- Authenticated browser sessions.
-- Store SHA-256 token digests, never raw session tokens.
CREATE TABLE IF NOT EXISTS public.auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL
        REFERENCES public.users(id) ON DELETE CASCADE,

    token_hash BYTEA NOT NULL UNIQUE,
    csrf_token_hash BYTEA NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,

    ip_hash BYTEA,
    user_agent TEXT,

    CONSTRAINT auth_sessions_token_hash_length
        CHECK (OCTET_LENGTH(token_hash) = 32),

    CONSTRAINT auth_sessions_csrf_hash_length
        CHECK (OCTET_LENGTH(csrf_token_hash) = 32),

    CONSTRAINT auth_sessions_expiry_valid
        CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_active_idx
    ON public.auth_sessions (user_id, expires_at DESC)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx
    ON public.auth_sessions (expires_at);


-- One-time tokens for email verification and password recovery.
-- Raw tokens must only be emailed, never stored in this table.
CREATE TABLE IF NOT EXISTS public.auth_email_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES public.users(id) ON DELETE CASCADE,

    purpose TEXT NOT NULL
        CHECK (purpose IN ('verify_email', 'reset_password')),

    token_hash BYTEA NOT NULL UNIQUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,

    CONSTRAINT auth_email_tokens_hash_length
        CHECK (OCTET_LENGTH(token_hash) = 32),

    CONSTRAINT auth_email_tokens_expiry_valid
        CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS auth_email_tokens_user_purpose_idx
    ON public.auth_email_tokens (user_id, purpose, expires_at DESC)
    WHERE consumed_at IS NULL;


-- Google OAuth account mapping.
-- The Worker must validate Google's ID token before inserting records.
CREATE TABLE IF NOT EXISTS public.auth_oauth_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES public.users(id) ON DELETE CASCADE,

    provider TEXT NOT NULL
        CHECK (provider = 'google'),

    provider_subject TEXT NOT NULL,
    provider_email TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,

    CONSTRAINT auth_oauth_provider_subject_unique
        UNIQUE (provider, provider_subject),

    CONSTRAINT auth_oauth_user_provider_unique
        UNIQUE (user_id, provider)
);


-- Allow the application Worker role to manage these auth tables.
GRANT SELECT, INSERT, UPDATE, DELETE
ON public.auth_sessions,
   public.auth_email_tokens,
   public.auth_oauth_accounts
TO cenpaya_worker_app;

COMMIT;
