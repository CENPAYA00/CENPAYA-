
-- CENPAYA: Preserve signup metadata and legal acceptance records.
-- Additive only. Existing users and financial data are untouched.

BEGIN;

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS user_metadata JSONB
        NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.user_legal_acceptances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES public.users(id) ON DELETE CASCADE,

    document_slug TEXT NOT NULL,
    version TEXT NOT NULL,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT user_legal_acceptances_user_document_version_unique
        UNIQUE (user_id, document_slug, version)
);

CREATE INDEX IF NOT EXISTS user_legal_acceptances_user_idx
    ON public.user_legal_acceptances (user_id, accepted_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.user_legal_acceptances
TO cenpaya_worker_app;

GRANT SELECT, UPDATE
ON public.users
TO cenpaya_worker_app;

COMMIT;
