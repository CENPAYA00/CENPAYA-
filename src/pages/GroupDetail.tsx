import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  ArrowLeft, Users, Crown, Megaphone, Copy, Check, Share2,
  UserMinus, Shield, X, LogOut
} from 'lucide-react';

export default function GroupDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'members' | 'info'>('members');
  const [copied, setCopied] = useState(false);
  const [memberAction, setMemberAction] = useState<any>(null);

  const load = async () => {
    if (!id) return;
    const { data: res } = await supabase.rpc('get_group', { p_group_id: id });
    if (res?.ok) setData(res);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const copyCode = async () => {
    if (!data?.group?.invite_code) return;
    await navigator.clipboard.writeText(data.group.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareCode = async () => {
    if (!data?.group?.invite_code) return;
    const url = `https://cenpaya.pages.dev/groups/join/${data.group.invite_code}`;
    if (navigator.share) {
      try { await navigator.share({ title: data.group.name, text: `Join ${data.group.name} on CenPaya`, url }); } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      alert('Link copied');
    }
  };

  const leave = async () => {
    if (!window.confirm('Leave this group?')) return;
    const { data: res, error } = await supabase.rpc('leave_group', { p_group_id: id });
    if (error || !res?.ok) alert(error?.message || res?.error || 'Failed');
    else navigate('/groups');
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;
  if (!data?.ok) return <div className="p-4 text-center text-xs">Group not found.</div>;

  const g = data.group;
  const myRole = data.my_role;
  const isStaff = myRole === 'owner' || myRole === 'admin';

  return (
    <div className="pb-24">
      <div className="flex items-center gap-2 px-3 py-2 sticky top-0 z-20 bg-white dark:bg-darkcard border-b border-gray-100 dark:border-darkline">
        <button onClick={() => navigate('/groups')} className="text-navy dark:text-white"><ArrowLeft size={20} /></button>
        <p className="flex-1 text-[13px] font-bold text-navy dark:text-white truncate">{g.name}</p>
      </div>

      {/* Hero */}
      <div className="p-4 flex flex-col items-center">
        <div className="w-20 h-20 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold text-2xl overflow-hidden mb-2">
          {g.avatar_url ? (
            <img src={g.avatar_url} alt="" className="w-20 h-20 object-cover" />
          ) : (
            g.name?.[0]?.toUpperCase()
          )}
        </div>
        <div className="flex items-center gap-1.5 mb-1">
          <h1 className="text-[16px] font-black text-navy dark:text-white">{g.name}</h1>
          {g.is_announcement && <Megaphone size={14} className="text-accent" />}
        </div>
        <p className="text-[11px] text-gray-500">
          {g.member_count} members · {myRole}
        </p>

        {isStaff && g.invite_code && (
          <div className="flex gap-2 mt-3">
            <button
              onClick={copyCode}
              className="text-[10px] font-bold text-navy dark:text-white bg-gray-100 dark:bg-darkline px-3 py-1.5 rounded-full flex items-center gap-1"
            >
              {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy code</>}
            </button>
            <button
              onClick={shareCode}
              className="text-[10px] font-bold text-white bg-accent px-3 py-1.5 rounded-full flex items-center gap-1"
            >
              <Share2 size={11} /> Share
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-darkline">
        {(['members','info'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-[11px] font-bold ${
              tab === t ? 'text-accent border-b-2 border-accent' : 'text-gray-500'
            }`}
          >
            {t === 'members' ? `Members (${data.members?.length || 0})` : 'Info'}
          </button>
        ))}
      </div>

      {tab === 'members' && (
        <div className="px-3 py-3">
          {data.members?.map((m: any) => (
            <div key={m.user_id} className="bg-white dark:bg-darkcard rounded-xl shadow-sm mb-2 p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold overflow-hidden">
                {m.avatar_url ? (
                  <img src={m.avatar_url} alt="" className="w-10 h-10 object-cover" />
                ) : (
                  m.username?.[0]?.toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-[12px] font-bold text-navy dark:text-white truncate">
                    @{m.username}
                  </p>
                  {m.role === 'owner' && <Crown size={11} className="text-gold" />}
                  {m.role === 'admin' && <Crown size={11} className="text-accent" />}
                </div>
                <p className="text-[9px] text-gray-400 uppercase tracking-wider">{m.role}</p>
              </div>
              {isStaff && m.role !== 'owner' && m.user_id !== data.my_role && (
                <button
                  onClick={() => setMemberAction(m)}
                  className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-darkline flex items-center justify-center text-gray-500"
                >
                  <Shield size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'info' && (
        <div className="px-3 py-3">
          <div className="bg-white dark:bg-darkcard rounded-xl shadow-sm p-4 mb-3">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Description</p>
            <p className="text-[12px] text-navy dark:text-white">
              {g.description || 'No description'}
            </p>
          </div>
          <div className="bg-white dark:bg-darkcard rounded-xl shadow-sm p-4 mb-3">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Created</p>
            <p className="text-[12px] text-navy dark:text-white">
              {new Date(g.created_at).toLocaleDateString()}
            </p>
          </div>
          {myRole !== 'owner' && (
            <button
              onClick={leave}
              className="w-full bg-red-50 dark:bg-red-900/20 text-red-600 font-bold py-3 rounded-xl text-[12px] flex items-center justify-center gap-1"
            >
              <LogOut size={13} /> Leave group
            </button>
          )}
        </div>
      )}

      {memberAction && (
        <MemberActionSheet
          group={g}
          member={memberAction}
          onClose={() => setMemberAction(null)}
          onDone={() => { setMemberAction(null); load(); }}
        />
      )}
    </div>
  );
}

function MemberActionSheet({ group, member, onClose, onDone }: any) {
  const setRole = async (role: 'admin' | 'member') => {
    const { data, error } = await supabase.rpc('set_group_member_role', {
      p_group_id: group.id,
      p_target_id: member.user_id,
      p_role: role,
    });
    if (error || !data?.ok) alert(error?.message || data?.error || 'Failed');
    else onDone();
  };

  const remove = async () => {
    if (!window.confirm(`Remove @${member.username} from the group?`)) return;
    const { data, error } = await supabase.rpc('remove_group_member', {
      p_group_id: group.id,
      p_target_id: member.user_id,
    });
    if (error || !data?.ok) alert(error?.message || data?.error || 'Failed');
    else onDone();
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-2xl animate-slide-up">
        <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between">
          <p className="text-[13px] font-bold text-navy dark:text-white">@{member.username}</p>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-3 space-y-2">
          {member.role === 'member' && (
            <button onClick={() => setRole('admin')} className="w-full text-left p-3 rounded-xl bg-accent/10 text-accent font-bold text-[12px]">
              Promote to admin
            </button>
          )}
          {member.role === 'admin' && (
            <button onClick={() => setRole('member')} className="w-full text-left p-3 rounded-xl bg-gray-50 dark:bg-darkbg text-navy dark:text-white font-bold text-[12px]">
              Demote to member
            </button>
          )}
          <button onClick={remove} className="w-full text-left p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 font-bold text-[12px] flex items-center gap-2">
            <UserMinus size={14} /> Remove from group
          </button>
        </div>
      </div>
    </div>
  );
        }
