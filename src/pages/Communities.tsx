import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Plus, Network, X } from 'lucide-react';
import { getCachedUser } from '../lib/cache';

export default function Communities() {
  const navigate = useNavigate();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [canCreate, setCanCreate] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setLoading(true);
    const [commRes, me] = await Promise.all([
      supabase.rpc('list_my_communities'),
      getCachedUser(),
    ]);
    setList(Array.isArray(commRes.data) ? commRes.data : []);

    if (me) {
      const { data: profile } = await supabase
        .from('users')
        .select('is_subscribed, is_membership_exempt, role')
        .eq('id', me.id)
        .maybeSingle();
      const isStaff = ['owner', 'super_admin', 'support_agent'].includes(profile?.role || '');
      setCanCreate(isStaff || !!(profile?.is_subscribed || profile?.is_membership_exempt));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-base font-bold text-navy dark:text-white">Communities</h1>
          <p className="text-[10px] text-gray-500">{list.length} communit{list.length === 1 ? 'y' : 'ies'}</p>
        </div>
        {canCreate && (
          <button onClick={() => setShowCreate(true)} className="bg-accent text-white text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1">
            <Plus size={12} /> New
          </button>
        )}
      </div>

      {list.length === 0 && (
        <div className="bg-white dark:bg-darkcard rounded-2xl p-6 shadow-sm text-center">
          <Network size={32} className="mx-auto text-gray-400 mb-2" />
          <p className="text-[12px] font-bold text-navy dark:text-white">No communities yet</p>
          <p className="text-[10px] text-gray-500 mt-1">
            {canCreate ? 'Create a community to link multiple groups.' : 'Premium members can create communities.'}
          </p>
        </div>
      )}

      {list.map(c => (
        <button key={c.id} onClick={() => navigate(`/communities/${c.id}`)} className="w-full bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-2 p-3 flex items-center gap-3 text-left">
          <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center text-accent font-bold overflow-hidden shrink-0">
            {c.avatar_url ? <img src={c.avatar_url} alt="" className="w-12 h-12 object-cover" /> : c.name?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-navy dark:text-white truncate">{c.name}</p>
            <p className="text-[10px] text-gray-500 truncate mt-0.5">{c.description || 'No description'}</p>
            <p className="text-[9px] text-gray-400 mt-0.5">{c.group_count} groups</p>
          </div>
        </button>
      ))}

      {showCreate && <CreateSheet onClose={() => setShowCreate(false)} onCreated={(id: string) => { setShowCreate(false); navigate(`/communities/${id}`); }} />}
    </div>
  );
}

function CreateSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const create = async () => {
    setErr('');
    if (name.trim().length < 3) return setErr('Name too short.');
    setBusy(true);
    const { data, error } = await supabase.rpc('create_community', {
      p_name: name.trim(),
      p_description: description.trim() || null,
      p_avatar_url: avatarUrl.trim() || null,
    });
    if (error || !data?.ok) { setErr(error?.message || data?.error || 'Failed'); setBusy(false); return; }
    onCreated(data.community_id);
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-2xl animate-slide-up">
        <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between">
          <p className="text-[13px] font-bold text-navy dark:text-white">Create community</p>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-3 space-y-3">
          <input
            value={name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            placeholder="Community name"
            className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
          />
          <textarea
            value={description}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
            rows={3}
            placeholder="What is this community about?"
            className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs resize-none"
          />
          <input
            value={avatarUrl}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAvatarUrl(e.target.value)}
            placeholder="Avatar URL (optional)"
            className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
          />
          {err && <p className="text-[11px] text-red-600">{err}</p>}
          <button onClick={create} disabled={busy} className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[12px] disabled:opacity-50">
            {busy ? 'Creating...' : 'Create community'}
          </button>
        </div>
      </div>
    </div>
  );
            }
