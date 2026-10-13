import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Plus, Users, Crown, Megaphone, X, LogIn } from 'lucide-react';

export default function Groups() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [isPremium, setIsPremium] = useState(false);

  const load = async () => {
    setLoading(true);
    const [groupsRes, userRes] = await Promise.all([
      supabase.rpc('list_my_groups'),
      supabase.auth.getUser().then(async ({ data }) => {
        if (!data.user) return { data: null };
        return supabase.from('users').select('is_subscribed, is_membership_exempt').eq('id', data.user.id).single();
      }),
    ]);
    setGroups(Array.isArray(groupsRes.data) ? groupsRes.data : []);
    const u = (userRes as any)?.data;
    setIsPremium(!!(u?.is_subscribed || u?.is_membership_exempt));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-base font-bold text-navy dark:text-white">My Groups</h1>
          <p className="text-[10px] text-gray-500">{groups.length} group{groups.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowJoin(true)}
            className="bg-gray-100 dark:bg-darkline text-navy dark:text-white text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1"
          >
            <LogIn size={12} /> Join
          </button>
          {isPremium && (
            <button
              onClick={() => setShowCreate(true)}
              className="bg-accent text-white text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1"
            >
              <Plus size={12} /> Create
            </button>
          )}
        </div>
      </div>

      {!isPremium && (
        <button
          onClick={() => navigate('/subscribe')}
          className="w-full bg-gradient-to-r from-brand to-brand-dark text-white rounded-xl p-3 mb-3 flex items-center gap-3"
        >
          <Crown size={20} className="text-gold shrink-0" />
          <div className="flex-1 text-left">
            <p className="text-[12px] font-bold">Premium required to create groups</p>
            <p className="text-[10px] opacity-80">Upgrade to start your own community</p>
          </div>
        </button>
      )}

      {groups.length === 0 && (
        <div className="bg-white dark:bg-darkcard rounded-2xl p-6 shadow-sm text-center">
          <Users size={32} className="mx-auto text-gray-400 mb-2" />
          <p className="text-[12px] font-bold text-navy dark:text-white">No groups yet</p>
          <p className="text-[10px] text-gray-500 mt-1">
            {isPremium ? 'Create your first group to get started.' : 'Join a group with an invite link.'}
          </p>
          <div className="flex gap-2 mt-3 justify-center">
            <button
              onClick={() => setShowJoin(true)}
              className="bg-gray-100 dark:bg-darkline text-navy dark:text-white text-[10px] font-bold px-4 py-2 rounded-lg"
            >
              Join with code
            </button>
            {isPremium && (
              <button
                onClick={() => setShowCreate(true)}
                className="bg-accent text-white text-[10px] font-bold px-4 py-2 rounded-lg"
              >
                Create group
              </button>
            )}
          </div>
        </div>
      )}

      {groups.map(g => (
        <button
          key={g.id}
          onClick={() => navigate(`/groups/${g.id}`)}
          className="w-full bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-2 p-3 flex items-center gap-3 text-left"
        >
          <div className="w-12 h-12 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold text-[14px] overflow-hidden shrink-0">
            {g.avatar_url ? (
              <img src={g.avatar_url} alt="" className="w-12 h-12 object-cover" />
            ) : (
              g.name?.[0]?.toUpperCase() || 'G'
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-[12px] font-bold text-navy dark:text-white truncate">
                {g.name}
              </p>
              {g.is_announcement && <Megaphone size={11} className="text-accent" />}
              {g.role === 'owner' && <Crown size={11} className="text-gold" />}
              {g.role === 'admin' && <Crown size={11} className="text-accent" />}
            </div>
            <p className="text-[10px] text-gray-500 truncate mt-0.5">
              {g.description || `${g.member_count} members`}
            </p>
            <p className="text-[9px] text-gray-400 mt-0.5">
              {g.member_count} members · {g.role}
            </p>
          </div>
        </button>
      ))}

      {showCreate && (
        <CreateGroupSheet
          onClose={() => setShowCreate(false)}
          onCreated={(id) => { setShowCreate(false); navigate(`/groups/${id}`); }}
        />
      )}

      {showJoin && (
        <JoinGroupSheet
          onClose={() => setShowJoin(false)}
          onJoined={(id) => { setShowJoin(false); navigate(`/groups/${id}`); }}
        />
      )}
    </div>
  );
}

function CreateGroupSheet({ onClose, onCreated }: any) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [announcement, setAnnouncement] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const create = async () => {
    setErr('');
    if (name.trim().length < 3) return setErr('Name must be at least 3 characters.');
    setBusy(true);
    const { data, error } = await supabase.rpc('create_group', {
      p_name: name.trim(),
      p_description: description.trim() || null,
      p_avatar_url: avatarUrl.trim() || null,
      p_is_announcement: announcement,
    });
    if (error || !data?.ok) {
      setErr(error?.message || data?.error || 'Could not create group.');
      setBusy(false);
      return;
    }
    onCreated(data.group_id);
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between sticky top-0 bg-white dark:bg-darkcard">
          <p className="text-[13px] font-bold text-navy dark:text-white">Create group</p>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <div className="p-3 space-y-3">
          <div>
            <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 block">Group name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Yaoundé Electronics Deals"
              className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 block">Description (optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="What is this group about?"
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
          <label className="flex items-center gap-2 text-[11px] text-navy dark:text-white">
            <input type="checkbox" checked={announcement} onChange={e => setAnnouncement(e.target.checked)} className="accent-accent" />
            Announcement group (only admins can post)
          </label>

          {err && <p className="text-[11px] text-red-600">{err}</p>}

          <button
            onClick={create}
            disabled={busy || name.trim().length < 3}
            className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[12px] disabled:opacity-50"
          >
            {busy ? 'Creating...' : 'Create group'}
          </button>
        </div>
      </div>
    </div>
  );
}

function JoinGroupSheet({ onClose, onJoined }: any) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const join = async () => {
    setErr('');
    if (!code.trim()) return setErr('Enter an invite code.');
    setBusy(true);
    const { data, error } = await supabase.rpc('join_group_by_code', { p_code: code.trim() });
    if (error || !data?.ok) {
      setErr(error?.message || data?.error || 'Could not join group.');
      setBusy(false);
      return;
    }
    onJoined(data.group_id);
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-2xl animate-slide-up">
        <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between">
          <p className="text-[13px] font-bold text-navy dark:text-white">Join group</p>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-3 space-y-3">
          <div>
            <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 block">Invite code</label>
            <input
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="e.g. a1b2c3d4e5f6"
              className="w-full p-3 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs font-mono"
            />
          </div>
          {err && <p className="text-[11px] text-red-600">{err}</p>}
          <button
            onClick={join}
            disabled={busy || !code.trim()}
            className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[12px] disabled:opacity-50"
          >
            {busy ? 'Joining...' : 'Join group'}
          </button>
        </div>
      </div>
    </div>
  );
      }
