import { useEffect, useState } from 'react';
import { supabaseWorkerRequest } from '../lib/supabaseWorkerApi';
import { MessageCircle, Send, Plus, Users } from 'lucide-react';

export default function TeamCommunications() {
  const [conversations,setConversations]=useState<any[]>([]);
  const [members,setMembers]=useState<any[]>([]);
  const [selected,setSelected]=useState<any>(null);
  const [messages,setMessages]=useState<any[]>([]);
  const [body,setBody]=useState('');
  const [attachmentUrl,setAttachmentUrl]=useState('');
  const [selectedMembers,setSelectedMembers]=useState<string[]>([]);
  const [title,setTitle]=useState('');
  const [type,setType]=useState<'direct'|'department'|'announcement'|'escalation'>('direct');
  const [showNew,setShowNew]=useState(false);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  const loadConversations=async()=>{
    const [c,m]=await Promise.all([
      supabaseWorkerRequest<{data:any}>('/api/v1/admin/rpc/team_list_conversations',{method:'POST',body:JSON.stringify({args:{}})}),
      supabaseWorkerRequest<{data:any}>('/api/v1/admin/rpc/team_available_colleagues',{method:'POST',body:JSON.stringify({args:{}})}),
    ]);
    if(!c.data?.ok) throw new Error(c.data?.error || 'Could not load team conversations.');
    setConversations(c.data.conversations||[]);
    setMembers(m.data?.ok?m.data.members||[]:[]);
  };
  const loadMessages=async(id:string)=>{
    const r=await supabaseWorkerRequest<{data:any}>('/api/v1/admin/rpc/team_get_messages',{method:'POST',body:JSON.stringify({args:{p_conversation_id:id}})});
    if(!r.data?.ok) throw new Error(r.data?.error || 'Could not load conversation.');
    setMessages(r.data.messages||[]);
  };
  useEffect(()=>{(async()=>{try{await loadConversations();}catch(e:any){setError(e?.message||'Could not load team communications.');}finally{setLoading(false);}})();},[]);
  useEffect(()=>{if(!selected?.id)return;void loadMessages(selected.id);const timer=window.setInterval(()=>{void loadMessages(selected.id).catch(()=>{});},6000);return()=>window.clearInterval(timer);},[selected?.id]);

  const createConversation=async()=>{
    setError('');
    if(selectedMembers.length===0){setError('Choose at least one team member.');return;}
    if(type==='direct' && selectedMembers.length!==1){setError('A direct message must have exactly one recipient.');return;}
    setBusy(true);
    try{
      const r=await supabaseWorkerRequest<{data:any}>('/api/v1/admin/rpc/team_create_conversation',{
        method:'POST',body:JSON.stringify({args:{p_type:type,p_title:title.trim()||null,p_member_ids:selectedMembers,p_department_id:null}})
      });
      if(!r.data?.ok)throw new Error(r.data?.error||'Could not create conversation.');
      await loadConversations();
      const created=(await supabaseWorkerRequest<{data:any}>('/api/v1/admin/rpc/team_list_conversations',{method:'POST',body:JSON.stringify({args:{}})})).data?.conversations||[];
      const next=created.find((x:any)=>x.id===r.data.conversation_id);
      if(next){setSelected(next);await loadMessages(next.id);}
      setShowNew(false);setSelectedMembers([]);setTitle('');
    }catch(e:any){setError(e?.message||'Could not create conversation.');}
    finally{setBusy(false);}
  };
  const send=async()=>{
    if(!selected?.id||!body.trim())return;
    setBusy(true);
    try{
      const r=await supabaseWorkerRequest<{data:any}>('/api/v1/admin/rpc/team_send_message',{
        method:'POST',body:JSON.stringify({args:{p_conversation_id:selected.id,p_body:body.trim(),p_attachment_url:attachmentUrl.trim()||null}})
      });
      if(!r.data?.ok)throw new Error(r.data?.error||'Message could not be sent.');
      setBody('');setAttachmentUrl('');await loadMessages(selected.id);await loadConversations();
    }catch(e:any){setError(e?.message||'Could not send message.');}
    finally{setBusy(false);}
  };

  if(loading)return <div className="p-6 text-center text-xs text-gray-500">Loading internal team communication...</div>;
  return (
    <div className="max-w-5xl mx-auto pb-24">
      <div className="bg-white dark:bg-darkcard rounded-xl p-4 shadow-sm mb-3 flex items-center justify-between">
        <div><h2 className="text-lg font-black text-navy dark:text-white flex items-center gap-2"><MessageCircle size={18}/> Team communication</h2><p className="text-[10px] text-gray-500">Private internal messages, separate from customer conversations.</p></div>
        <button onClick={()=>setShowNew(v=>!v)} className="bg-accent text-white rounded-lg px-3 py-2 text-[10px] font-bold flex items-center gap-1"><Plus size={13}/> New</button>
      </div>
      {error&&<p role="alert" className="text-xs text-red-600 bg-red-50 rounded-lg p-3 mb-3">{error}</p>}
      {showNew&&<section className="bg-white dark:bg-darkcard rounded-xl p-4 shadow-sm mb-3 space-y-3">
        <h3 className="text-sm font-bold text-navy dark:text-white">Start internal conversation</h3>
        <select value={type} onChange={e=>setType(e.target.value as any)} className="w-full p-2 rounded-lg border border-gray-200 dark:border-darkline bg-gray-50 dark:bg-darkbg text-xs">
          <option value="direct">Direct message</option><option value="department">Department group</option><option value="announcement">Announcement</option><option value="escalation">Escalation discussion</option>
        </select>
        <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Conversation title (optional)" className="w-full p-2 rounded-lg border border-gray-200 dark:border-darkline bg-gray-50 dark:bg-darkbg text-xs"/>
        <div className="max-h-40 overflow-y-auto space-y-1">
          {members.map(m=><label key={m.id} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-gray-50 dark:bg-darkbg"><input type="checkbox" checked={selectedMembers.includes(m.id)} onChange={e=>setSelectedMembers(prev=>e.target.checked?[...prev,m.id]:prev.filter(id=>id!==m.id))}/><span>@{m.username}</span><span className="ml-auto text-[9px] text-gray-500">{m.role.replace('_',' ')}</span></label>)}
        </div>
        <button disabled={busy||selectedMembers.length===0} onClick={()=>void createConversation()} className="w-full bg-accent text-white rounded-lg py-2.5 text-xs font-bold disabled:opacity-50">{busy?'Creating...':'Create conversation'}</button>
      </section>}
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-3 min-h-[480px]">
        <aside className="bg-white dark:bg-darkcard rounded-xl shadow-sm p-2 space-y-1">
          {conversations.length===0&&<p className="p-4 text-xs text-gray-500 text-center">No internal conversations yet.</p>}
          {conversations.map(c=><button key={c.id} onClick={()=>setSelected(c)} className={`w-full text-left rounded-lg p-3 ${selected?.id===c.id?'bg-accent/10':'hover:bg-gray-50 dark:hover:bg-darkbg'}`}>
            <p className="text-xs font-bold text-navy dark:text-white truncate">{c.title||c.type}</p><p className="text-[10px] text-gray-500 truncate mt-1">{c.last_message||'No messages yet'}</p>
          </button>)}
        </aside>
        <section className="bg-white dark:bg-darkcard rounded-xl shadow-sm flex flex-col min-h-[480px]">
          {!selected?<div className="flex-1 flex flex-col items-center justify-center text-gray-400"><Users size={28}/><p className="text-xs mt-2">Select a team conversation</p></div>:<>
            <div className="p-3 border-b border-gray-100 dark:border-darkline"><p className="text-sm font-bold text-navy dark:text-white">{selected.title||selected.type}</p><p className="text-[9px] text-gray-500">Internal team conversation</p></div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[55vh]">
              {messages.map(m=><div key={m.id} className="rounded-xl bg-gray-50 dark:bg-darkbg p-2.5"><p className="text-[9px] font-bold text-accent">@{m.sender_name}</p><p className="text-xs text-navy dark:text-gray-100 whitespace-pre-wrap mt-1">{m.body}</p><p className="text-[8px] text-gray-400 mt-1">{new Date(m.created_at).toLocaleString()}</p>{m.attachment_url&&<a href={m.attachment_url} target="_blank" rel="noreferrer" className="text-[10px] text-accent underline">Open attachment</a>}</div>)}
            </div>
            <form onSubmit={e=>{e.preventDefault();void send();}} className="p-2 border-t border-gray-100 dark:border-darkline space-y-2"><input value={body} onChange={e=>setBody(e.target.value)} maxLength={10000} placeholder="Write an internal message..." className="w-full min-w-0 p-2.5 rounded-full bg-gray-50 dark:bg-darkbg text-xs"/><div className="flex gap-2"><input value={attachmentUrl} onChange={e=>setAttachmentUrl(e.target.value)} placeholder="Attachment link (document, screenshot or report)" className="flex-1 min-w-0 p-2 rounded-lg bg-gray-50 dark:bg-darkbg text-[10px]"/><button disabled={busy||!body.trim()} className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center disabled:opacity-50"><Send size={14}/></button></div></form>
          </>}
        </section>
      </div>
    </div>
  );
}
