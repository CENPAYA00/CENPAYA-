import { useEffect, useState } from 'react';
import { supabaseWorkerRequest } from '../../lib/supabaseWorkerApi';
import { d1Request } from '../../lib/d1Api';
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
    const [gainsRes, settingsRes, regionsRes, walletRes, financeRes, userRes] = await Promise.all([
      supabaseWorkerRequest<{ data: any[] }>('/api/v1/admin/gains'),
      supabaseWorkerRequest<{ data: Array<{ key: string; value: string }> }>('/api/v1/admin/settings'),
      supabaseWorkerRequest<{ data: any[] }>('/api/v1/admin/regions'),
      supabaseWorkerRequest<{ data: { available_funds?: number } | null }>('/api/v1/wallet'),
      supabaseWorkerRequest<{ data: { available_gains?: any; gains_breakdown?: any } }>('/api/v1/admin/finance'),
      d1Request<{ data: { momo_number?: string; momo_provider?: string } }>('/api/me/personal-details').catch(() => ({ data: null })),
    ]);

    if (gainsRes.data) {
      setGains(gainsRes.data);
      setTotal(gainsRes.data.reduce((sum: number, gain: any) => sum + (gain.amount_earned || 0), 0));
    }
    const map: Record<string, string> = {};
    (settingsRes.data || []).forEach((r: any) => { map[r.key] = r.value; });
    setSettings(map);
    setRegions(regionsRes.data || []);
    setWalletBalance(walletRes.data?.available_funds || 0);
    if (financeRes.data?.available_gains?.ok) setGainsInfo(financeRes.data.available_gains);
    if (financeRes.data?.gains_breakdown?.ok) setBreakdown(financeRes.data.gains_breakdown.breakdown);
    if (userRes.data?.momo_number) setWdPhone(userRes.data.momo_number.replace(/^\+\d+\s?/, ''));
    if (userRes.data?.momo_provider) setWdProvider(userRes.data.momo_provider as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setSetting = (key: string, value: string) => setSettings(prev => ({ ...prev, [key]: value }));

  const saveSetting = async (key: string) => {
    const value = settings[key];
    if (value === undefined) return;
    setSavingKey(key);
    try {
      await supabaseWorkerRequest(`/api/v1/admin/settings/${encodeURIComponent(key)}`, { method: 'POST', body: JSON.stringify({ value: String(value) }) });
      alert('Saved. Applies to new orders/purchases only.');
    } catch (error: unknown) { alert(error instanceof Error ? error.message : 'Could not save setting.'); }
    setSavingKey(null);
  };

  const topupMyWallet = async () => {
    const amt = Number(topupAmount);
    if (!amt || amt <= 0) return alert('Enter a valid amount.');
    if (!window.confirm(`Top up your wallet by ${amt.toLocaleString()} XAF?`)) return;
    try {
      const result = await supabaseWorkerRequest<{ data: { ok?: boolean; new_balance?: number; error?: string } }>('/api/v1/admin/wallet/topup', { method: 'POST', body: JSON.stringify({ amount: amt, reason: 'admin self topup' }) });
      if (!result.data?.ok) return alert(result.data?.error || 'Top-up failed');
      alert(`New balance: ${Number(result.data.new_balance || 0).toLocaleString()} XAF`);
    } catch (error: unknown) { return alert(error instanceof Error ? error.message : 'Top-up failed'); }
    setTopupAmount('');
    load();
  };

  const withdrawGains = async () => {
    const amt = Number(withdrawAmount);
    if (!amt || amt <= 0) return alert('Enter a valid amount.');
    if (amt > (gainsInfo?.available || 0)) return alert('Exceeds available gains.');
    if (!window.confirm(`Move ${amt.toLocaleString()} XAF from platform gains into your admin wallet?`)) return;
    setWithdrawing(true);
    try {
      const result = await supabaseWorkerRequest<{ data: { ok?: boolean; new_wallet_balance?: number; error?: string } }>('/api/v1/admin/gains/withdraw-to-wallet', { method: 'POST', body: JSON.stringify({ amount: amt }) });
      if (!result.data?.ok) alert(result.data?.error || 'Withdrawal failed');
      else { alert(`New wallet balance: ${Number(result.data.new_wallet_balance || 0).toLocaleString()} XAF`); setWithdrawAmount(''); load(); }
    } catch (error: unknown) { alert(error instanceof Error ? error.message : 'Withdrawal failed'); }
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
    try {
      await supabaseWorkerRequest('/api/v1/admin/wallet/withdraw', { method: 'POST', body: JSON.stringify({ amount: amt, momo_number: wdPhone.trim(), provider: wdProvider }) });
      setWdMsg({ kind: 'success', text: `Withdrawal requested: ${amt.toLocaleString()} XAF` }); setWdAmount(''); load();
    } catch (error: unknown) { setWdMsg({ kind: 'error', text: error instanceof Error ? error.message : 'Withdrawal failed.' }); }
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
