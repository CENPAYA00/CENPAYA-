import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { MessageSquare, Clock, Search, Filter } from 'lucide-react';

export default function AdminInbox() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all' | 'open' | 'in_progress' | 'resolved'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_list_tickets', {
      p_status: filter === 'all' ? null : filter,
      p_limit: 200,
    });
    if (error) console.error(error);
    setTickets(data?.tickets || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const filtered = tickets.filter(t =>
    !search.trim() ||
    (t.subject || '').toLowerCase().includes(search.toLowerCase()) ||
    (t.username || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalUnread = tickets.reduce((s, t) => s + (t.unread || 0), 0);

  return (
    <div>
      <h2 className="text-2xl font-bold text-navy dark:text-white mb-2">📥 Inbox</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {tickets.length} tickets · {totalUnread} unread
      </p>

      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          placeholder="Search by subject or username..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-3 py-3 border border-gray-200 dark:border-darkline rounded-xl bg-white dark:bg-darkcard text-[12px]"
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-hide">
        {(['all', 'open', 'in_progress', 'resolved'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`whitespace-nowrap text-[10px] font-bold px-3 py-1.5 rounded-full ${
              filter === f
                ? 'bg-navy dark:bg-accent text-white'
                : 'bg-white dark:bg-darkcard text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-darkline'
            }`}
          >
            {f === 'all' ? 'All' : f.replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading && <p className="text-center text-xs text-gray-500 py-6">Loading...</p>}

      {!loading && filtered.length === 0 && (
        <div className="bg-white dark:bg-darkcard p-6 rounded-xl text-center shadow-sm">
          <MessageSquare size={28} className="mx-auto text-gray-400 mb-2" />
          <p className="text-[12px] text-gray-500">No tickets in this view.</p>
        </div>
      )}

      {filtered.map(t => (
        <button
          key={t.id}
          onClick={() => navigate(`/admin/inbox/${t.id}`)}
          className="w-full bg-white dark:bg-darkcard rounded-xl shadow-sm mb-2 p-3 flex items-start gap-3 text-left"
        >
          <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold shrink-0">
            {t.username?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-[12px] font-bold text-navy dark:text-white truncate flex-1">
                {t.subject}
              </p>
              {t.unread > 0 && (
                <span className="text-[9px] font-bold bg-accent text-white px-1.5 py-0.5 rounded-full">
                  {t.unread}
                </span>
              )}
            </div>
            <p className="text-[10px] text-gray-500 truncate mt-0.5">
              @{t.username} · {t.country}
            </p>
            <p className="text-[10px] text-gray-400 truncate mt-0.5">{t.last_message || '—'}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                t.status === 'open' ? 'bg-yellow-100 text-yellow-700' :
                t.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                t.status === 'resolved' ? 'bg-green-100 text-green-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {t.status}
              </span>
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                t.priority === 'critical' ? 'bg-red-100 text-red-700' :
                t.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {t.priority}
              </span>
              <span className="text-[9px] text-gray-400 flex items-center gap-0.5">
                <Clock size={9} /> {new Date(t.updated_at || t.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
