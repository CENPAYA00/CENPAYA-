import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Shield, Search, AlertTriangle, Check, XCircle } from 'lucide-react';

export default function AdminEscrow() {
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all' | 'order' | 'service'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_list_open_escrows', { p_limit: 200 });
    if (error) console.error(error);
    setRows(data?.escrows || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = rows.filter(r =>
    (filter === 'all' || r.kind === filter) &&
    (!search.trim() ||
      (r.buyer_username || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.seller_username || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.listing_title || '').toLowerCase().includes(search.toLowerCase()))
  );

  const act = async (row: any, action: 'release' | 'refund' | 'cancel' | 'dispute') => {
    const reason = window.prompt(`Reason for ${action} (min 10 characters):`);
    if (!reason || reason.trim().length < 10) return;

    if (!window.confirm(`${action.toUpperCase()} ${row.kind} ${row.id.slice(0, 8)} for ${Number(row.amount).toLocaleString()} XAF?`)) return;

    setBusy(row.id);
    const { data, error } = await supabase.rpc('admin_escrow_action', {
      p_kind: row.kind,
      p_id: row.id,
      p_action: action,
      p_reason: reason.trim(),
    });
    if (error || !data?.ok) alert(error?.message || data?.error || 'Action failed');
    setBusy(null);
    load();
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-navy dark:text-white mb-2">🛡️ Escrow Control</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
        Manage funds held in escrow across orders and services.
      </p>

      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          placeholder="Search by buyer, seller, or title..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-3 py-3 border border-gray-200 dark:border-darkline rounded-xl bg-white dark:bg-darkcard text-[12px]"
        />
      </div>

      <div className="flex gap-1.5 mb-3">
        {(['all', 'order', 'service'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-[10px] font-bold px-3 py-1.5 rounded-full ${
              filter === f
                ? 'bg-navy dark:bg-accent text-white'
                : 'bg-white dark:bg-darkcard text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-darkline'
            }`}
          >
            {f === 'all' ? 'All' : f === 'order' ? 'Orders' : 'Services'}
          </button>
        ))}
      </div>

      {loading && <p className="text-center text-xs text-gray-500 py-6">Loading...</p>}

      {!loading && filtered.length === 0 && (
        <div className="bg-white dark:bg-darkcard p-6 rounded-xl text-center shadow-sm">
          <Shield size={28} className="mx-auto text-gray-400 mb-2" />
          <p className="text-[12px] text-gray-500">No open escrows.</p>
        </div>
      )}

      {filtered.map(r => (
        <div key={`${r.kind}_${r.id}`} className="bg-white dark:bg-darkcard rounded-xl shadow-sm mb-3 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] font-bold text-navy dark:text-white truncate">
              {r.listing_title || 'Untitled'}
            </p>
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
              r.escrow_status === 'hold' ? 'bg-yellow-100 text-yellow-700' :
              r.escrow_status === 'delivered' ? 'bg-blue-100 text-blue-700' :
              r.escrow_status === 'disputed' ? 'bg-red-100 text-red-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {r.escrow_status}
            </span>
          </div>

          <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
            <span>Buyer</span>
            <span className="text-navy dark:text-white">@{r.buyer_username}</span>
          </div>
          <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
            <span>Seller</span>
            <span className="text-navy dark:text-white">@{r.seller_username}</span>
          </div>
          <div className="flex justify-between text-[10px] text-gray-500 mb-2">
            <span>Amount</span>
            <span className="font-bold text-accent">{Number(r.amount).toLocaleString()} XAF</span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            <button
              onClick={() => act(r, 'release')}
              disabled={busy === r.id}
              className="text-[9px] font-bold bg-green-100 text-green-700 rounded-lg py-2 flex flex-col items-center gap-0.5 disabled:opacity-50"
            >
              <Check size={11} /> Release
            </button>
            <button
              onClick={() => act(r, 'refund')}
              disabled={busy === r.id}
              className="text-[9px] font-bold bg-yellow-100 text-yellow-700 rounded-lg py-2 flex flex-col items-center gap-0.5 disabled:opacity-50"
            >
              <XCircle size={11} /> Refund
            </button>
            <button
              onClick={() => act(r, 'cancel')}
              disabled={busy === r.id}
              className="text-[9px] font-bold bg-gray-100 text-gray-700 rounded-lg py-2 flex flex-col items-center gap-0.5 disabled:opacity-50"
            >
              <XCircle size={11} /> Cancel
            </button>
            <button
              onClick={() => act(r, 'dispute')}
              disabled={busy === r.id}
              className="text-[9px] font-bold bg-red-100 text-red-700 rounded-lg py-2 flex flex-col items-center gap-0.5 disabled:opacity-50"
            >
              <AlertTriangle size={11} /> Dispute
            </button>
          </div>
        </div>
      ))}
    </div>
  );
       }
