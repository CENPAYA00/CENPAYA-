import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { MyReferralsDashboard } from '../types/ReferralDashboard';

export default function Referrals() {
  const [dashboard, setDashboard] = useState<MyReferralsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [referralLink, setReferralLink] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);

      // Build the referral link
      setReferralLink(`https://cenpaya.com/signup?ref=${user.id.slice(0, 8)}`);

      // Fetch the whole dashboard in one query
      const { data, error } = await supabase
        .from('my_referral_dashboard')
        .select('*')
        .eq('referrer_id', user.id);

      if (error || !data) {
        setLoading(false);
        return;
      }

      const referrals = data as any[];
      const direct = referrals.length;
      const subscribed = referrals.filter(r => r.status === 'unlocked').length;
      const totalPoints = referrals.reduce((sum, r) => sum + (r.points || 0), 0);

      setDashboard({
        direct_referrals_count: direct,
        subscribed_referrals_count: subscribed,
        total_points: totalPoints,
        referrals: referrals as any[],
      });
      setLoading(false);
    };
    load();
  }, []);

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink);
    alert('Referral link copied!');
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'unlocked': return 'bg-green-100 text-green-700';
      case 'pending': return 'bg-yellow-100 text-yellow-700';
      case 'locked': return 'bg-gray-100 text-gray-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) return <div className="p-4 text-center">Loading referrals...</div>;

  return (
    <div className="p-4 bg-offwhite min-h-screen pb-20">
      <h1 className="text-2xl font-bold text-navy mb-4">Referrals</h1>

      {/* Referral Link Card */}
      <div className="bg-navy text-white p-4 rounded-2xl shadow-sm mb-4 text-center">
        <p className="text-lg font-bold mb-1">Earn 1,000 XAF per referral</p>
        <p className="text-xs text-gold mb-3">Both of you must subscribe to unlock the reward.</p>
        <button
          onClick={copyLink}
          className="bg-gold text-navy font-bold px-4 py-2 rounded-xl w-full"
        >
          Copy Referral Link
        </button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white p-3 rounded-xl shadow-sm text-center">
          <p className="text-xs text-gray-500">Total</p>
          <p className="font-bold text-navy text-lg">
            {dashboard?.direct_referrals_count || 0}
          </p>
        </div>
        <div className="bg-white p-3 rounded-xl shadow-sm text-center">
          <p className="text-xs text-gray-500">Subscribed</p>
          <p className="font-bold text-green-600 text-lg">
            {dashboard?.subscribed_referrals_count || 0}
          </p>
        </div>
        <div className="bg-white p-3 rounded-xl shadow-sm text-center">
          <p className="text-xs text-gray-500">Points</p>
          <p className="font-bold text-gold text-lg">
            {dashboard?.total_points || 0}
          </p>
        </div>
      </div>

      {/* Referral List */}
      {(!dashboard || dashboard.referrals.length === 0) && (
        <div className="bg-white p-4 rounded-2xl shadow-sm text-center text-gray-500">
          You have no referrals yet. Share your link to start earning!
        </div>
      )}

      {dashboard?.referrals.map((ref) => (
        <div key={ref.id} className="bg-white p-3 rounded-xl shadow-sm mb-2 flex justify-between items-center">
          <div>
            <p className="text-navy font-medium text-sm">
              {ref.referred_username ? `@${ref.referred_username}` : `User ${ref.referred_id.slice(0, 8)}...`}
            </p>
            <p className="text-xs text-gray-400">
              {new Date(ref.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="text-right">
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${getStatusStyle(ref.status)}`}>
              {ref.status}
            </span>
            <p className="text-xs font-bold text-navy mt-1">{ref.points} XAF</p>
          </div>
        </div>
      ))}
    </div>
  );
}