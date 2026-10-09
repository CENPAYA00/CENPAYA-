import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalListings: 0,
    totalOrders: 0,
    platformGains: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const [users, listings, orders, gains] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true }),
        supabase.from('listings').select('id', { count: 'exact', head: true }),
        supabase.from('orders').select('id', { count: 'exact', head: true }),
        supabase.from('system_gains').select('amount_earned'),
      ]);

      const totalGains = (gains.data || []).reduce((sum, g: any) => sum + (g.amount_earned || 0), 0);

      setStats({
        totalUsers: users.count || 0,
        totalListings: listings.count || 0,
        totalOrders: orders.count || 0,
        platformGains: totalGains,
      });
      setLoading(false);
    };
    fetchStats();
  }, []);

  if (loading) return <div className="p-4 text-center">Loading stats...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-navy mb-4">Platform Overview</h2>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <p className="text-xs text-gray-500">Total Users</p>
          <p className="font-bold text-navy text-2xl">{stats.totalUsers}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <p className="text-xs text-gray-500">Active Listings</p>
          <p className="font-bold text-navy text-2xl">{stats.totalListings}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <p className="text-xs text-gray-500">Total Orders</p>
          <p className="font-bold text-navy text-2xl">{stats.totalOrders}</p>
        </div>
        <div className="bg-gold p-4 rounded-xl shadow-sm">
          <p className="text-xs text-navy">Platform Gains</p>
          <p className="font-bold text-navy text-2xl">{stats.platformGains.toLocaleString()} XAF</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm">
        <p className="font-bold text-navy mb-2">Quick Actions</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => window.location.href = '/admin/vault'} className="bg-navy text-white text-sm font-bold py-2 rounded-lg">Manage Vault</button>
          <button onClick={() => window.location.href = '/admin/finance'} className="bg-gold text-navy text-sm font-bold py-2 rounded-lg">View Gains</button>
        </div>
      </div>
    </div>
  );
}