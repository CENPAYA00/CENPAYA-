export type SystemGainSourceType =
  | "marketplace_fee"
  | "withdrawal_fee"
  | "boost_fee"
  | "subscription_fee";

export interface SystemGain {
  id: string;
  source_type: SystemGainSourceType;
  source_id: string;
  amount_earned: number;
  processed_at: string | null;
}