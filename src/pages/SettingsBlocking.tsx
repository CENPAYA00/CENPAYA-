import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Ban, UserX } from 'lucide-react';
import { d1Request } from '../lib/d1Api';

export default function SettingsBlocking() {
  const navigate = useNavigate();
  const [blocked, setBlocked] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    try { const r = await d1Request<{ data: any[] }>('/api/me/blocked-users'); setBlocked(r.data || []); }
    catch (e: any) { alert(e.message || 'Could not load blocked users'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const unblock = async (id: string) => {
    try { await d1Request('/api/me/blocked-users/' + encodeURIComponent(id), { method: 'DELETE' }); setBlocked(prev => prev.filter(b => b.id !== id)); }
    catch (e: any) { alert(e.message || 'Could not unblock user'); }
  };
  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;
  return <div className="px-3 py-3 pb-24">
    <div className="flex items-center gap-2 mb-3"><button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button><h1 className="text-base font-bold text-navy dark:text-white">Blocked users</h1></div>
    {blocked.length === 0 && <div className="bg-white dark:bg-darkcard rounded-2xl p-6 text-center shadow-sm"><Ban size={28} className="mx-auto text-gray-400 mb-2" /><p className="text-[11px] font-bold text-navy dark:text-white">No blocked users</p></div>}
    {blocked.map(b => <div key={b.id} className="bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-2 p-3 flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold">{b.username?.[0]?.toUpperCase() || 'U'}</div>
      <div className="flex-1 min-w-0"><p className="text-[12px] font-bold text-navy dark:text-white truncate">@{b.username || 'User'}</p><p className="text-[9px] text-gray-400">Blocked {new Date(b.created_at).toLocaleDateString()}</p></div>
      <button onClick={() => unblock(b.id)} className="text-[10px] font-bold text-accent px-3 py-1.5 rounded-lg bg-accent/10 flex items-center gap-1"><UserX size={11} /> Unblock</button>
    </div>)}
  </div>;
}
