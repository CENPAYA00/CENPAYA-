import type { QueryResultRow } from 'pg';

export interface UserProfileRow extends QueryResultRow {
  id: string;
  email: string | null;
  role: string | null;
  onboarding_completed: boolean | null;
  is_subscribed: number | string | null;
  banned: number | string | null;
  is_membership_exempt: boolean | number | string | null;
  membership_expires_at: Date | string | null;
  trial_ends_at: Date | string | null;
  moderation_state: string | null;
  signed_out_at: Date | string | null;
}

export interface UserProfile {
  id: string;
  email: string | null;
  role: string | null;
  onboarding_completed: boolean;
  is_subscribed: boolean;
  is_paid_membership_active: boolean;
  is_membership_exempt: boolean;
  membership_expires_at: string | null;
  trial_ends_at: string | null;
  banned: boolean;
  moderation_state: string | null;
  signed_out_at: string | null;
}

export type ProfileQuery = (sql: string, values: readonly unknown[]) => Promise<{ rows: UserProfileRow[] }>;

/** Normalize PostgreSQL SMALLINT and common boolean encodings without treating arbitrary strings as true. */
export function asBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  if (typeof value === 'string') {
    return ['1', 'true', 't', 'yes'].includes(value.trim().toLowerCase());
  }

  return false;
}

function asIsoString(value: Date | string | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Read the authenticated user's known profile fields from the existing users table.
 * The user ID is always passed as a PostgreSQL parameter, never interpolated into SQL.
 */
export async function readUserProfile(
  query: ProfileQuery,
  userId: string,
  now = Date.now(),
): Promise<UserProfile | null> {
  const result = await query(
    `select id, email, role, onboarding_completed, is_subscribed, banned,
            is_membership_exempt, membership_expires_at, trial_ends_at,
            moderation_state, signed_out_at
       from public.users
      where id = $1
      limit 1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) return null;

  const isMembershipExempt = asBool(row.is_membership_exempt);
  const paidExpiry = row.membership_expires_at
    ? new Date(row.membership_expires_at).getTime()
    : Number.NaN;
  const trialExpiry = row.trial_ends_at
    ? new Date(row.trial_ends_at).getTime()
    : Number.NaN;
  const hasLivePaidMembership = Number.isFinite(paidExpiry) && paidExpiry > now;
  const hasLiveTrial = Number.isFinite(trialExpiry) && trialExpiry > now;
  const isSubscribed = isMembershipExempt || hasLivePaidMembership || hasLiveTrial;

  return {
    id: row.id,
    email: row.email,
    role: row.role,
    onboarding_completed: row.onboarding_completed === true,
    // Expiry is authoritative for paid membership; exemption and valid trials are independent.
    is_subscribed: isSubscribed,
    is_paid_membership_active: hasLivePaidMembership,
    is_membership_exempt: isMembershipExempt,
    membership_expires_at: asIsoString(row.membership_expires_at),
    trial_ends_at: asIsoString(row.trial_ends_at),
    banned: asBool(row.banned),
    moderation_state: row.moderation_state,
    signed_out_at: asIsoString(row.signed_out_at),
  };
}
