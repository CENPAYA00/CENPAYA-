import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Flag, Check, X, Clock, User as UserIcon, FileText as FileTextIcon, MessageSquare } from 'lucide-react';

export default function AdminReports() {
  const [reports, setReports] = useState<any[]>([]);
  const [filter, setFilter] = useState<'open' | 'under_review' | 'resolved' | 'dismissed' | 'all'>('open');
  const [loading, setLoading] = useState(true);
  const [actionReport, setActionReport] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.rpc('admin_list_reports', {
      p_status: filter === 'all' ? null : filter,
      p_limit: 200,
    });
    setReports(data?.reports || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const resolve = async (id: string, decision: 'resolved' | 'dismissed' | 'under_review') => {
    const note = window.prompt('Add a note (optional):') || null;
    const { error } = await supabase.rpc('admin_resolve_report', {
      p_report_id: id,
      p_decision: decision,
      p_note: note,
    });
    if (error) alert(error.message);
    else { setActionReport(null); load(); }
  };

  const targetIcon = (t: string) => {
    if (t === 'user') return <UserIcon size={14} />;
    if (t === 'message') return <MessageSquare size={14} />;
    return <FileTextIcon size={14} />;
  };

  const statusColor: Record<string, string> = {
    open: 'bg-yellow-100 text-yellow-700',
    under_review: 'bg-blue-100 text-blue-700',
    resolved: 'bg-green-100 text-green-700',
    dismissed: 'bg-gray-100 text-gray-700',
  };

  return (
    <div>
      <div className="mb-3">
        <h2 className="text-2xl font-bold text-navy dark:text-white">🚩 Reports</h2>
        <p className="text-[11px] text-gray-500">{reports.length} in this view</p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-hide">
        {(['open', 'under_review', 'resolved', 'dismissed', 'all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`whitespace-nowrap text-[10px] font-bold px-3 py-1.5 rounded-full ${
              filter === f
                ? 'bg-navy dark:bg-accent text-white'
                : 'bg-white dark:bg-darkcard text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-darkline'
            }`}>
            {f.replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading && <p className="text-center text-xs text-gray-500 py-6">Loading...</p>}

      {!loading && reports.length === 0 && (
        <div className="bg-white dark:bg-darkcard p-6 rounded-xl text-center shadow-sm">
          <Flag size={28} className="mx-auto text-gray-400 mb-2" />
          <p className="text-[12px] text-gray-500">No reports in this view.</p>
        </div>
      )}

      {reports.map(r => (
        <div key={r.id} className="bg-white dark:bg-darkcard rounded-xl shadow-sm mb-2 p-3">
          <div className="flex items-start gap-2 mb-1.5">
            <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/20 text-red-600 flex items-center justify-center shrink-0">
              {targetIcon(r.target_type)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-navy dark:text-white">
                {r.reason_label}
              </p>
              <p className="text-[10px] text-gray-500">
                {r.target_type} · reported by @{r.reporter_username || 'user'}
              </p>
            </div>
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${statusColor[r.status] || 'bg-gray-100 text-gray-700'}`}>
              {r.status}
            </span>
          </div>

          {r.target_preview && (
            <div className="bg-gray-50 dark:bg-darkbg rounded-lg p-2 mb-2 text-[10px] text-gray-600 dark:text-gray-300 line-clamp-3">
              {r.target_preview}
            </div>
          )}

          {r.notes && (
            <p className="text-[10px] text-gray-500 italic mb-2">"{r.notes}"</p>
          )}

          <p className="text-[9px] text-gray-400 flex items-center gap-1 mb-2">
            <Clock size={9} /> {new Date(r.created_at).toLocaleString()}
          </p>

          {r.status === 'open' || r.status === 'under_review' ? (
            <div className="flex gap-1.5">
              <button onClick={() => resolve(r.id, 'resolved')}
                className="flex-1 bg-green-500 text-white text-[10px] font-bold py-2 rounded-lg flex items-center justify-center gap-1">
                <Check size={11} /> Resolve
              </button>
              <button onClick={() => resolve(r.id, 'under_review')}
                className="flex-1 bg-blue-500 text-white text-[10px] font-bold py-2 rounded-lg flex items-center justify-center gap-1">
                <Clock size={11} /> Review
              </button>
              <button onClick={() => resolve(r.id, 'dismissed')}
                className="flex-1 bg-gray-200 dark:bg-darkline text-gray-700 dark:text-gray-200 text-[10px] font-bold py-2 rounded-lg flex items-center justify-center gap-1">
                <X size={11} /> Dismiss
              </button>
            </div>
          ) : (
            r.resolution_note && (
              <p className="text-[10px] text-gray-500 italic">
                Staff note: {r.resolution_note}
              </p>
            )
          )}
        </div>
      ))}
    </div>
  );
}
