export interface UserBalance {
  id: string;
  user_id: string;
  currency_code: string;
  available_funds: number;
  referral_earnings_available: number;
  referral_pending_lock: number;
  referral_received_locked: number;
  daily_withdrawn_total: number;
  daily_withdrawn_reset_at: string;
  monthly_withdrawn_total: number;
  monthly_withdrawn_reset_at: string;
}