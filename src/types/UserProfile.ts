export type UserRole =
  | "user"
  | "support_agent"
  | "super_admin"
  | "owner";

export type ModerationState =
  | "active"
  | "flagged"
  | "suspended"
  | "banned";

export interface UserRow {
  id: string;
  username: string;
  email: string;
  phone: string | null;
  is_subscribed: boolean;
  subscribed_at: string | null;
  created_at: string;
  referred_by: string | null;
  direct_subscribed_count: number;
  followers_count: number;
  sales_count: number;
  role: UserRole;
  device_fingerprint: string | null;
  signup_ip: string | null;
  banned: boolean;
  is_email_verified: boolean;
  country_iso: string | null;
  banned_at: string | null;
  banned_reason: string | null;
  moderation_state: ModerationState;
  moderation_state_changed_at: string | null;
  moderation_state_changed_by: string | null;
  is_phone_verified: boolean;
  reputation_score: number;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  is_membership_exempt: boolean;
  membership_granted_by: string | null;
  membership_grant_reason: string | null;
  membership_expires_at: string | null;
  membership_started_at: string | null;
  signed_out_at: string | null;
  last_active_at: string;
  biometric_enabled: boolean;
  biometric_credential_id: string | null;
}