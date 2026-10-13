import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Wallet, TrendingUp, Lock, ArrowDownToLine } from 'lucide-react';

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

  if (loading) return <div className="p-4 text-center text-xs">Loading stats...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-navy dark:text-white mb-4">Platform Overview</h2>

      {/* Top stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Stat label="Total Users"     value={stats.totalUsers} />
        <Stat label="Active Listings" value={stats.totalListings} />
        <Stat label="Total Orders"    value={stats.totalOrders} />
        <div className="bg-gradient-to-br from-brand to-brand-dark p-4 rounded-xl shadow-sm text-white">
          <p className="text-[10px] uppercase tracking-wider opacity-80">Platform Gains</p>
          <p className="font-bold text-[20px] mt-1">{stats.platformGains.toLocaleString()} XAF</p>
        </div>
      </div>

      {/* Money circulation */}
      {circ && (
        <>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
            Money in circulation
          </p>

          <div className="bg-gradient-to-br from-accent to-accent-dark p-4 rounded-xl shadow-sm text-white mb-3">
            <p className="text-[10px] uppercase tracking-wider opacity-80">Total circulating</p>
            <p className="text-2xl font-black mt-1">{circ.total_circulating.toLocaleString()} XAF</p>
            <p className="text-[9px] opacity-80 mt-1">
              Wallets + referral lock + escrow held
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <CircCard
              icon={<Wallet size={14} />}
              label="Wallet balances"
              value={circ.wallet_total}
              color="bg-white"
            />
            <CircCard
              icon={<Lock size={14} />}
              label="Orders escrow"
              value={circ.orders_escrow}
              color="bg-white"
            />
            <CircCard
              icon={<Lock size={14} />}
              label="Services escrow"
              value={circ.services_escrow}
              color="bg-white"
            />
            <CircCard
              icon={<TrendingUp size={14} />}
              label="Gains total"
              value={circ.gains_total}
              color="bg-white"
            />
            <CircCard
              icon={<Wallet size={14} />}
              label="Referral locked"
              value={circ.referral_locked}
              color="bg-white"
            />
            <CircCard
              icon={<ArrowDownToLine size={14} />}
              label="Pending withdrawals"
              value={circ.pending_withdrawals}
              color="bg-white"
            />
          </div>
        </>
      )}

      {/* Quick actions */}
      <div className="bg-white dark:bg-darkcard p-4 rounded-xl shadow-sm">
        <p className="text-[12px] font-bold text-navy dark:text-white mb-2">Quick actions</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => navigate('/admin/inbox')} className="bg-accent text-white text-[11px] font-bold py-2.5 rounded-lg">
            Open inbox
          </button>
          <button onClick={() => navigate('/admin/ledger')} className="bg-navy text-white text-[11px] font-bold py-2.5 rounded-lg">
            View ledger
          </button>
          <button onClick={() => navigate('/admin/vault')} className="bg-navy text-white text-[11px] font-bold py-2.5 rounded-lg">
            Manage vault
          </button>
          <button onClick={() => navigate('/admin/finance')} className="bg-accent text-white text-[11px] font-bold py-2.5 rounded-lg">
            View finances
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white dark:bg-darkcard p-4 rounded-xl shadow-sm">
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className="font-bold text-navy dark:text-white text-[20px] mt-1">{value}</p>
    </div>
  );
}

function CircCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className={`${color} dark:bg-darkcard p-3 rounded-xl shadow-sm`}>
      <div className="flex items-center gap-1.5 mb-1 text-gray-500">
        {icon}
        <p className="text-[9px] uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-[14px] font-black text-navy dark:text-white">
        {Number(value || 0).toLocaleString()} <span className="text-[9px] opacity-60">XAF</span>
      </p>
    </div>
  );
        }
