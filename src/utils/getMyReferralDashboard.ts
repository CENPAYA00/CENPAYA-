import { supabase } from '../lib/supabase';
import { d1Me } from '../lib/d1Api';
import { MyReferralsDashboard, ReferralDashboardItem } from '../types/ReferralDashboard';

export async function getMyReferralDashboard(): Promise<MyReferralsDashboard | null> {
  const { user } = await d1Me();
  if (!user) return null;

  // Fetch the flat dashboard rows from the view
  const { data, error } = await supabase
    .from('my_referral_dashboard')
    .select('*')
    .eq('referrer_id', user.id);

  if (error || !data) return null;

  const referrals = data as unknown as ReferralDashboardItem[];

  // Aggregate the summary
  const direct = referrals.length;
  const subscribed = referrals.filter(r => r.status === 'unlocked').length;
  const totalPoints = referrals.reduce((sum, r) => sum + (r.points || 0), 0);

  return {
    direct_referrals_count: direct,
    subscribed_referrals_count: subscribed,
    total_points: totalPoints,
    referrals,
  };
}
