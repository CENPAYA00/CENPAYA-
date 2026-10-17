import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Wallet, TrendingUp, Lock, ArrowDownToLine, ArrowRight } from 'lucide-react';

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalListings: 0,
    totalOrders: 0,
    platformGains: 0,
  });
  const [circ, setCirc] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const [users, listings, orders, gains, circulation] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true }),
        supabase.from('listings').select('id', { count: 'exact', head: true }),
        supabase.from('orders').select('id', { count: 'exact', head: true }),
        supabase.from('system_gains').select('amount_earned'),
        supabase.rpc('admin_money_circulation_full'),
      ]);

      const totalGains = (gains.data || []).reduce((s, g: any) => s + (g.amount_earned || 0), 0);
      setStats({
        totalUsers: users.count || 0,
        totalListings: listings.count || 0,
        totalOrders: orders.count || 0,
        platformGains: totalGains,
      });
      if (circulation.data?.ok) setCirc(circulation.data);
      setLoading(false);
    };
    fetch();
  }, []);

  if (loading) return <div className="p-8 text-center text-[13px] text-[#6f8077]">Loading stats...</div>;

  return (
    <div>
      <h2 className="text-[22px] font-bold text-[#0a3d2b] dark:text-white mb-4">Platform Overview</h2>

      {/* Top stats - using Claude's cp-grid and cp-stat */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-white dark:bg-darkcard p-4 rounded-[14px] shadow-[0_1px_4px_rgba(10,61,43,0.08)]">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6f8077]">Total Users</p>
          <p className="text-[24px] font-bold text-[#0a3d2b] dark:text-white mt-1">{stats.totalUsers}</p>
        </div>
        <div className="bg-white dark:bg-darkcard p-4 rounded-[14px] shadow-[0_1px_4px_rgba(10,61,43,0.08)]">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6f8077]">Active Listings</p>
          <p className="text-[24px] font-bold text-[#0a3d2b] dark:text-white mt-1">{stats.totalListings}</p>
        </div>
        <div className="bg-white dark:bg-darkcard p-4 rounded-[14px] shadow-[0_1px_4px_rgba(10,61,43,0.08)]">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6f8077]">Total Orders</p>
          <p className="text-[24px] font-bold text-[#0a3d2b] dark:text-white mt-1">{stats.totalOrders}</p>
        </div>
        
        {/* Dark Gradient Card for Gains */}
        <div className="bg-gradient-to-br from-[#0f5a3c] to-[#0a3d2b] p-4 rounded-[14px] shadow-[0_1px_4px_rgba(10,61,43,0.08)] text-white">
          <p className="text-[11px] font-semibold uppercase tracking-wider opacity-90">Platform Gains</p>
          <p className="text-[24px] font-bold mt-1">{stats.platformGains.toLocaleString()} <span className="text-[12px] opacity-70">XAF</span></p>
        </div>
      </div>

      {/* Money circulation */}
      {circ && (
        <>
          <p className="text-[11px] font-bold text-[#6f8077] uppercase tracking-wider mb-2">
            Money in circulation
          </p>

          {/* Hero Card */}
          <div className="bg-gradient-to-br from-[#14b070] to-[#0b8f58] p-5 rounded-[16px] text-white mb-4 shadow-sm">
            <p className="text-[11px] uppercase tracking-wider font-semibold opacity-90">Total circulating</p>
            <p className="text-[26px] font-bold mt-1">{circ.total_circulating.toLocaleString()} XAF</p>
            <p className="text-[11px] opacity-80 mt-1">
              Wallets + referral lock + escrow held
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-5">
            <CircCard icon={<Wallet size={14} />} label="Wallet balances" value={circ.wallet_total} />
            <CircCard icon={<Lock size={14} />} label="Orders escrow" value={circ.orders_escrow} />
            <CircCard icon={<Lock size={14} />} label="Services escrow" value={circ.services_escrow} />
            <CircCard icon={<TrendingUp size={14} />} label="Gains total" value={circ.gains_total} />
            <CircCard icon={<Wallet size={14} />} label="Referral locked" value={circ.referral_locked} />
            <CircCard icon={<ArrowDownToLine size={14} />} label="Pending withdrawals" value={circ.pending_withdrawals} />
          </div>
        </>
      )}

      {/* Quick actions using Claude's buttons */}
      <div className="bg-white dark:bg-darkcard p-4 rounded-[16px] shadow-[0_1px_4px_rgba(10,61,43,0.08)]">
        <p className="text-[15px] font-bold text-[#0a3d2b] dark:text-white mb-3">Quick actions</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => navigate('/admin/inbox')} className="bg-[#12935a] text-white text-[13px] font-semibold py-2.5 rounded-[12px] flex items-center justify-center gap-2">
            Open inbox <ArrowRight size={14} />
          </button>
          <button onClick={() => navigate('/admin/ledger')} className="bg-[#0a3d2b] text-white text-[13px] font-semibold py-2.5 rounded-[12px] flex items-center justify-center gap-2">
            View ledger <ArrowRight size={14} />
          </button>
          <button onClick={() => navigate('/admin/vault')} className="bg-[#0a3d2b] text-white text-[13px] font-semibold py-2.5 rounded-[12px] flex items-center justify-center gap-2">
            Manage vault <ArrowRight size={14} />
          </button>
          <button onClick={() => navigate('/admin/finance')} className="bg-[#12935a] text-white text-[13px] font-semibold py-2.5 rounded-[12px] flex items-center justify-center gap-2">
            View finances <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CircCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-white dark:bg-darkcard p-3.5 rounded-[14px] shadow-[0_1px_4px_rgba(10,61,43,0.08)]">
      <div className="flex items-center gap-1.5 mb-1.5 text-[#6f8077]">
        {icon}
        <p className="text-[10px] font-semibold uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-[16px] font-bold text-[#0a3d2b] dark:text-white">
        {Number(value || 0).toLocaleString()} <span className="text-[10px] text-[#6f8077] font-normal">XAF</span>
      </p>
    </div>
  );
}
