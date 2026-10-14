import { Save, ArrowDownToLine, ArrowUpFromLine, Smartphone, AlertCircle } from 'lucide-react';

const METHODS = [
  { key: 'mtn_momo',     label: 'MTN Mobile Money',   color: 'bg-yellow-400' },
  { key: 'orange_money', label: 'Orange Money',        color: 'bg-orange-500' },
  { key: 'airtel_money', label: 'Airtel Money',        color: 'bg-red-500'    },
  { key: 'moov_money',   label: 'Moov Money',          color: 'bg-blue-500'   },
] as const;

type Props = {
  tab: 'fees' | 'regions' | 'wallet';
  settings: Record<string, string>;
  setSetting: (k: string, v: string) => void;
  saveSetting: (k: string) => void;
  savingKey: string | null;
  regions: any[];
  walletBalance: number;
  topupAmount: string;
  setTopupAmount: (v: string) => void;
  onTopup: () => void;
  wdAmount: string;
  setWdAmount: (v: string) => void;
  wdPhone: string;
  setWdPhone: (v: string) => void;
  wdProvider: 'mtn_momo'|'orange_money'|'airtel_money'|'moov_money';
  setWdProvider: (v: any) => void;
  wdBusy: boolean;
  wdMsg: { kind: 'error' | 'success'; text: string } | null;
  onWithdraw: () => void;
};

