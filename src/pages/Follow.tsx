import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, UserPlus, Sparkles } from 'lucide-react';
import FollowRow from '../components/FollowRow';
import { d1Request } from '../lib/d1Api';

type Tab = 'friends' | 'requests' | 'suggestions';
export default function Follow() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    try {
      const [friendsResult, requestsResult, suggestionsResult] = await Promise.all([
        d1Request<{data:any[]}>('/api/me/friends'),
        d1Request<{data:any[]}>('/api/me/follow-requests'),
        d1Request<{data:any[]}>('/api/profiles/suggestions'),
      ]);
      setFriends(friendsResult.data || []);
      setRequests(requestsResult.data || []);
      setSuggestions(suggestionsResult.data || []);
    } catch (error: any) { alert(error.message || 'Could not load follow data'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const acceptRequest = async (userId: string) => {
    try { await d1Request('/api/me/follow-requests/' + encodeURIComponent(userId) + '/accept', { method: 'POST' }); setRequests(p=>p.filter(r=>r.id!==userId)); const u=requests.find(r=>r.id===userId); if(u)setFriends(p=>[u,...p]); }
    catch(e:any){alert(e.message||'Could not accept request');}
  };
  const ignoreRequest = async (userId: string) => {
    try { await d1Request('/api/me/follow-requests/' + encodeURIComponent(userId), { method: 'DELETE' }); setRequests(p=>p.filter(r=>r.id!==userId)); }
    catch(e:any){alert(e.message||'Could not ignore request');}
  };
  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;
  const counts = { friends: friends.length, requests: requests.length, suggestions: suggestions.length };
  return <div className="px-3 py-3 pb-24">
    <div className="flex items-center gap-2 mb-3"><button onClick={()=>navigate(-1)} className="text-brand"><ArrowLeft size={18}/></button><h1 className="text-base font-bold text-navy dark:text-white">Follow</h1></div>
    <div className="flex bg-gray-100 dark:bg-darkcard rounded-xl p-1 mb-3">{(['friends','requests','suggestions'] as Tab[]).map(k=><button key={k} onClick={()=>setTab(k)} className={`flex-1 py-2 text-[11px] font-bold rounded-lg capitalize ${tab===k?'bg-white dark:bg-darkbg text-navy dark:text-white shadow-sm':'text-gray-500'}`}>{k}{counts[k]>0&&<span className="ml-1 text-[9px] opacity-70">{counts[k]}</span>}</button>)}</div>
    {tab==='friends'&&<>{friends.length===0&&<div className="bg-white dark:bg-darkcard rounded-2xl p-6 text-center shadow-sm"><Users size={28} className="mx-auto text-gray-400 mb-2"/><p className="text-[11px] font-bold text-navy dark:text-white">No friends yet</p><p className="text-[9px] text-gray-500 mt-1">Mutual follows show up here.</p></div>}{friends.map(u=><FollowRow key={u.id} user={u}/>)}</>}
    {tab==='requests'&&<>{requests.length===0&&<div className="bg-white dark:bg-darkcard rounded-2xl p-6 text-center shadow-sm"><UserPlus size={28} className="mx-auto text-gray-400 mb-2"/><p className="text-[11px] font-bold text-navy dark:text-white">No follow requests</p></div>}{requests.map(u=><FollowRow key={u.id} user={u} rightSlot={<div className="flex gap-1.5"><button onClick={()=>acceptRequest(u.id)} className="text-[10px] font-bold text-white bg-accent px-3 py-1.5 rounded-lg">Accept</button><button onClick={()=>ignoreRequest(u.id)} className="text-[10px] font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-darkline px-3 py-1.5 rounded-lg">Ignore</button></div>}/>)}</>}
    {tab==='suggestions'&&<>{suggestions.length===0&&<div className="bg-white dark:bg-darkcard rounded-2xl p-6 text-center shadow-sm"><Sparkles size={28} className="mx-auto text-gray-400 mb-2"/><p className="text-[11px] font-bold text-navy dark:text-white">No suggestions yet</p></div>}{suggestions.map(u=><FollowRow key={u.id} user={{...u,is_followed_by_me:false}} onFollowChanged={now=>{if(now)setSuggestions(p=>p.filter(x=>x.id!==u.id));}}/>)}</>}
  </div>;
}
