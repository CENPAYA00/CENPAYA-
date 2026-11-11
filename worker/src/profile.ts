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

/** Interpret PostgreSQL SMALLINT/boolean-like values without treating null as truthy. */
export function smallintToBoolean(value: unknown): boolean {
  return value !== null && value !== undefined && Number(value) !== 0;
}

function asIsoString(value: Date | string | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isFuture(value: Date | string | null, now: number): boolean {
  if (value === null) return false;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) && time > now;
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

  const isMembershipExempt = smallintToBoolean(row.is_membership_exempt);
  const paidMembershipActive = isFuture(row.membership_expires_at, now);
  const validTrial = isFuture(row.trial_ends_at, now);

  return {
    id: row.id,
    email: row.email,
    role: row.role,
    onboarding_completed: row.onboarding_completed === true,
    // Expiry is authoritative for paid membership; exemption and valid trials are independent.
    is_subscribed: isMembershipExempt || validTrial || paidMembershipActive,
    is_paid_membership_active: paidMembershipActive,
    is_membership_exempt: isMembershipExempt,
    membership_expires_at: asIsoString(row.membership_expires_at),
    trial_ends_at: asIsoString(row.trial_ends_at),
    banned: smallintToBoolean(row.banned),
    moderation_state: row.moderation_state,
    signed_out_at: asIsoString(row.signed_out_at),
  };
}
