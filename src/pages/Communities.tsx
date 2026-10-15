import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Plus, Network, Crown, X } from 'lucide-react';
import { getCachedUser } from '../lib/cache';

export default function Communities() {
  const navigate = useNavigate();
  const [communities, setCommunities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [isPremium, setIsPremium] = useState(false);

  const load = async () => {
    setLoading(true);
    const me = await getCachedUser();
    if (me) {
      const { data: u } = await supabase
        .from('users')
        .select('is_subscribed, is_membership_exempt')
        .eq('id', me.id)
        .single();
      setIsPremium(!!(u?.is_subscribed || u?.is_membership_exempt));
    }
    const { data } = await supabase.rpc('list_my_communities');
    setCommunities(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-base font-bold text-navy dark:text-white">Communities</h1>
          <p className="text-[10px] text-gray-500">{communities.length} communities</p>
        </div>
        {isPremium ? (
          <button
            onClick={() => setShowCreate(true)}
            className="bg-accent text-white text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1 cursor-pointer"
          >
            <Plus size={12} /> New
          </button>
        ) : (
          <button
            onClick={() => navigate('/subscribe')}
            className="bg-gradient-to-r from-brand to-brand-dark text-white text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1 cursor-pointer"
          >
            <Crown size={12} className="text-gold" /> Premium
          </button>
        )}
      </div>

      {!isPremium && (
        <button
          onClick={() => navigate('/subscribe')}
          className="w-full bg-gradient-to-r from-brand to-brand-dark text-white rounded-xl p-3 mb-3 flex items-center gap-3 cursor-pointer"
        >
          <Crown size={20} className="text-gold shrink-0" />
          <div className="flex-1 text-left">
            <p className="text-[12px] font-bold">Premium required to create communities</p>
            <p className="text-[10px] opacity-80">Upgrade to link multiple groups together</p>
          </div>
        </button>
      )}

      {communities.length === 0 && (
        <div className="bg-white dark:bg-darkcard rounded-2xl p-6 shadow-sm text-center">
          <Network size={32} className="mx-auto text-gray-400 mb-2" />
          <p className="text-[12px] font-bold text-navy dark:text-white">No communities yet</p>
          <p className="text-[10px] text-gray-500 mt-1">
            {isPremium ? 'Create a community to link multiple groups.' : 'Upgrade to Premium to create one.'}
          </p>
        </div>
      )}

      {communities.map((c: any) => (
        <button
          key={c.id}
          onClick={() => navigate(`/communities/${c.id}`)}
          className="w-full bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-2 p-3 flex items-center gap-3 text-left cursor-pointer"
        >
          <div className="w-12 h-12 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold overflow-hidden shrink-0">
            {c.avatar_url ? (
              <img src={c.avatar_url} alt="" className="w-12 h-12 object-cover" />
            ) : (
              c.name?.[0]?.toUpperCase() || 'C'
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-navy dark:text-white truncate">{c.name}</p>
            <p className="text-[10px] text-gray-500 truncate mt-0.5">
              {c.description || `${c.member_count || 0} groups`}
            </p>
          </div>
        </button>
      ))}

      {showCreate && (
        <CreateCommunitySheet
          onClose={() => setShowCreate(false)}
          onCreated={(id: string) => { setShowCreate(false); navigate(`/communities/${id}`); }}
        />
      )}
    </div>
  );
}

function CreateCommunitySheet({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const create = async () => {
    setErr('');
    if (name.trim().length < 3) return setErr('Name must be at least 3 characters.');
    setBusy(true);
    const { data, error } = await supabase.rpc('create_community', {
      p_name: name.trim(),
      p_description: description.trim() || null,
      p_avatar_url: avatarUrl.trim() || null,
    });
    if (error || !data?.ok) {
      setErr(error?.message || data?.error || 'Could not create community.');
      setBusy(false);
      return;
    }
    onCreated(data.community_id);
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between sticky top-0 bg-white dark:bg-darkcard">
          <p className="text-[13px] font-bold text-navy dark:text-white">Create community</p>
          <button onClick={onClose} className="cursor-pointer"><X size={18} /></button>
        </div>
        <div className="p-3 space-y-3">
          <div>
            <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 block">Community name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="CenPaya Electronics Hub"
              className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 block">What is this community about?</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe your community"
              className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs resize-none"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 block">Avatar URL (optional)</label>
            <input
              value={avatarUrl}
              onChange={e => setAvatarUrl(e.target.value)}
              placeholder="https://..."
              className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
            />
          </div>
          {err && <p className="text-[11px] text-red-600">{err}</p>}
          <button
            onClick={create}
            disabled={busy || name.trim().length < 3}
            className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[12px] disabled:opacity-50 cursor-pointer"
          >
            {busy ? 'Creating...' : 'Create community'}
          </button>
        </div>
      </div>
    </div>
  );
              }
