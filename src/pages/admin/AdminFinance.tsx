import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { TrendingUp, Wallet, Settings as Cog, Globe } from 'lucide-react';
import AdminFinanceGains from './AdminFinanceGains';
import AdminFinanceExtras from './AdminFinanceExtras';

export default function AdminFinance() {
  const [gains, setGains] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [regions, setRegions] = useState<any[]>([]);
  const [gainsInfo, setGainsInfo] = useState<any>(null);
  const [breakdown, setBreakdown] = useState<any>(null);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [tab, setTab] = useState<'gains' | 'fees' | 'regions' | 'wallet'>('gains');
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [topupAmount, setTopupAmount] = useState('');
  const [wdAmount, setWdAmount] = useState('');
  const [wdPhone, setWdPhone] = useState('');
  const [wdProvider, setWdProvider] = useState<'mtn_momo'|'orange_money'|'airtel_money'|'moov_money'>('mtn_momo');
  const [wdBusy, setWdBusy] = useState(false);
  const [wdMsg, setWdMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    const [gainsRes, settingsRes, regionsRes, walletRes, gainsInfoRes, breakdownRes, userRes] = await Promise.all([
      supabase.from('system_gains').select('*').order('processed_at', { ascending: false }).limit(100),
      supabase.from('app_settings').select('key, value'),
      supabase.from('supported_countries').select('*').eq('is_active', true).order('name'),
      user ? supabase.from('wallets').select('available_funds').eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.rpc('admin_available_gains'),
      supabase.rpc('admin_gains_breakdown'),
      user ? supabase.from('users').select('momo_number, momo_provider').eq('id', user.id).maybeSingle() : Promise.resolve({ data: null }),
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
    if (gainsInfoRes.data?.ok) setGainsInfo(gainsInfoRes.data);
    if (breakdownRes.data?.ok) setBreakdown(breakdownRes.data.breakdown);
    if ((userRes as any)?.data?.momo_number) setWdPhone((userRes as any).data.momo_number.replace(/^\+\d+\s?/, ''));
    if ((userRes as any)?.data?.momo_provider) setWdProvider((userRes as any).data.momo_provider);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setSetting = (key: string, value: string) => setSettings(prev => ({ ...prev, [key]: value }));

  const saveSetting = async (key: string) => {
    const value = settings[key];
    if (value === undefined) return;
    setSavingKey(key);
    const { error } = await supabase.rpc('admin_set_app_setting', { p_key: key, p_value: String(value) });
    if (error) alert(error.message);
    else alert('Saved. Applies to new orders/purchases only.');
    setSavingKey(null);
  };

  const topupMyWallet = async () => {
    const amt = Number(topupAmount);
    if (!amt || amt <= 0) return alert('Enter a valid amount.');
    if (!window.confirm(`Top up your wallet by ${amt.toLocaleString()} XAF?`)) return;
    const { data, error } = await supabase.rpc('admin_topup_my_wallet', { p_amount: amt, p_reason: 'admin self topup' });
    if (error || !data?.ok) return alert(error?.message || data?.error || 'Top-up failed');
    alert(`New balance: ${data.new_balance.toLocaleString()} XAF`);
    setTopupAmount('');
    load();
  };

  const withdrawGains = async () => {
    const amt = Number(withdrawAmount);
    if (!amt || amt <= 0) return alert('Enter a valid amount.');
    if (amt > (gainsInfo?.available || 0)) return alert('Exceeds available gains.');
    if (!window.confirm(`Move ${amt.toLocaleString()} XAF from platform gains into your admin wallet?`)) return;
    setWithdrawing(true);
    const { data, error } = await supabase.rpc('admin_withdraw_gains_to_wallet', { p_amount: amt });
    if (error || !data?.ok) alert(error?.message || data?.error || 'Withdrawal failed');
    else { alert(`New wallet balance: ${data.new_wallet_balance.toLocaleString()} XAF`); setWithdrawAmount(''); load(); }
    setWithdrawing(false);
  };

  const withdrawFromWallet = async () => {
    setWdMsg(null);
    const amt = Number(wdAmount);
    if (!amt || amt <= 0) { setWdMsg({ kind: 'error', text: 'Enter a valid amount.' }); return; }
    if (amt < 1000) { setWdMsg({ kind: 'error', text: 'Minimum is 1,000 XAF.' }); return; }
    if (amt > walletBalance) { setWdMsg({ kind: 'error', text: 'Amount exceeds wallet balance.' }); return; }
    if (!wdPhone || wdPhone.trim().length < 6) { setWdMsg({ kind: 'error', text: 'Enter a valid MoMo number.' }); return; }
    setWdBusy(true);
    const { data, error } = await supabase.rpc('admin_withdraw_from_my_wallet', {
      p_amount: amt,
      p_momo_number: wdPhone.trim(),
      p_provider: wdProvider,
    });
    if (error || !data?.ok) setWdMsg({ kind: 'error', text: error?.message || data?.error || 'Withdrawal failed.' });
    else { setWdMsg({ kind: 'success', text: `Withdrawal requested: ${amt.toLocaleString()} XAF` }); setWdAmount(''); load(); }
    setWdBusy(false);
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-navy dark:text-white mb-2">Platform Finance</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Gains, fees, regions, and wallet.</p>

      <div className="bg-gradient-to-br from-brand to-brand-dark p-4 rounded-xl shadow-sm mb-4 text-white">
        <p className="text-[10px] uppercase tracking-wider opacity-80">Total Platform Gains</p>
        <p className="text-2xl font-black mt-1">{total.toLocaleString()} XAF</p>
      </div>

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

      {tab === 'gains' && (
        <AdminFinanceGains
          gains={gains}
          gainsInfo={gainsInfo}
          breakdown={breakdown}
          withdrawAmount={withdrawAmount}
          setWithdrawAmount={setWithdrawAmount}
          withdrawing={withdrawing}
          onWithdrawGains={withdrawGains}
        />
      )}

      {(tab === 'fees' || tab === 'regions' || tab === 'wallet') && (
        <AdminFinanceExtras
          tab={tab}
          settings={settings}
          setSetting={setSetting}
          saveSetting={saveSetting}
          savingKey={savingKey}
          regions={regions}
          walletBalance={walletBalance}
          topupAmount={topupAmount}
          setTopupAmount={setTopupAmount}
          onTopup={topupMyWallet}
          wdAmount={wdAmount}
          setWdAmount={setWdAmount}
          wdPhone={wdPhone}
          setWdPhone={setWdPhone}
          wdProvider={wdProvider}
          setWdProvider={setWdProvider}
          wdBusy={wdBusy}
          wdMsg={wdMsg}
          onWithdraw={withdrawFromWallet}
        />
      )}
    </div>
  );
    }
