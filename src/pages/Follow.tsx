import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, UserPlus, Sparkles, UserCheck, UserRoundPlus, UsersRound } from 'lucide-react';
import FollowRow from '../components/FollowRow';
import { d1Request } from '../lib/d1Api';
import { getCachedUser } from '../lib/cache';

type Tab = 'followers' | 'following' | 'friends' | 'requests' | 'suggestions';
export default function Follow() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('followers');
  const [followers, setFollowers] = useState<any[]>([]);
  const [following, setFollowing] = useState<any[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const me = await getCachedUser();
      if (!me?.id) throw new Error('Please sign in to view your social connections.');
      const [followersResult, followingResult, friendsResult, requestsResult, suggestionsResult] = await Promise.all([
        d1Request<{data:any[]}>(`/api/profiles/${encodeURIComponent(me.id)}/followers`),
        d1Request<{data:any[]}>('/api/me/following'),
        d1Request<{data:any[]}>('/api/me/friends'),
        d1Request<{data:any[]}>('/api/me/follow-requests'),
        d1Request<{data:any[]}>('/api/profiles/suggestions'),
      ]);
      setFollowers(followersResult.data || []);
      setFollowing(followingResult.data || []);
      setFriends(friendsResult.data || []);
      setRequests(requestsResult.data || []);
      setSuggestions((suggestionsResult.data || []).filter((u:any) => u.id !== me.id));
    } catch (error: any) {
      setError(error.message || 'Could not load your social connections.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const acceptRequest = async (userId: string) => {
    try {
      await d1Request('/api/me/follow-requests/' + encodeURIComponent(userId) + '/accept', { method: 'POST' });
      setRequests(p => p.filter(r => r.id !== userId));
      await load();
    } catch (e: any) { setError(e.message || 'Could not accept request'); }
  };
  const ignoreRequest = async (userId: string) => {
    try {
      await d1Request('/api/me/follow-requests/' + encodeURIComponent(userId), { method: 'DELETE' });
      setRequests(p => p.filter(r => r.id !== userId));
    } catch (e: any) { setError(e.message || 'Could not ignore request'); }
  };

  const counts: Record<Tab, number> = {
    followers: followers.length, following: following.length, friends: friends.length,
    requests: requests.length, suggestions: suggestions.length,
  };
  const tabs: {key:Tab;label:string}[] = [
    {key:'followers',label:'Followers'},{key:'following',label:'Following'},
    {key:'friends',label:'Friends'},{key:'requests',label:'Requests'},{key:'suggestions',label:'Discover'},
  ];

  if (loading) return <div className="p-6 text-center text-xs text-gray-500">Loading your connections…</div>;

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2"><button onClick={()=>navigate(-1)} className="text-brand"><ArrowLeft size={18}/></button><h1 className="text-base font-bold text-navy dark:text-white">Your social network</h1></div>
        <button onClick={() => void load()} className="text-[10px] font-bold text-brand">Refresh</button>
      </div>
      <div className="flex gap-1 overflow-x-auto scrollbar-hide bg-gray-100 dark:bg-darkcard rounded-xl p-1 mb-4">
        {tabs.map(item=><button key={item.key} onClick={()=>setTab(item.key)} className={`shrink-0 px-3 py-2 text-[10px] font-bold rounded-lg ${tab===item.key?'bg-white dark:bg-darkbg text-navy dark:text-white shadow-sm':'text-gray-500'}`}>{item.label}{counts[item.key]>0&&<span className="ml-1 opacity-70">{counts[item.key]}</span>}</button>)}
      </div>
      {error && <p className="text-xs text-red-600 bg-red-50 p-3 rounded-xl mb-3">{error}</p>}
      {tab==='followers' && <>{followers.length===0?<Empty icon={<Users size={26}/>} title="No followers yet" detail="People who follow your profile will appear here."/>:followers.map(u=><FollowRow key={u.id} user={u}/>)}</>}
      {tab==='following' && <>{following.length===0?<Empty icon={<UserPlus size={26}/>} title="You are not following anyone" detail="Discover creators and people whose posts you enjoy."/>:following.map(u=><FollowRow key={u.id} user={u} onFollowChanged={now=>{if(!now)setFollowing(p=>p.filter(x=>x.id!==u.id));}}/>)}</>}
      {tab==='friends' && <>{friends.length===0?<Empty icon={<UsersRound size={26}/>} title="No mutual connections yet" detail="When you and another person follow each other, you become friends on Cenpaya."/>:friends.map(u=><FollowRow key={u.id} user={{...u,is_followed_by_me:true}}/>)}</>}
      {tab==='requests' && <>{requests.length===0?<Empty icon={<UserCheck size={26}/>} title="No follow requests" detail="Requests that need your response will appear here."/>:requests.map(u=><FollowRow key={u.id} user={u} rightSlot={<div className="flex gap-1.5"><button onClick={()=>acceptRequest(u.id)} className="text-[10px] font-bold text-white bg-accent px-3 py-1.5 rounded-lg">Accept</button><button onClick={()=>ignoreRequest(u.id)} className="text-[10px] font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-darkline px-3 py-1.5 rounded-lg">Ignore</button></div>}/>)}</>}
      {tab==='suggestions' && <>{suggestions.length===0?<Empty icon={<Sparkles size={26}/>} title="No suggestions right now" detail="New people will appear as the community grows."/>:suggestions.map(u=><FollowRow key={u.id} user={{...u,is_followed_by_me:false}} onFollowChanged={now=>{if(now)setSuggestions(p=>p.filter(x=>x.id!==u.id));}}/>)}</>}
      <div className="flex items-start gap-2 mt-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-900 dark:text-emerald-100"><UserRoundPlus size={15} className="shrink-0 mt-0.5"/><p className="text-[10px] leading-relaxed">Following is one-way. When two people follow each other, Cenpaya recognises the mutual connection as a friendship and ranks each other's eligible posts more prominently.</p></div>
    </div>
  );
}

function Empty({icon,title,detail}:{icon:React.ReactNode;title:string;detail:string}) {
  return <div className="bg-white dark:bg-darkcard rounded-2xl p-6 text-center shadow-sm"><div className="mx-auto text-gray-400 mb-2 flex justify-center">{icon}</div><p className="text-[12px] font-bold text-navy dark:text-white">{title}</p><p className="text-[10px] text-gray-500 mt-1">{detail}</p></div>;
}
