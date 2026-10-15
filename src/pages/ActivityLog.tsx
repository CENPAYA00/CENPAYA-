import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Activity } from 'lucide-react';
import { useActivityLog } from '../hooks/useActivityLog';
import ActivityItem from '../components/ActivityItem';

export default function ActivityLog() {
  const navigate = useNavigate();
  const { items, loading } = useActivityLog(200);

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">Activity log</h1>
        <span className="text-[9px] text-gray-400 ml-auto">{items.length} entries</span>
      </div>

      {loading && <p className="text-center text-xs text-gray-400 py-6">Loading...</p>}

      {!loading && items.length === 0 && (
        <div className="bg-white dark:bg-darkcard rounded-2xl p-6 text-center shadow-sm">
          <Activity size={28} className="mx-auto text-gray-400 mb-2" />
          <p className="text-[11px] font-bold text-navy dark:text-white">No activity yet</p>
          <p className="text-[10px] text-gray-500 mt-1">Your actions will appear here.</p>
        </div>
      )}

      {items.map(item => (
        <ActivityItem
          key={item.id}
          action={item.action}
          meta={item.meta}
          createdAt={item.created_at}
        />
      ))}
    </div>
  );
}
