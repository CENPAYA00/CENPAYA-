import { useEffect,useState } from 'react';
import { d1Request } from '../lib/d1Api';
import { MessageCircle,Send,Plus,Users,RefreshCw } from 'lucide-react';

export default function TeamCommunications(){
 const [conversations,setConversations]=useState<any[]>([]);
 const [members,setMembers]=useState<any[]>([]);
 const [selected,setSelected]=useState<any>(null);
 const [messages,setMessages]=useState<any[]>([]);
 const [body,setBody]=useState('');
 const [attachmentUrl,setAttachmentUrl]=useState('');
 const [selectedMembers,setSelectedMembers]=useState<string[]>([]);
 const [title,setTitle]=useState('');
 const [type,setType]=useState<'direct'|'group'|'announcement'>('direct');
 const [showNew,setShowNew]=useState(false);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');

 const loadConversations=async(preferredId?:string)=>{
  const [c,m]=await Promise.all([
   d1Request<{data:any}>('/api/team/chat/conversations'),
   d1Request<{data:any}>('/api/team/chat/members'),
  ]);
  if(!c.data?.ok)throw new Error('Could not load team conversations.');
  setConversations(c.data.conversations||[]);
  setMembers(m.data?.members||[]);
  const next=(c.data.conversations||[]).find((x:any)=>x.id===(preferredId||selected?.id))
    ||(c.data.conversations||[]).find((x:any)=>x.id===c.data.general_conversation_id)
    ||(c.data.conversations||[])[0]||null;
  if(next)setSelected(next);
  else {setSelected(null);setMessages([]);}
  return next;
 };
 const loadMessages=async(id:string)=>{
  const r=await d1Request<{data:any}>(`/api/team/chat/conversations/${id}/messages`);
  if(!r.data?.ok)throw new Error('Could not load this team conversation.');
  setMessages(r.data.messages||[]);
 };
 useEffect(()=>{
  let active=true;
  (async()=>{try{const next=await loadConversations();if(active&&next)await loadMessages(next.id);}catch(e:any){if(active)setError(e?.message||'Team chat is unavailable.');}finally{if(active)setLoading(false);}})();
  return()=>{active=false;};
 },[]);
 useEffect(()=>{
  if(!selected?.id)return;
  void loadMessages(selected.id).catch(e=>setError(e?.message||'Could not refresh messages.'));
  const timer=window.setInterval(()=>{void loadMessages(selected.id).catch(()=>{});},6000);
  return()=>window.clearInterval(timer);
 },[selected?.id]);

 const createConversation=async()=>{
  setError('');
  if(type==='direct'&&selectedMembers.length!==1){setError('Choose exactly one recipient for a direct message.');return;}
  if(type==='group'&&selectedMembers.length<1){setError('Choose at least one teammate for a group conversation.');return;}
  setBusy(true);
  try{
   const r=await d1Request<{data:any}>('/api/team/chat/conversations',{method:'POST',body:JSON.stringify({type,title:title.trim(),member_ids:selectedMembers})});
   if(!r.data?.ok)throw new Error('Could not create team conversation.');
   const next=await loadConversations(r.data.conversation_id);
   if(next)await loadMessages(next.id);
   setShowNew(false);setSelectedMembers([]);setTitle('');
  }catch(e:any){setError(e?.message||'Could not create conversation.');}
  finally{setBusy(false);}
 };
 const send=async()=>{
  if(!selected?.id||!body.trim())return;
  setBusy(true);setError('');
  try{
   const r=await d1Request<{data:any}>(`/api/team/chat/conversations/${selected.id}/messages`,{method:'POST',body:JSON.stringify({body:body.trim(),attachment_url:attachmentUrl.trim()||null})});
   if(!r.data?.ok)throw new Error('Message could not be sent.');
   setBody('');setAttachmentUrl('');await loadMessages(selected.id);await loadConversations(selected.id);
  }catch(e:any){setError(e?.message||'Could not send message.');}
  finally{setBusy(false);}
 };
 const memberLabel=(m:any)=>`@${m.username||'member'} · ${String(m.role||'team').replace(/_/g,' ')}${(m.engineering_roles||[]).length?' · Engineering':''}`;
 if(loading)return <div className="p-6 text-center text-xs text-gray-500">Loading D1 team communication...</div>;
 return <div className="max-w-5xl mx-auto pb-24">
  <header className="bg-white dark:bg-darkcard rounded-xl p-4 shadow-sm mb-3 flex items-center justify-between">
   <div><h2 className="text-lg font-black text-navy dark:text-white flex items-center gap-2"><MessageCircle size={18}/> Team communication</h2><p className="text-[10px] text-gray-500">Shared internal chat powered by the CenPaya D1 Worker.</p></div>
   <button onClick={()=>setShowNew(v=>!v)} className="bg-accent text-white rounded-lg px-3 py-2 text-[10px] font-bold flex items-center gap-1"><Plus size={13}/> New</button>
  </header>
  {error&&<p role="alert" className="text-xs text-red-600 bg-red-50 rounded-lg p-3 mb-3">{error}</p>}
  {showNew&&<section className="bg-white dark:bg-darkcard rounded-xl p-4 shadow-sm mb-3 space-y-3">
   <h3 className="text-sm font-bold text-navy dark:text-white">Start team conversation</h3>
   <select value={type} onChange={e=>setType(e.target.value as any)} className="w-full p-2 rounded-lg bg-gray-50 dark:bg-darkbg text-xs">
    <option value="direct">Direct message</option><option value="group">Group discussion</option><option value="announcement">Team announcement (Owner/Super Admin)</option>
   </select>
   <input value={title} onChange={e=>setTitle(e.target.value)} maxLength={120} placeholder="Conversation title (for groups)" className="w-full p-2 rounded-lg bg-gray-50 dark:bg-darkbg text-xs"/>
   <div className="max-h-48 overflow-y-auto space-y-1">
    {members.map(m=><label key={m.id} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-gray-50 dark:bg-darkbg">
     <input type="checkbox" checked={selectedMembers.includes(m.id)} onChange={e=>setSelectedMembers(v=>e.target.checked?[...v,m.id]:v.filter(id=>id!==m.id))}/>
     <span>{memberLabel(m)}</span>
    </label>)}
   </div>
   <button disabled={busy||(type==='direct'&&selectedMembers.length!==1)||(type==='group'&&selectedMembers.length<1)} onClick={()=>void createConversation()} className="w-full bg-accent text-white rounded-lg py-2.5 text-xs font-bold disabled:opacity-50">{busy?'Creating...':'Create conversation'}</button>
  </section>}
  <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-3 min-h-[480px]">
   <aside className="bg-white dark:bg-darkcard rounded-xl shadow-sm p-2 space-y-1">
    <div className="flex items-center justify-between px-2 py-1"><p className="text-[10px] font-bold text-gray-500">YOUR CONVERSATIONS</p><button onClick={()=>void loadConversations().catch(e=>setError(e.message))} className="text-accent"><RefreshCw size={13}/></button></div>
    {conversations.length===0&&<p className="p-4 text-xs text-gray-500 text-center">No conversations yet.</p>}
    {conversations.map(c=><button key={c.id} onClick={()=>setSelected(c)} className={`w-full text-left rounded-lg p-3 ${selected?.id===c.id?'bg-accent/10':'hover:bg-gray-50 dark:hover:bg-darkbg'}`}>
     <p className="text-xs font-bold text-navy dark:text-white truncate">{c.title||c.type}</p><p className="text-[10px] text-gray-500 truncate mt-1">{c.last_message||'No messages yet'}</p>
    </button>)}
   </aside>
   <section className="bg-white dark:bg-darkcard rounded-xl shadow-sm flex flex-col min-h-[480px]">
    {!selected?<div className="flex-1 flex flex-col items-center justify-center text-gray-400"><Users size={28}/><p className="text-xs mt-2">No team conversation available</p></div>:<>
     <div className="p-3 border-b border-gray-100 dark:border-darkline"><p className="text-sm font-bold text-navy dark:text-white">{selected.title||selected.type}</p><p className="text-[9px] text-gray-500">Private internal team conversation</p></div>
     <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[55vh]">
      {messages.map(m=><div key={m.id} className="rounded-xl bg-gray-50 dark:bg-darkbg p-2.5"><p className="text-[9px] font-bold text-accent">@{m.sender_name}</p><p className="text-xs text-navy dark:text-gray-100 whitespace-pre-wrap mt-1">{m.body}</p><p className="text-[8px] text-gray-400 mt-1">{new Date(m.created_at).toLocaleString()}</p>{m.attachment_url&&<a href={m.attachment_url} target="_blank" rel="noreferrer" className="text-[10px] text-accent underline">Open attachment</a>}</div>)}
     </div>
     <form onSubmit={e=>{e.preventDefault();void send();}} className="p-2 border-t border-gray-100 dark:border-darkline space-y-2">
      <input value={body} onChange={e=>setBody(e.target.value)} maxLength={10000} placeholder="Write an internal message..." className="w-full min-w-0 p-2.5 rounded-full bg-gray-50 dark:bg-darkbg text-xs"/>
      <div className="flex gap-2"><input value={attachmentUrl} onChange={e=>setAttachmentUrl(e.target.value)} maxLength={2048} placeholder="HTTPS attachment link" className="flex-1 min-w-0 p-2 rounded-lg bg-gray-50 dark:bg-darkbg text-[10px]"/><button disabled={busy||!body.trim()} className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center disabled:opacity-50"><Send size={14}/></button></div>
     </form>
    </>}
   </section>
  </div>
 </div>;
}
