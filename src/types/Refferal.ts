export type ReferralStatus =
  | "locked"
  | "pending"
  | "unlocked"
  | "cancelled";

export interface ReferralRow {
  id: string;
  referrer_id: string;
  referred_id: string;
  points: number;
  status: ReferralStatus;
  referrer_subscribed_at: string | null;
  referred_subscribed_at: string | null;
  instant_bypass: boolean;
  bypass_hold_released_at: string | null;
  created_at: string;
  referrer_l2_id: string | null;
  points_l2: number | null;
  l2_paid_at: string | null;
}