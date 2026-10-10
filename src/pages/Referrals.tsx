import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Copy, Check, TrendingUp, Sparkles, Users, Gift, Link2 } from 'lucide-react';

type ReferralItem = {
  id: string;
  referred_id: string;
  referred_username: string | null;
  points: number;
  status: string;
  created_at: string;
};

type Dashboard = {
  direct_referrals_count: number;
  subscribed_referrals_count: number;
  total_points: number;
  referrals: ReferralItem[];
};

export default function Referrals() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [referralLink, setReferralLink] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      setReferralLink(`https://cenpaya.pages.dev/signup?ref=${user.id.slice(0, 8)}`);

      const { data, error } = await supabase
        .from('referrals')
        .select('id, referred_id, points, status, created_at, referred_username')
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false });

      if (error || !data) {
        setLoading(false);
        return;
      }

      const referrals = data as ReferralItem[];
      setDashboard({
        direct_referrals_count: referrals.length,
        subscribed_referrals_count: referrals.filter(r => r.status === 'unlocked').length,
        total_points: referrals.reduce((sum, r) => sum + (r.points || 0), 0),
        referrals,
      });
      setLoading(false);
    };
    load();
  }, []);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Could not copy. Long-press the link to copy manually.');
    }
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

  if (loading) {
    return (
      <div className="px-3 py-3 pb-24 space-y-3">
        <div className="h-28 bg-gray-200 rounded-2xl animate-pulse"></div>
        <div className="grid grid-cols-3 gap-2">
          <div className="h-16 bg-gray-200 rounded-xl animate-pulse"></div>
          <div className="h-16 bg-gray-200 rounded-xl animate-pulse"></div>
          <div className="h-16 bg-gray-200 rounded-xl animate-pulse"></div>
        </div>
        <div className="h-14 bg-gray-200 rounded-xl animate-pulse"></div>
        <div className="h-14 bg-gray-200 rounded-xl animate-pulse"></div>
      </div>
    );
  }

  return (
    <div className="px-3 py-3 pb-24">
      <h1 className="text-base font-bold text-navy mb-3">Referrals</h1>

      {/* Hero earnings card */}
      <div className="bg-gradient-to-br from-brand to-brand-dark p-4 rounded-2xl shadow-lg shadow-brand/30 mb-3 relative overflow-hidden animate-fade-in">
        <div className="absolute top-0 right-0 w-32 h-32 bg-accent/20 rounded-full -mr-12 -mt-12 animate-pulse"></div>
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={13} className="text-accent-light" />
            <p className="text-[9px] font-bold text-accent-light uppercase tracking-widest">
              Referral Earnings
            </p>
          </div>
          <p className="text-2xl font-black text-white mt-1">
            {(dashboard?.total_points || 0).toLocaleString()}{' '}
            <span className="text-sm text-accent-light">XAF</span>
          </p>
          <p className="text-[9px] text-white/70 mt-1">
            Earn 1,000 XAF (L1) + 250 XAF (L2) per subscriber
          </p>
        </div>
      </div>

      {/* Cascade stat cards */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <StatCard
          icon={<Users size={12} />}
          label="Total"
          value={dashboard?.direct_referrals_count || 0}
          delay="0ms"
        />
        <StatCard
          icon={<TrendingUp size={12} />}
          label="Subscribed"
          value={dashboard?.subscribed_referrals_count || 0}
          highlight
          delay="100ms"
        />
        <StatCard
          icon={<Gift size={12} />}
          label="Earned"
          value={(dashboard?.total_points || 0).toLocaleString()}
          delay="200ms"
        />
      </div>

      {/* Referral link card */}
      <div className="bg-white p-3 rounded-2xl shadow-sm mb-3 animate-fade-in">
        <div className="flex items-center gap-2 mb-2">
          <Link2 size={13} className="text-accent" />
          <p className="text-[11px] font-bold text-navy">Your referral link</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-[10px] font-mono text-gray-600 truncate mb-2">
          {referralLink}
        </div>
        <button
          onClick={copyLink}
          className={`w-full py-2.5 rounded-lg font-bold text-[11px] flex items-center justify-center gap-2 transition-all active:scale-95 ${
            copied ? 'bg-green-500 text-white' : 'bg-accent text-white'
          }`}
        >
          {copied ? (
            <>
              <Check size={13} /> Copied!
            </>
          ) : (
            <>
              <Copy size={13} /> Copy & Share
            </>
          )}
        </button>
      </div>

      {/* Bonus progress */}
      <div className="bg-white p-3 rounded-2xl shadow-sm mb-3 animate-fade-in">
        <div className="flex justify-between items-center mb-2">
          <p className="text-[11px] font-bold text-navy">Bonus Progress</p>
          <p className="text-[9px] font-bold text-accent">
            {dashboard?.subscribed_referrals_count || 0}/20
          </p>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            className="bg-gradient-to-r from-accent to-accent-dark h-2 rounded-full transition-all duration-1000 ease-out"
            style={{
              width: `${Math.min(((dashboard?.subscribed_referrals_count || 0) / 20) * 100, 100)}%`,
            }}
          ></div>
        </div>
        <p className="text-[9px] text-gray-500 mt-2">
          {Math.max(20 - (dashboard?.subscribed_referrals_count || 0), 0)} more subscribers to unlock 10,000 XAF bonus
        </p>
      </div>

      {/* Referral list */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="p-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-[11px] font-bold text-navy">Your Referrals</p>
          <p className="text-[9px] text-gray-400">{dashboard?.referrals.length || 0} total</p>
        </div>

        {(!dashboard || dashboard.referrals.length === 0) && (
          <div className="p-5 text-center">
            <div className="w-12 h-12 bg-accent/10 rounded-full mx-auto flex items-center justify-center mb-2">
              <Users size={18} className="text-accent" />
            </div>
            <p className="text-[11px] font-bold text-navy">No referrals yet</p>
            <p className="text-[9px] text-gray-500 mt-1">
              Share your link to start earning 1,000 XAF per subscriber.
            </p>
          </div>
        )}

        {dashboard?.referrals.map((ref, index) => (
          <div
            key={ref.id}
            className="p-3 flex items-center gap-3 border-b border-gray-50 last:border-b-0 animate-fade-in"
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <div className="w-8 h-8 bg-accent/10 rounded-full flex items-center justify-center text-accent font-bold text-[11px]">
              {ref.referred_username?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-navy truncate">
                {ref.referred_username ? `@${ref.referred_username}` : `User ${ref.referred_id.slice(0, 6)}`}
              </p>
              <p className="text-[9px] text-gray-400">
                {new Date(ref.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="text-right">
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${getStatusStyle(ref.status)}`}>
                {ref.status}
              </span>
              <p className="text-[10px] font-bold text-navy mt-1">{ref.points} XAF</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  highlight,
  delay,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  highlight?: boolean;
  delay: string;
}) {
  return (
    <div
      className={`p-2.5 rounded-xl shadow-sm animate-fade-in ${
        highlight ? 'bg-accent text-white' : 'bg-white'
      }`}
      style={{ animationDelay: delay }}
    >
      <div className={`flex items-center gap-1 mb-1 ${highlight ? 'text-white' : 'text-gray-400'}`}>
        {icon}
        <p className={`text-[9px] font-medium ${highlight ? 'text-white/80' : 'text-gray-500'}`}>
          {label}
        </p>
      </div>
      <p className={`text-sm font-black ${highlight ? 'text-white' : 'text-navy'}`}>{value}</p>
    </div>
  );
            }
