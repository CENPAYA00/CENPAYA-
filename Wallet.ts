export interface WalletRow {
  user_id: string;
  available_funds: number;
  referral_pending_lock: number;
  referral_received_locked: number;
  referral_earnings_available: number;
  daily_withdrawn_total: number;
  daily_withdrawn_reset_at: string;
  monthly_withdrawn_total: number;
  monthly_withdrawn_reset_at: string;
  referral_bonus_pending: number;
}