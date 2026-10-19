import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Activity, Search, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';

const LABEL: Record<string, string> = { 
  view_post: 'Viewed a post', 
  view_listing: 'Viewed a listing', 
  search: 'Searched' 
};

export default function ActivityLog() {
  const navigate = useNavigate();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const me = await getCachedUser();
      if (!me) { setLoading(false); return; }

      const { data: logs } = await supabase
        .from('activity_log')
        .select('*')
        .eq('user_id', me.id)
        .in('action', ['view_post', 'search', 'view_listing'])
        .order('created_at', { ascending: false });

      setData(logs || []);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <div className="p-4 text-center text-xs text-mute">Loading activity...</div>;

  return (
    <div className="px-4 py-4 pb-24 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6 mt-1">
        <button onClick={() => navigate(-1)} className="text-navy dark:text-white cursor-pointer">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-[22px] font-bold text-navy dark:text-white">Activity Log</h1>
      </div>

      {data.length === 0 && (
        <div className="bg-white dark:bg-darkcard rounded-[20px] p-8 text-center shadow-sm border border-gray-100 dark:border-darkline">
          <Activity size={32} className="mx-auto text-gray-400 mb-3" />
          <p className="text-[15px] font-bold text-navy dark:text-white">No activity yet</p>
          <p className="text-[13px] text-mute mt-1">Your views and searches will appear here.</p>
        </div>
      )}

      <div className="space-y-3">
        {data.map(e => (
          <Link 
            key={e.id} 
            to={e.link || '/'} 
            className="block bg-white dark:bg-darkcard rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-darkline active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#eaf6ef] text-[#12935a] flex items-center justify-center shrink-0">
                {e.action === 'search' ? <Search size={18} /> : <FileText size={18} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold text-navy dark:text-white">
                  {LABEL[e.action] || e.action}
                </p>
                <p data-no-translate className="text-[13px] text-mute truncate mt-0.5">
                  {e.action === 'search' ? `"${e.meta?.query || ''}"` : 'Tap to open'}
                </p>
              </div>
            </div>
            <div className="text-[11px] text-gray-400 mt-2 pl-[52px]">
              {new Date(e.created_at).toLocaleString()}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
              }
