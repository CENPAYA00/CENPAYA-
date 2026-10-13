import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';

export default function AdminLedger() {
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all' | 'CASH_IN' | 'CASH_OUT'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_list_ledger', {
      p_limit: 200,
      p_offset: 0,
      p_flow: filter === 'all' ? null : filter,
    });
    if (error) console.error(error);
    setRows(data?.ledger || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const filtered = rows.filter(r =>
    !search.trim() ||
    (r.operator_reference || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.username || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalIn = rows.filter(r => r.flow_direction === 'CASH_IN' && r.status === 'completed')
    .reduce((s, r) => s + Number(r.gross_amount || 0), 0);
  const totalOut = rows.filter(r => r.flow_direction === 'CASH_OUT' && r.status === 'completed')
    .reduce((s, r) => s + Number(r.gross_amount || 0), 0);
  const totalFees = rows.reduce((s, r) => s + Number(r.system_fee_cut || 0), 0);

  return (
    <div>
      <h2 className="text-2xl font-bold text-navy dark:text-white mb-2">📒 Transaction Ledger</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">All cash-in and cash-out activity.</p>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-white dark:bg-darkcard p-3 rounded-xl shadow-sm">
          <p className="text-[9px] text-gray-500 uppercase tracking-wider">Cash In</p>
          <p className="text-[14px] font-bold text-accent">{totalIn.toLocaleString()}</p>
        </div>
        <div className="bg-white dark:bg-darkcard p-3 rounded-xl shadow-sm">
          <p className="text-[9px] text-gray-500 uppercase tracking-wider">Cash Out</p>
          <p className="text-[14px] font-bold text-red-500">{totalOut.toLocaleString()}</p>
        </div>
        <div className="bg-white dark:bg-darkcard p-3 rounded-xl shadow-sm">
          <p className="text-[9px] text-gray-500 uppercase tracking-wider">Fees</p>
          <p className="text-[14px] font-bold text-navy dark:text-white">{totalFees.toLocaleString()}</p>
        </div>
      </div>

      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          placeholder="Search by reference or username..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-3 py-3 border border-gray-200 dark:border-darkline rounded-xl bg-white dark:bg-darkcard text-[12px]"
        />
      </div>

      <div className="flex gap-1.5 mb-3">
        {(['all', 'CASH_IN', 'CASH_OUT'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-[10px] font-bold px-3 py-1.5 rounded-full ${
              filter === f
                ? 'bg-navy dark:bg-accent text-white'
                : 'bg-white dark:bg-darkcard text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-darkline'
            }`}
          >
            {f === 'all' ? 'All' : f === 'CASH_IN' ? 'Cash In' : 'Cash Out'}
          </button>
        ))}
      </div>

      {loading && <p className="text-center text-xs text-gray-500 py-6">Loading...</p>}

      {!loading && filtered.length === 0 && (
        <div className="bg-white dark:bg-darkcard p-6 rounded-xl text-center shadow-sm">
          <p className="text-[12px] text-gray-500">No transactions yet.</p>
        </div>
      )}

      {filtered.map(r => (
        <div key={r.id} className="bg-white dark:bg-darkcard p-3 rounded-xl shadow-sm mb-2">
          <div className="flex items-center gap-2 mb-1">
            {r.flow_direction === 'CASH_IN' ? (
              <ArrowDownCircle size={14} className="text-accent" />
            ) : (
              <ArrowUpCircle size={14} className="text-red-500" />
            )}
            <p className="text-[12px] font-bold text-navy dark:text-white flex-1 truncate">
              {r.flow_direction === 'CASH_IN' ? 'Cash In' : 'Cash Out'} · @{r.username || '?'}
            </p>
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
              r.status === 'completed' ? 'bg-green-100 text-green-700' :
              r.status === 'failed' ? 'bg-red-100 text-red-700' :
              r.status === 'reversed' ? 'bg-gray-100 text-gray-700' :
              'bg-yellow-100 text-yellow-700'
            }`}>
              {r.status}
            </span>
          </div>
          <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
            <span>Amount</span>
            <span className="font-bold text-navy dark:text-white">
              {Number(r.gross_amount || 0).toLocaleString()} {r.currency_code}
            </span>
          </div>
          {Number(r.system_fee_cut || 0) > 0 && (
            <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
              <span>Fee</span>
              <span className="font-bold">{Number(r.system_fee_cut).toLocaleString()} {r.currency_code}</span>
            </div>
          )}
          <div className="flex justify-between text-[10px] text-gray-500">
            <span>Reference</span>
            <span className="font-mono text-navy dark:text-white truncate max-w-[140px]">{r.operator_reference}</span>
          </div>
          <p className="text-[9px] text-gray-400 mt-1">
            {r.gateway ? `${r.gateway} · ` : ''}{r.payment_method ? `${r.payment_method} · ` : ''}
            {new Date(r.created_at).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}
