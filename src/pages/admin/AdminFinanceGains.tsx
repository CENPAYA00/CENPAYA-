import { ArrowDownToLine } from 'lucide-react';

type Props = {
  gains: any[];
  gainsInfo: any;
  breakdown: any;
  withdrawAmount: string;
  setWithdrawAmount: (v: string) => void;
  withdrawing: boolean;
  onWithdrawGains: () => void;
};

export default function AdminFinanceGains({
  gains, gainsInfo, breakdown,
  withdrawAmount, setWithdrawAmount, withdrawing, onWithdrawGains,
}: Props) {
  return (
    <>
      {gainsInfo && (
        <div className="bg-gradient-to-br from-accent to-accent-dark text-white rounded-xl p-4 mb-3 shadow-sm">
          <p className="text-[10px] uppercase tracking-wider opacity-80">Available platform gains</p>
          <p className="text-2xl font-black mt-1">{Number(gainsInfo.available).toLocaleString()} XAF</p>
          <div className="flex justify-between text-[10px] opacity-80 mt-2">
            <span>Earned: {Number(gainsInfo.total_earned).toLocaleString()}</span>
            <span>Withdrawn: {Number(gainsInfo.total_withdrawn).toLocaleString()}</span>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-darkcard p-3 rounded-xl shadow-sm mb-3">
        <p className="text-[11px] font-bold text-navy dark:text-white mb-2">Move gains to your wallet</p>
        <div className="flex gap-2">
          <input
            type="number"
            value={withdrawAmount}
            onChange={e => setWithdrawAmount(e.target.value)}
            placeholder="Amount"
            className="flex-1 p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-[12px]"
          />
          <button
            onClick={onWithdrawGains}
            disabled={withdrawing || !withdrawAmount}
            className="bg-accent text-white font-bold px-3 rounded-lg text-[11px] flex items-center gap-1 disabled:opacity-50"
          >
            <ArrowDownToLine size={12} /> {withdrawing ? '...' : 'Move'}
          </button>
        </div>
        <p className="text-[9px] text-gray-400 mt-1.5">Moves platform gains into your admin wallet.</p>
      </div>

      {breakdown && (
        <div className="bg-white dark:bg-darkcard rounded-xl shadow-sm mb-3 overflow-hidden">
          <p className="p-3 text-[11px] font-bold text-navy dark:text-white border-b border-gray-100 dark:border-darkline">
            Gains breakdown
          </p>
          {[
            { k: 'marketplace_fee',  label: 'Marketplace fees' },
            { k: 'boost_fee',        label: 'Boost fees' },
            { k: 'withdrawal_fee',   label: 'Withdrawal fees' },
            { k: 'subscription_fee', label: 'Subscription fees' },
          ].map(({ k, label }) => (
            <div key={k} className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-darkline last:border-b-0">
              <span className="text-[11px] text-gray-600 dark:text-gray-300">{label}</span>
              <div className="text-right">
                <p className="text-[11px] font-bold text-navy dark:text-white">
                  {Number(breakdown[k]?.total || 0).toLocaleString()} XAF
                </p>
                <p className="text-[9px] text-gray-400">{breakdown[k]?.count || 0} events</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white dark:bg-darkcard rounded-xl shadow-sm overflow-hidden">
        {gains.length === 0 && (
          <p className="p-4 text-center text-[11px] text-gray-500">No gains yet.</p>
        )}
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
    </>
  );
}
