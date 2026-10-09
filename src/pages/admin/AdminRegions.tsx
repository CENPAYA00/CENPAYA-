import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { RegionalMarketConfiguration } from '../../types/RegionalMarketConfiguration';

export default function AdminRegions() {
  const [configs, setConfigs] = useState<RegionalMarketConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('regional_market_configurations')
        .select('*')
        .order('country_iso');
      if (data) setConfigs(data as RegionalMarketConfiguration[]);
      setLoading(false);
    };
    fetch();
  }, []);

  const toggleOperational = async (countryIso: string, current: boolean) => {
    await supabase
      .from('regional_market_configurations')
      .update({ is_operational: !current, updated_at: new Date().toISOString() })
      .eq('country_iso', countryIso);

    setConfigs(configs.map(c =>
      c.country_iso === countryIso ? { ...c, is_operational: !current } : c
    ));
  };

  if (loading) return <div className="p-4 text-center">Loading...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-navy mb-4">🌍 Regional Markets</h2>
      <p className="text-sm text-gray-500 mb-4">
        Control the platform fees and operational status for each CEMAC country.
      </p>

      {configs.map(config => (
        <div key={config.country_iso} className="bg-white p-4 rounded-xl shadow-sm mb-3">
          <div className="flex justify-between items-center mb-3">
            <div>
              <p className="font-bold text-navy text-lg">{config.country_iso}</p>
              <p className="text-xs text-gray-500">Currency: {config.currency_code}</p>
            </div>
            <button
              onClick={() => toggleOperational(config.country_iso, config.is_operational)}
              className={`text-xs font-bold px-3 py-1 rounded-full ${
                config.is_operational ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}
            >
              {config.is_operational ? 'Operational' : 'Offline'}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-gray-50 p-2 rounded-lg">
              <p className="text-gray-500">Base Fee</p>
              <p className="font-bold text-navy">{config.base_marketplace_fee_pct}%</p>
            </div>
            <div className="bg-gray-50 p-2 rounded-lg">
              <p className="text-gray-500">Premium Fee</p>
              <p className="font-bold text-gold">{config.premium_subscriber_fee_pct}%</p>
            </div>
            <div className="bg-gray-50 p-2 rounded-lg">
              <p className="text-gray-500">Withdrawal</p>
              <p className="font-bold text-navy">{config.withdrawal_fee_pct}%</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}