export type ReferralStatus =
  | "locked"
  | "pending"
  | "unlocked"
  | "cancelled";

export interface ReferralDashboardItem {
  id: string;
  referred_id: string;
  referred_username: string | null;
  points: number;
  status: ReferralStatus;
  created_at: string;
  referred_subscribed_at: string | null;
  referrer_l2_id: string | null;
  points_l2: number;
  l2_paid_at: string | null;
}

export interface MyReferralsDashboard {
  direct_referrals_count: number;
  subscribed_referrals_count: number;
  total_points: number;
  referrals: ReferralDashboardItem[];
}
