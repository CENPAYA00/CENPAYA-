import { useEffect, useState } from 'react';
import { supabaseWorkerRequest } from '../../lib/supabaseWorkerApi';
import { Plus, X } from 'lucide-react';

export default function AdminPaymentMethods() {
  const [methods, setMethods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const result = await supabaseWorkerRequest<{ data: any[] }>('/api/v1/admin/payment-methods');
      setMethods(result.data || []);
    } catch (error) { console.error(error); setMethods([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggle = async (m: any) => {
    await supabaseWorkerRequest('/api/v1/admin/rpc/admin_toggle_payment_method', { method: 'POST', body: JSON.stringify({ args: { p_method_name: m.method_name, p_active: !m.is_active } }) });
    load();
  };

  const add = async () => {
    if (!name.trim() || !label.trim()) return;
    try {
      await supabaseWorkerRequest('/api/v1/admin/rpc/admin_add_payment_method', { method: 'POST', body: JSON.stringify({ args: { p_method_name: name.trim(), p_display_label: label.trim() } }) });
    } catch (error: unknown) { alert(error instanceof Error ? error.message : 'Could not add payment method.'); return; }
    setShowAdd(false);
    setName('');
    setLabel('');
    load();
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-2xl font-bold text-navy dark:text-white">💳 Payment Methods</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Active and inactive methods shown to users.</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-accent text-white text-[11px] font-bold px-3 py-2 rounded-lg flex items-center gap-1"
        >
          <Plus size={12} /> Add
        </button>
      </div>

      {methods.map(m => (
        <div key={m.id} className="bg-white dark:bg-darkcard p-3 rounded-xl shadow-sm mb-2 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-navy dark:text-white truncate">
              {m.display_label}
            </p>
            <p className="text-[10px] text-gray-500 font-mono">{m.method_name}</p>
          </div>
          <button
            onClick={() => toggle(m)}
            className={`text-[10px] font-bold px-3 py-1 rounded-full ${
              m.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 dark:bg-darkline text-gray-500'
            }`}
          >
            {m.is_active ? 'Active' : 'Off'}
          </button>
        </div>
      ))}

      {showAdd && (
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={() => setShowAdd(false)}>
          <div onClick={e => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-2xl animate-slide-up">
            <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between">
              <p className="text-[13px] font-bold text-navy dark:text-white">Add payment method</p>
              <button onClick={() => setShowAdd(false)}><X size={18} /></button>
            </div>
            <div className="p-3 space-y-3">
              <div>
                <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 block">Internal name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="wave_money"
                  className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 block">Display label</label>
                <input
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder="Wave Money"
                  className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
                />
              </div>
              <button
                onClick={add}
                disabled={!name.trim() || !label.trim()}
                className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[12px] disabled:opacity-50"
              >
                Add method
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
