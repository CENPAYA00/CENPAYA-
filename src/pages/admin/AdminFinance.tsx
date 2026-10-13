import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { TrendingUp, Wallet, Settings as Cog, Save, Globe } from 'lucide-react';

export default function AdminFinance() {
  const [gains, setGains] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [regions, setRegions] = useState<any[]>([]);
  const [tab, setTab] = useState<'gains' | 'fees' | 'regions' | 'wallet'>('gains');
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [topupAmount, setTopupAmount] = useState('');

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    const [gainsRes, settingsRes, regionsRes, walletRes] = await Promise.all([
      supabase.from('system_gains').select('*').order('processed_at', { ascending: false }).limit(100),
      supabase.from('app_settings').select('key, value'),
      supabase.from('regional_market_configurations').select('*').order('country_iso'),
      user ? supabase.from('wallets').select('available_funds').eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
    ]);

    if (gainsRes.data) {
      setGains(gainsRes.data);
      setTotal(gainsRes.data.reduce((s: number, g: any) => s + (g.amount_earned || 0), 0));
    }
    const map: Record<string, string> = {};
    (settingsRes.data || []).forEach((r: any) => { map[r.key] = r.value; });
    setSettings(map);
    setRegions(regionsRes.data || []);
    setWalletBalance((walletRes as any)?.data?.available_funds || 0);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setSetting = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const saveSetting = async (key: string) => {
    const value = settings[key];
    if (value === undefined) return;
    setSavingKey(key);
    const { error } = await supabase.rpc('admin_set_app_setting', {
      p_key: key,
      p_value: String(value),
    });
    if (error) alert(error.message);
    else alert('Saved. Applies to new orders/purchases only.');
    setSavingKey(null);
  };

  const topupMyWallet = async () => {
    const amt = Number(topupAmount);
    if (!amt || amt <= 0) return alert('Enter a valid amount.');
    if (!window.confirm(`Top up your wallet by ${amt.toLocaleString()} XAF?`)) return;
    const { data, error } = await supabase.rpc('admin_topup_my_wallet', {
      p_amount: amt,
      p_reason: 'admin self topup',
    });
    if (error || !data?.ok) {
      alert(error?.message || data?.error || 'Top-up failed');
      return;
    }
    alert(`Wallet topped up. New balance: ${data.new_balance.toLocaleString()} XAF`);
    setTopupAmount('');
    load();
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-navy dark:text-white mb-2">💰 Platform Finance</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Gains, fees, regions, and wallet.</p>

      <div className="bg-gradient-to-br from-brand to-brand-dark p-4 rounded-xl shadow-sm mb-4 text-white">
        <p className="text-[10px] uppercase tracking-wider opacity-80">Total Platform Gains</p>
        <p className="text-2xl font-black mt-1">{total.toLocaleString()} XAF</p>
      </div>

      {/* Tabs — 4 now */}
      <div className="flex bg-white dark:bg-darkcard rounded-xl shadow-sm mb-4 overflow-hidden overflow-x-auto scrollbar-hide">
        {[
          { k: 'gains',   label: 'Gains',   icon: <TrendingUp size={12} /> },
          { k: 'fees',    label: 'Fees',    icon: <Cog size={12} /> },
          { k: 'regions', label: 'Regions', icon: <Globe size={12} /> },
          { k: 'wallet',  label: 'Wallet',  icon: <Wallet size={12} /> },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => setTab(t.k as any)}
            className={`flex-1 py-2.5 px-2 text-[10px] font-bold flex items-center justify-center gap-1 whitespace-nowrap ${
              tab === t.k ? 'bg-navy dark:bg-accent text-white' : 'text-gray-500'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Gains */}
      {tab === 'gains' && (
        <div className="bg-white dark:bg-darkcard rounded-xl shadow-sm overflow-hidden">
          {gains.length === 0 && <p className="p-4 text-center text-[11px] text-gray-500">No gains yet.</p>}
          {gains.map(g => (
            <div key={g.id} className="p-3 border-b border-gray-100 dark:border-darkline last:border-b-0 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-navy dark:text-white capitalize">
                  {String(g.source_type || '').replace(/_/g, ' ')}
                </p>
                <p className="text-[9px] text-gray-400">
                  {g.processed_at ? new Date(g.processed_at).toLocaleString() : ''}
                </p>
              </div>
              <p className="text-[12px] font-bold text-accent">
                +{Number(g.amount_earned || 0).toLocaleString()} XAF
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Global fees */}
      {tab === 'fees' && (
        <div className="space-y-3">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3 text-[10px] text-yellow-800 dark:text-yellow-200">
            Fee changes apply to <strong>new orders and purchases only</strong>. Existing escrow keeps its original fee.
          </div>

          <SettingRow
            label="Marketplace fee — member (%)"
            value={settings.fee_pct_member || ''}
            onChange={v => setSetting('fee_pct_member', v)}
            onSave={() => saveSetting('fee_pct_member')}
            saving={savingKey === 'fee_pct_member'}
            suffix="%"
          />
          <SettingRow
            label="Marketplace fixed fee — member (XAF)"
            value={settings.fee_fixed_member || ''}
            onChange={v => setSetting('fee_fixed_member', v)}
            onSave={() => saveSetting('fee_fixed_member')}
            saving={savingKey === 'fee_fixed_member'}
            suffix="XAF"
          />
          <SettingRow
            label="Marketplace fee — non-member (%)"
            value={settings.fee_pct_non_member || ''}
            onChange={v => setSetting('fee_pct_non_member', v)}
            onSave={() => saveSetting('fee_pct_non_member')}
            saving={savingKey === 'fee_pct_non_member'}
            suffix="%"
          />
          <SettingRow
            label="Marketplace fixed fee — non-member (XAF)"
            value={settings.fee_fixed_non_member || ''}
            onChange={v => setSetting('fee_fixed_non_member', v)}
            onSave={() => saveSetting('fee_fixed_non_member')}
            saving={savingKey === 'fee_fixed_non_member'}
            suffix="XAF"
          />
          <SettingRow
            label="Referral bonus per subscriber (XAF)"
            value={settings.referral_l1_points || ''}
            onChange={v => setSetting('referral_l1_points', v)}
            onSave={() => saveSetting('referral_l1_points')}
            saving={savingKey === 'referral_l1_points'}
            suffix="XAF"
          />
          <SettingRow
            label="Membership price — yearly (XAF)"
            value={settings.membership_fee || ''}
            onChange={v => setSetting('membership_fee', v)}
            onSave={() => saveSetting('membership_fee')}
            saving={savingKey === 'membership_fee'}
            suffix="XAF"
          />
          <SettingRow
            label="Subscription fee — yearly (XAF)"
            value={settings.subscription_fee || ''}
            onChange={v => setSetting('subscription_fee', v)}
            onSave={() => saveSetting('subscription_fee')}
            saving={savingKey === 'subscription_fee'}
            suffix="XAF"
          />
        </div>
      )}

      {/* Per-country fees — kept from the original file */}
      {tab === 'regions' && (
        <div className="bg-white dark:bg-darkcard rounded-xl shadow-sm overflow-hidden">
          <div className="p-3 border-b border-gray-100 dark:border-darkline bg-gray-50 dark:bg-darkbg">
            <p className="text-[11px] font-bold text-navy dark:text-white">Regional marketplace rules</p>
            <p className="text-[10px] text-gray-500">
              Each country can have its own fee percentages.
            </p>
          </div>

          {regions.length === 0 && (
            <p className="p-4 text-center text-[11px] text-gray-500">No regional configurations.</p>
          )}

          {regions.map(r => (
            <div key={r.country_iso} className="p-3 border-b border-gray-100 dark:border-darkline last:border-b-0">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[12px] font-bold text-navy dark:text-white">{r.country_iso}</p>
                {r.currency_code && (
                  <span className="text-[9px] font-bold bg-gray-100 dark:bg-darkline text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                    {r.currency_code}
                  </span>
                )}
              </div>
              <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
                <span>Members</span>
                <span className="font-bold text-navy dark:text-white">
                  {r.premium_subscriber_fee_pct}% + 25 XAF
                </span>
              </div>
              <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
                <span>Non-members</span>
                <span className="font-bold text-navy dark:text-white">
                  {r.base_marketplace_fee_pct}% + 50 XAF
                </span>
              </div>
              <div className="flex justify-between text-[10px] text-gray-500">
                <span>Withdrawal</span>
                <span className="font-bold text-navy dark:text-white">
                  {r.withdrawal_fee_pct}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Wallet */}
      {tab === 'wallet' && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-darkcard p-4 rounded-xl shadow-sm">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Your admin wallet</p>
            <p className="text-2xl font-black text-navy dark:text-white">
              {walletBalance.toLocaleString()} XAF
            </p>
          </div>

          <div className="bg-white dark:bg-darkcard p-4 rounded-xl shadow-sm">
            <p className="text-[11px] font-bold text-navy dark:text-white mb-2">Top up your own wallet</p>
            <p className="text-[10px] text-gray-500 mb-3">
              Add funds to your admin wallet for testing or operational use.
            </p>
            <input
              type="number"
              value={topupAmount}
              onChange={e => setTopupAmount(e.target.value)}
              placeholder="Amount in XAF"
              className="w-full p-3 border border-gray-200 dark:border-darkline rounded-xl bg-gray-50 dark:bg-darkbg text-[12px] mb-2"
            />
            <button
              onClick={topupMyWallet}
              disabled={!topupAmount}
              className="w-full bg-accent text-white font-bold py-2.5 rounded-xl text-[12px] disabled:opacity-50"
            >
              Top up wallet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingRow({
  label, value, onChange, onSave, saving, suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  suffix?: string;
}) {
  return (
    <div className="bg-white dark:bg-darkcard p-3 rounded-xl shadow-sm">
      <p className="text-[11px] font-bold text-navy dark:text-white mb-1.5">{label}</p>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-[12px]"
        />
        {suffix && <span className="self-center text-[10px] font-bold text-gray-400">{suffix}</span>}
        <button
          onClick={onSave}
          disabled={saving}
          className="bg-accent text-white font-bold px-3 rounded-lg text-[11px] flex items-center gap-1 disabled:opacity-50"
        >
          <Save size={12} /> {saving ? '…' : 'Save'}
        </button>
      </div>
    </div>
  );
                                     }
