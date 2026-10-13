import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, UserPlus, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';
import FollowRow from '../components/FollowRow';

type Tab = 'friends' | 'requests' | 'suggestions';

export default function Follow() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const me = await getCachedUser();
    if (!me) { setLoading(false); return; }

    const [reqRes, sugRes, mutualRes] = await Promise.all([
      supabase.rpc('get_friend_requests'),
      supabase.rpc('get_suggestions', { p_limit: 50 }),
      // friends = mutual follows: I follow X and X follows me
      supabase
        .from('user_follows')
        .select('followed_id, users!user_follows_followed_id_fkey(id, username, avatar_url)')
        .eq('follower_id', me.id),
    ]);

    // requests
    if (reqRes.data?.ok) setRequests(reqRes.data.requests || []);

    // suggestions
    if (sugRes.data?.ok) setSuggestions(sugRes.data.suggestions || []);

    // friends — filter following list to only those who follow me back
    const followingIds = (mutualRes.data || []).map((r: any) => r.followed_id);
    if (followingIds.length > 0) {
      const { data: backFollows } = await supabase
        .from('user_follows')
        .select('follower_id')
        .eq('followed_id', me.id)
        .in('follower_id', followingIds);

      const mutualIds = new Set((backFollows || []).map((b: any) => b.follower_id));
      const friendList = (mutualRes.data || [])
        .filter((r: any) => mutualIds.has(r.followed_id))
        .map((r: any) => ({
          id: r.users.id,
          username: r.users.username,
          avatar_url: r.users.avatar_url,
          is_followed_by_me: true,
        }));
      setFriends(friendList);
    } else {
      setFriends([]);
    }

    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const acceptRequest = async (userId: string) => {
    const me = await getCachedUser();
    if (!me) return;
    const { error } = await supabase
      .from('user_follows')
      .insert({ follower_id: me.id, followed_id: userId });
    if (!error) {
      setRequests(prev => prev.filter(r => r.id !== userId));
      // add to friends
      const accepted = requests.find(r => r.id === userId);
      if (accepted) setFriends(prev => [{ ...accepted, is_followed_by_me: true }, ...prev]);
    }
  };

  const ignoreRequest = (userId: string) => {
    setRequests(prev => prev.filter(r => r.id !== userId));
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  const counts = {
    friends: friends.length,
    requests: requests.length,
    suggestions: suggestions.length,
  };

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">Follow</h1>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 dark:bg-darkcard rounded-xl p-1 mb-3">
        {(['friends', 'requests', 'suggestions'] as Tab[]).map(k => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 py-2 text-[11px] font-bold rounded-lg capitalize ${
              tab === k ? 'bg-white dark:bg-darkbg text-navy dark:text-white shadow-sm' : 'text-gray-500'
            }`}
          >
            {k}
            {counts[k] > 0 && (
              <span className="ml-1 text-[9px] opacity-70">{counts[k]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Friends */}
      {tab === 'friends' && (
        <>
          {friends.length === 0 && (
            <div className="bg-white dark:bg-darkcard rounded-2xl p-6 text-center shadow-sm">
              <Users size={28} className="mx-auto text-gray-400 mb-2" />
              <p className="text-[11px] font-bold text-navy dark:text-white">No friends yet</p>
              <p className="text-[9px] text-gray-500 mt-1">Mutual follows show up here.</p>
            </div>
          )}
          {friends.map(u => (
            <FollowRow
              key={u.id}
              user={u}
              onFollowChanged={(now) => {
                if (!now) setFriends(prev => prev.filter(f => f.id !== u.id));
              }}
            />
          ))}
        </>
      )}

      {/* Requests */}
      {tab === 'requests' && (
        <>
          {requests.length === 0 && (
            <div className="bg-white dark:bg-darkcard rounded-2xl p-6 text-center shadow-sm">
              <UserPlus size={28} className="mx-auto text-gray-400 mb-2" />
              <p className="text-[11px] font-bold text-navy dark:text-white">No follow requests</p>
              <p className="text-[9px] text-gray-500 mt-1">People who follow you will show up here.</p>
            </div>
          )}
          {requests.map((u: any) => (
            <FollowRow
              key={u.id}
              user={{
                id: u.id,
                username: u.username,
                avatar_url: u.avatar_url,
                mutual_count: u.mutual_count,
                is_followed_by_me: false,
              }}
              rightSlot={
                <div className="flex gap-1.5">
                  <button
                    onClick={() => acceptRequest(u.id)}
                    className="text-[10px] font-bold text-white bg-accent px-3 py-1.5 rounded-lg"
                  >
                    Follow
                  </button>
                  <button
                    onClick={() => ignoreRequest(u.id)}
                    className="text-[10px] font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-darkline px-3 py-1.5 rounded-lg"
                  >
                    Ignore
                  </button>
                </div>
              }
            />
          ))}
        </>
      )}

      {/* Suggestions */}
      {tab === 'suggestions' && (
        <>
          {suggestions.length === 0 && (
            <div className="bg-white dark:bg-darkcard rounded-2xl p-6 text-center shadow-sm">
              <Sparkles size={28} className="mx-auto text-gray-400 mb-2" />
              <p className="text-[11px] font-bold text-navy dark:text-white">No suggestions yet</p>
              <p className="text-[9px] text-gray-500 mt-1">Follow more people to get suggestions.</p>
            </div>
          )}
          {suggestions.map((u: any) => (
            <FollowRow
              key={u.id}
              user={{
                id: u.id,
                username: u.username,
                avatar_url: u.avatar_url,
                mutual_count: u.mutual_count,
                is_followed_by_me: false,
              }}
              onFollowChanged={(now) => {
                if (now) setSuggestions(prev => prev.filter(s => s.id !== u.id));
              }}
            />
          ))}
        </>
      )}
    </div>
  );
      }