export default function AdminFinanceExtras({
  tab, settings, setSetting, saveSetting, savingKey,
  regions, walletBalance,
  topupAmount, setTopupAmount, onTopup,
  wdAmount, setWdAmount, wdPhone, setWdPhone,
  wdProvider, setWdProvider, wdBusy, wdMsg, onWithdraw,
}: Props) {
  if (tab === 'fees') {
    return (
      <div className="space-y-3">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3 text-[10px] text-yellow-800 dark:text-yellow-200">
          Fee changes apply to <strong>new orders and purchases only</strong>. Existing escrow keeps its original fee.
        </div>
        <SettingRow label="Marketplace fee — member (%)"             value={settings.fee_pct_member || ''}       onChange={(v: string) => setSetting('fee_pct_member', v)}       onSave={() => saveSetting('fee_pct_member')}       saving={savingKey === 'fee_pct_member'}       suffix="%" />
        <SettingRow label="Marketplace fixed fee — member (XAF)"     value={settings.fee_fixed_member || ''}     onChange={(v: string) => setSetting('fee_fixed_member', v)}     onSave={() => saveSetting('fee_fixed_member')}     saving={savingKey === 'fee_fixed_member'}     suffix="XAF" />
        <SettingRow label="Marketplace fee — non-member (%)"         value={settings.fee_pct_non_member || ''}   onChange={(v: string) => setSetting('fee_pct_non_member', v)}   onSave={() => saveSetting('fee_pct_non_member')}   saving={savingKey === 'fee_pct_non_member'}   suffix="%" />
        <SettingRow label="Marketplace fixed fee — non-member (XAF)" value={settings.fee_fixed_non_member || ''} onChange={(v: string) => setSetting('fee_fixed_non_member', v)} onSave={() => saveSetting('fee_fixed_non_member')} saving={savingKey === 'fee_fixed_non_member'} suffix="XAF" />
        <SettingRow label="Referral bonus — Premium (XAF)"           value={settings.referral_l1_points || ''}   onChange={(v: string) => setSetting('referral_l1_points', v)}   onSave={() => saveSetting('referral_l1_points')}   saving={savingKey === 'referral_l1_points'}   suffix="XAF" />
        <SettingRow label="Membership price — yearly (XAF)"          value={settings.membership_fee || ''}       onChange={(v: string) => setSetting('membership_fee', v)}       onSave={() => saveSetting('membership_fee')}       saving={savingKey === 'membership_fee'}       suffix="XAF" />
        <SettingRow label="Subscription fee — yearly (XAF)"          value={settings.subscription_fee || ''}     onChange={(v: string) => setSetting('subscription_fee', v)}     onSave={() => saveSetting('subscription_fee')}     saving={savingKey === 'subscription_fee'}     suffix="XAF" />
      </div>
    );
  }

  if (tab === 'regions') {
    return (
      <div className="bg-white dark:bg-darkcard rounded-xl shadow-sm overflow-hidden">
        <div className="p-3 border-b border-gray-100 dark:border-darkline bg-gray-50 dark:bg-darkbg">
          <p className="text-[11px] font-bold text-navy dark:text-white">Active supported countries</p>
        </div>
        {regions.length === 0 && (
          <p className="p-4 text-center text-[11px] text-gray-500">No active countries.</p>
        )}
        {regions.map(r => (
          <div key={r.code} className="p-3 border-b border-gray-100 dark:border-darkline last:border-b-0">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[12px] font-bold text-navy dark:text-white">
                {r.flag_emoji || ''} {r.name}
              </p>
              <span className="text-[9px] font-bold bg-gray-100 dark:bg-darkline text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                {r.currency_code}
              </span>
            </div>
            <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
              <span>Phone prefix</span>
              <span className="font-bold text-navy dark:text-white">{r.phone_prefix}</span>
            </div>
            <div className="flex justify-between text-[10px] text-gray-500">
              <span>1 {r.currency_code}</span>
              <span className="font-bold text-navy dark:text-white">{r.currency_value_in_xaf} XAF</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-white dark:bg-darkcard p-4 rounded-xl shadow-sm">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Your admin wallet</p>
        <p className="text-2xl font-black text-navy dark:text-white">
          {walletBalance.toLocaleString()} XAF
        </p>
      </div>

      <div className="bg-white dark:bg-darkcard p-4 rounded-xl shadow-sm">
        <p className="text-[11px] font-bold text-navy dark:text-white mb-2 flex items-center gap-1.5">
          <ArrowUpFromLine size={13} className="text-accent" /> Top up
        </p>
        <p className="text-[10px] text-gray-500 mb-3">Add test funds to your admin wallet.</p>
        <input
          type="number"
          value={topupAmount}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTopupAmount(e.target.value)}
          placeholder="Amount in XAF"
          className="w-full p-3 border border-gray-200 dark:border-darkline rounded-xl bg-gray-50 dark:bg-darkbg text-[12px] mb-2"
        />
        <button
          onClick={onTopup}
          disabled={!topupAmount}
          className="w-full bg-accent text-white font-bold py-2.5 rounded-xl text-[12px] disabled:opacity-50"
        >
          Top up wallet
        </button>
      </div>

      <div className="bg-white dark:bg-darkcard p-4 rounded-xl shadow-sm">
        <p className="text-[11px] font-bold text-navy dark:text-white mb-2 flex items-center gap-1.5">
          <ArrowDownToLine size={13} className="text-red-500" /> Withdraw
        </p>
        <p className="text-[10px] text-gray-500 mb-3">Withdraw from your admin wallet to MoMo. Minimum 1,000 XAF.</p>

        <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">Amount (XAF)</label>
        <input
          type="number"
          value={wdAmount}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWdAmount(e.target.value)}
          placeholder="Amount"
          className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-[12px] mb-2"
        />

        <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 flex items-center gap-1">
          <Smartphone size={11} /> MoMo Number
        </label>
        <input
          type="tel"
          value={wdPhone}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWdPhone(e.target.value.replace(/\D/g, ''))}
          placeholder="6XX XXX XXX"
          className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-[12px] mb-2"
        />

        <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">Provider</label>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {METHODS.map(m => (
            <button
              key={m.key}
              onClick={() => setWdProvider(m.key as any)}
              className={`p-2.5 rounded-lg border-2 text-[10px] font-bold flex items-center gap-2 ${
                wdProvider === m.key
                  ? 'border-accent bg-accent/5 text-accent'
                  : 'border-gray-200 dark:border-darkline text-navy dark:text-white'
              }`}
            >
              <div className={`w-5 h-5 rounded ${m.color}`} />
              {m.label.split(' ')[0]}
            </button>
          ))}
        </div>

        {wdMsg && (
          <div className={`mb-3 p-2 rounded-lg text-[11px] flex items-start gap-2 ${
            wdMsg.kind === 'error'
              ? 'bg-red-50 border border-red-200 text-red-600'
              : 'bg-green-50 border border-green-200 text-green-700'
          }`}>
            <AlertCircle size={12} className="shrink-0 mt-0.5" />
            {wdMsg.text}
          </div>
        )}

        <button
          onClick={onWithdraw}
          disabled={wdBusy || !wdAmount || !wdPhone}
          className="w-full bg-red-500 text-white font-bold py-2.5 rounded-xl text-[12px] disabled:opacity-50"
        >
          {wdBusy ? 'Processing...' : 'Request withdrawal'}
        </button>
      </div>
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
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          className="flex-1 p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-[12px]"
        />
        {suffix && <span className="self-center text-[10px] font-bold text-gray-400">{suffix}</span>}
        <button
          onClick={onSave}
          disabled={saving}
          className="bg-accent text-white font-bold px-3 rounded-lg text-[11px] flex items-center gap-1 disabled:opacity-50"
        >
          <Save size={12} /> {saving ? '...' : 'Save'}
        </button>
      </div>
    </div>
  );
        }
