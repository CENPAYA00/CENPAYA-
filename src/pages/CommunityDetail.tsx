import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Network, Link2, X, Plus } from 'lucide-react';

export default function CommunityDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [myGroups, setMyGroups] = useState<any[]>([]);
  const [showLink, setShowLink] = useState(false);

  const load = async () => {
    if (!id) return;
    const [commRes, groupsRes] = await Promise.all([
      supabase.rpc('get_community', { p_community_id: id }),
      supabase.rpc('list_my_groups'),
    ]);
    if (commRes.data?.ok) setData(commRes.data);
    setMyGroups(Array.isArray(groupsRes.data) ? groupsRes.data : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const unlink = async (groupId: string) => {
    if (!window.confirm('Remove this group from the community?')) return;
    await supabase.rpc('unlink_group_from_community', { p_community_id: id, p_group_id: groupId });
    load();
  };

  const link = async (groupId: string) => {
    const { data: res, error } = await supabase.rpc('link_group_to_community', { p_community_id: id, p_group_id: groupId });
    if (error || !res?.ok) alert(error?.message || res?.error || 'Failed');
    else { setShowLink(false); load(); }
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;
  if (!data?.ok) return <div className="p-4 text-center text-xs">Community not found.</div>;

  const c = data.community;
  const linkedIds = new Set((data.groups || []).map((g: any) => g.id));
  const linkable = myGroups.filter(g => !linkedIds.has(g.id) && (g.role === 'owner' || g.role === 'admin'));

  return (
    <div className="pb-24">
      <div className="flex items-center gap-2 px-3 py-2 sticky top-0 z-20 bg-white dark:bg-darkcard border-b border-gray-100 dark:border-darkline">
        <button onClick={() => navigate('/communities')} className="text-navy dark:text-white"><ArrowLeft size={20} /></button>
        <p className="flex-1 text-[13px] font-bold text-navy dark:text-white truncate">{c.name}</p>
        {data.is_owner && (
          <button onClick={() => setShowLink(true)} className="text-accent text-[10px] font-bold flex items-center gap-1">
            <Plus size={12} /> Link group
          </button>
        )}
      </div>

      <div className="p-4 flex flex-col items-center border-b border-gray-100 dark:border-darkline">
        <div className="w-20 h-20 rounded-2xl bg-accent/15 flex items-center justify-center text-accent font-bold text-2xl overflow-hidden mb-2">
          {c.avatar_url ? <img src={c.avatar_url} alt="" className="w-20 h-20 object-cover" /> : <Network size={30} />}
        </div>
        <h1 className="text-[16px] font-black text-navy dark:text-white">{c.name}</h1>
        <p className="text-[11px] text-gray-500 mt-1 text-center">{c.description || 'No description'}</p>
        <p className="text-[10px] text-gray-400 mt-1">{data.groups?.length || 0} of {c.max_groups} groups</p>
      </div>

      <div className="px-3 py-3">
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Groups in this community</p>

        {(data.groups || []).length === 0 && (
          <div className="bg-white dark:bg-darkcard rounded-xl p-6 text-center shadow-sm">
            <Link2 size={24} className="mx-auto text-gray-400 mb-2" />
            <p className="text-[12px] text-gray-500">No groups linked yet</p>
          </div>
        )}

        {data.groups?.map((g: any) => (
          <div key={g.id} className="bg-white dark:bg-darkcard rounded-xl shadow-sm mb-2 p-3 flex items-center gap-3">
            <button onClick={() => navigate(`/groups/${g.id}`)} className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold overflow-hidden shrink-0">
              {g.avatar_url ? <img src={g.avatar_url} alt="" className="w-10 h-10 object-cover" /> : g.name?.[0]?.toUpperCase()}
            </button>
            <button onClick={() => navigate(`/groups/${g.id}`)} className="flex-1 min-w-0 text-left">
              <p className="text-[12px] font-bold text-navy dark:text-white truncate">{g.name}</p>
              <p className="text-[10px] text-gray-500">{g.member_count} members</p>
            </button>
            {data.is_owner && (
              <button onClick={() => unlink(g.id)} className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 flex items-center justify-center">
                <X size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      {showLink && (
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={() => setShowLink(false)}>
          <div onClick={e => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-2xl max-h-[80vh] overflow-y-auto animate-slide-up">
            <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between sticky top-0 bg-white dark:bg-darkcard">
              <p className="text-[13px] font-bold text-navy dark:text-white">Link a group</p>
              <button onClick={() => setShowLink(false)}><X size={18} /></button>
            </div>
            <div className="p-3">
              {linkable.length === 0 && <p className="text-center text-[11px] text-gray-500 py-4">No linkable groups. You must be an admin of a group to link it.</p>}
              {linkable.map(g => (
                <button key={g.id} onClick={() => link(g.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-darkbg mb-2 text-left">
                  <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold overflow-hidden">
                    {g.avatar_url ? <img src={g.avatar_url} alt="" className="w-9 h-9 object-cover" /> : g.name?.[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-[12px] font-bold text-navy dark:text-white">{g.name}</p>
                    <p className="text-[10px] text-gray-500">{g.member_count} members</p>
                  </div>
                </Link2>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
