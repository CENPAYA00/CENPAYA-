import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function AdminFinance() {
  const [gains, setGains] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [marketplaceFees, setMarketplaceFees] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'gains' | 'fees'>('gains');

  useEffect(() => {
    const fetchData = async () => {
      const [gainsRes, feesRes] = await Promise.all([
        supabase.from('system_gains').select('*').order('processed_at', { ascending: false }).limit(50),
        supabase.from('regional_market_configurations').select('*').order('country_iso'),
      ]);

      if (gainsRes.data) {
        setGains(gainsRes.data);
        setTotal(gainsRes.data.reduce((s: number, g: any) => s + (g.amount_earned || 0), 0));
      }
      if (feesRes.data) setMarketplaceFees(feesRes.data);
    };
    fetchData();
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold text-navy mb-4">💰 Platform Finance</h2>

      <div className="bg-gold p-4 rounded-xl shadow-sm mb-4">
        <p className="text-sm text-navy">Total Platform Gains</p>
        <p className="text-3xl font-bold text-navy">{total.toLocaleString()} XAF</p>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('gains')}
          className={`flex-1 py-2 rounded-xl font-bold text-sm ${activeTab === 'gains' ? 'bg-navy text-white' : 'bg-white text-navy'}`}
        >
          Recent Gains
        </button>
        <button
          onClick={() => setActiveTab('fees')}
          className={`flex-1 py-2 rounded-xl font-bold text-sm ${activeTab === 'fees' ? 'bg-navy text-white' : 'bg-white text-navy'}`}
        >
          Marketplace Fees
        </button>
      </div>

      {activeTab === 'gains' && (
        <div className="bg-white rounded-xl shadow-sm">
          {gains.length === 0 && <p className="p-4 text-center text-gray-500">No gains yet.</p>}
          {gains.map((g) => (
            <div key={g.id} className="p-4 border-b last:border-b-0 flex justify-between">
              <span className="text-sm text-gray-600">{g.source_type}</span>
              <span className="font-bold text-navy">{g.amount_earned.toLocaleString()} XAF</span>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'fees' && (
        <div className="bg-white rounded-xl shadow-sm">
          <div className="p-4 border-b bg-gray-50">
            <p className="text-xs font-bold text-navy">Current Marketplace Fee Rules</p>
            <p className="text-xs text-gray-500">Members: 3% + 25 XAF • Non-members: 5% + 50 XAF</p>
          </div>
          {marketplaceFees.map((f) => (
            <div key={f.country_iso} className="p-4 border-b last:border-b-0">
              <p className="font-bold text-navy">{f.country_iso}</p>
              <p className="text-xs text-gray-500 mt-1">
                Members: <strong className="text-navy">{f.premium_subscriber_fee_pct}% + 25 XAF</strong>
              </p>
              <p className="text-xs text-gray-500">
                Non-Members: <strong className="text-navy">{f.base_marketplace_fee_pct}% + 50 XAF</strong>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}