import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, UserPlus, Sparkles, UserCheck, UserRoundPlus } from 'lucide-react';
import FollowRow from '../components/FollowRow';
import { d1Me, d1Request } from '../lib/d1Api';

type Tab = 'following' | 'followers' | 'friends' | 'requests' | 'suggestions';
export default function Follow() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('following');
  const [following, setFollowing] = useState<any[]>([]);
  const [followers, setFollowers] = useState<any[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const me = await d1Me();
      const userId = me.user.id;
      const [followingResult, followersResult, friendsResult, requestsResult, suggestionsResult] = await Promise.all([
        d1Request<{data:any[]}>(`/api/profiles/${encodeURIComponent(userId)}/following`),
        d1Request<{data:any[]}>(`/api/profiles/${encodeURIComponent(userId)}/followers`),
        d1Request<{data:any[]}>('/api/me/friends'),
        d1Request<{data:any[]}>('/api/me/follow-requests'),
        d1Request<{data:any[]}>('/api/profiles/suggestions'),
      ]);
      setFollowing(followingResult.data || []);
      setFollowers(followersResult.data || []);
      setFriends(friendsResult.data || []);
      setRequests(requestsResult.data || []);
      setSuggestions(suggestionsResult.data || []);
    } catch (error: any) { alert(error.message || 'Could not load follow data'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const acceptRequest = async (userId: string) => {
    try {
      await d1Request('/api/me/follow-requests/' + encodeURIComponent(userId) + '/accept', { method: 'POST' });
      const accepted = requests.find(row => row.id === userId);
      setRequests(current => current.filter(row => row.id !== userId));
      if (accepted) {
        setFollowing(current => [{ ...accepted, is_followed_by_me: true }, ...current]);
        setFriends(current => [accepted, ...current]);
      }
    } catch (error: any) { alert(error.message || 'Could not accept request'); }
  };
  const ignoreRequest = async (userId: string) => {
    try {
      await d1Request('/api/me/follow-requests/' + encodeURIComponent(userId), { method: 'DELETE' });
      setRequests(current => current.filter(row => row.id !== userId));
    } catch (error: any) { alert(error.message || 'Could not ignore request'); }
  };
  const unfollow = (userId: string) => {
    setFollowing(current => current.filter(row => row.id !== userId));
    setFollowers(current => current.map(row => row.id === userId ? { ...row, is_followed_by_me: false } : row));
  };
  if (loading) return <div className="p-4 text-center text-xs">Loading follow data…</div>;

  const counts = { following: following.length, followers: followers.length, friends: friends.length, requests: requests.length, suggestions: suggestions.length };
  const tabs: Tab[] = ['following', 'followers', 'friends', 'requests', 'suggestions'];
  return <div className="px-3 py-3 pb-24">
    <div className="flex items-center gap-2 mb-3"><button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18}/></button><h1 className="text-base font-bold text-navy dark:text-white">People</h1></div>
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-1 bg-gray-100 dark:bg-darkcard rounded-xl p-1 mb-3">
      {tabs.map(key => <button key={key} onClick={() => setTab(key)} className={`py-2 text-[10px] font-bold rounded-lg capitalize ${tab === key ? 'bg-white dark:bg-darkbg text-navy dark:text-white shadow-sm' : 'text-gray-500'}`}>{key}{counts[key] > 0 && <span className="ml-1 text-[9px] opacity-70">{counts[key]}</span>}</button>)}
    </div>
    {tab === 'following' && <>{following.length === 0 && <div className="bg-white dark:bg-darkcard rounded-2xl p-6 text-center shadow-sm"><UserCheck size={28} className="mx-auto text-gray-400 mb-2"/><p className="text-[11px] font-bold text-navy dark:text-white">You are not following anyone yet</p></div>}{following.map(user => <FollowRow key={user.id} user={{...user,is_followed_by_me:true}} onFollowChanged={now => { if (!now) unfollow(user.id); }}/>)}</>}
    {tab === 'followers' && <>{followers.length === 0 && <div className="bg-white dark:bg-darkcard rounded-2xl p-6 text-center shadow-sm"><UserRoundPlus size={28} className="mx-auto text-gray-400 mb-2"/><p className="text-[11px] font-bold text-navy dark:text-white">No followers yet</p></div>}{followers.map(user => <FollowRow key={user.id} user={user}/>)}</>}
    {tab === 'friends' && <>{friends.length === 0 && <div className="bg-white dark:bg-darkcard rounded-2xl p-6 text-center shadow-sm"><Users size={28} className="mx-auto text-gray-400 mb-2"/><p className="text-[11px] font-bold text-navy dark:text-white">No mutual follows yet</p></div>}{friends.map(user => <FollowRow key={user.id} user={{...user,is_followed_by_me:true}}/>)}</>}
    {tab === 'requests' && <>{requests.length === 0 && <div className="bg-white dark:bg-darkcard rounded-2xl p-6 text-center shadow-sm"><UserPlus size={28} className="mx-auto text-gray-400 mb-2"/><p className="text-[11px] font-bold text-navy dark:text-white">No follow requests</p></div>}{requests.map(user => <FollowRow key={user.id} user={user} rightSlot={<div className="flex gap-1.5"><button onClick={() => void acceptRequest(user.id)} className="text-[10px] font-bold text-white bg-accent px-3 py-1.5 rounded-lg">Accept</button><button onClick={() => void ignoreRequest(user.id)} className="text-[10px] font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-darkline px-3 py-1.5 rounded-lg">Ignore</button></div>}/>)}</>}
    {tab === 'suggestions' && <>{suggestions.length === 0 && <div className="bg-white dark:bg-darkcard rounded-2xl p-6 text-center shadow-sm"><Sparkles size={28} className="mx-auto text-gray-400 mb-2"/><p className="text-[11px] font-bold text-navy dark:text-white">No suggestions yet</p></div>}{suggestions.map(user => <FollowRow key={user.id} user={{...user,is_followed_by_me:false}} onFollowChanged={now => { if (now) setSuggestions(current => current.filter(row => row.id !== user.id)); }}/>)}</>}
  </div>;
}
