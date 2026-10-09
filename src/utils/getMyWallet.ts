import type { SupabaseClient } from "@supabase/supabase-js";

type Wallet = {
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
};

export async function getMyWallet(
  supabase: SupabaseClient
): Promise<Wallet | null> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) return null;

  const { data, error } = await supabase
    .from("wallets")
    .select(
      "user_id, available_funds, referral_pending_lock, referral_received_locked, referral_earnings_available, daily_withdrawn_total, daily_withdrawn_reset_at, monthly_withdrawn_total, monthly_withdrawn_reset_at, referral_bonus_pending"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  return data as Wallet | null;
}