import { useEffect, useState } from 'react';
import { d1Request } from '../lib/d1Api';
import { ClipboardList, MessageCircle, ShieldCheck, Clock, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const LABELS: Record<string,string> = {
  supabase_engineer:'Supabase Engineer', d1_engineer:'D1 Engineer',
  application_code_engineer:'Application Code Engineer', security_engineer:'Security Engineer',
  ui_ux_designer:'UI/UX Designer',
};

export default function EngineeringPanel() {
  const navigate=useNavigate();
  const [profile,setProfile]=useState<any>(null);
  const [tasks,setTasks]=useState<any[]>([]);
  const [members,setMembers]=useState<any[]>([]);
  const [taskTitle,setTaskTitle]=useState('');
  const [taskDescription,setTaskDescription]=useState('');
  const [taskAssignee,setTaskAssignee]=useState('');
  const [taskDue,setTaskDue]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notes,setNotes]=useState<Record<string,string>>({});
  const [evidence,setEvidence]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState<string|null>(null);

  const load=async()=>{
    setLoading(true);setError('');
    try {
      const [p,t]=await Promise.all([
        d1Request<{data:any}>('/api/engineering/profile'),
        d1Request<{data:any}>('/api/engineering/tasks'),
      ]);
      if(!p.data?.ok)throw new Error('Active engineering appointment required.');
      if(!t.data?.ok)throw new Error('Could not load engineering tasks.');
      setProfile(p.data);setTasks(t.data.tasks||[]);
      if((p.data.appointments||[]).some((a:any)=>a.is_lead)){
        const roster=await d1Request<{data:any}>('/api/team/chat/members');
        setMembers(roster.data?.ok?roster.data.members||[]:[]);
      }
    } catch(e:any){setError(e?.message||'Could not load engineering workspace.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[]);

  const update=async(task:any,status:string)=>{
    setBusy(task.id);setError('');
    try{
      const r=await d1Request<{data:any}>(`/api/engineering/tasks/${task.id}`,{method:'PATCH',body:JSON.stringify({status,body:notes[task.id]?.trim()||null,attachment_url:evidence[task.id]?.trim()||null})});
      if(!r.data?.ok)throw new Error('Task update failed.');
      setNotes(v=>({...v,[task.id]:''}));setEvidence(v=>({...v,[task.id]:''}));
      await load();
    }catch(e:any){setError(e?.message||'Could not update task.');}
    finally{setBusy(null);}
  };

  const assignEngineeringTask=async()=>{
    if(!taskTitle.trim()||!taskAssignee)return;
    setBusy('assign');setError('');
    try{
      const r=await d1Request<{data:any}>('/api/engineering/tasks',{method:'POST',body:JSON.stringify({title:taskTitle.trim(),description:taskDescription.trim(),assigned_to_user_id:taskAssignee,due_at:taskDue?new Date(taskDue).toISOString():null})});
      if(!r.data?.ok)throw new Error('Task assignment failed.');
      setTaskTitle('');setTaskDescription('');setTaskAssignee('');setTaskDue('');
      await load();
    }catch(e:any){setError(e?.message||'Could not assign engineering task.');}
    finally{setBusy(null);}
  };

  if(loading)return <div className="p-8 text-center text-xs text-gray-500">Loading engineering workspace...</div>;
  if(error&&!profile)return <div className="max-w-3xl mx-auto p-4"><p role="alert" className="rounded-xl bg-red-50 text-red-700 p-3 text-xs">{error}</p><button onClick={()=>navigate('/home')} className="mt-3 text-xs font-bold text-accent">Back to app</button></div>;

  return <div className="max-w-4xl mx-auto pb-24 space-y-3">
    <header className="bg-white dark:bg-darkcard rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 text-accent"><ShieldCheck size={18}/><span className="text-[10px] font-bold uppercase tracking-wider">Engineering Department</span></div>
      <h2 className="text-xl font-black text-navy dark:text-white mt-2">My Engineering Workspace</h2>
      <p className="text-[10px] text-gray-500 mt-1">Your engineering appointments are separate from your CenPaya app account role.</p>
    </header>
    {(profile?.appointments||[]).map((a:any)=><section key={a.id} className="bg-white dark:bg-darkcard rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-black text-navy dark:text-white">{LABELS[a.role]||a.role}</h3>{a.is_lead&&<span className="text-[9px] font-bold rounded-full px-2 py-1 bg-amber-100 text-amber-800">Lead Engineer</span>}</div>
      <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-2">{a.description}</p>
    </section>)}
    {(profile?.appointments||[]).some((a:any)=>a.is_lead)&&<section className="bg-white dark:bg-darkcard rounded-xl p-4 shadow-sm space-y-2">
      <h3 className="text-sm font-bold text-navy dark:text-white">Lead Engineer · Assign work</h3>
      <p className="text-[10px] text-gray-500">You can assign and review tasks for active engineering members only.</p>
      <select value={taskAssignee} onChange={e=>setTaskAssignee(e.target.value)} className="w-full p-2.5 rounded-lg bg-gray-50 dark:bg-darkbg text-xs">
        <option value="">Select an engineering teammate</option>
        {members.filter(m=>m.id!==profile?.user_id&&(m.engineering_roles||[]).length>0).map(m=><option key={m.id} value={m.id}>@{m.username}</option>)}
      </select>
      <input value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} maxLength={160} placeholder="Task title" className="w-full p-2.5 rounded-lg bg-gray-50 dark:bg-darkbg text-xs"/>
      <textarea value={taskDescription} onChange={e=>setTaskDescription(e.target.value)} maxLength={5000} rows={3} placeholder="Instructions and expected result" className="w-full p-2.5 rounded-lg bg-gray-50 dark:bg-darkbg text-xs"/>
      <input type="datetime-local" value={taskDue} onChange={e=>setTaskDue(e.target.value)} className="w-full p-2.5 rounded-lg bg-gray-50 dark:bg-darkbg text-xs"/>
      <button disabled={busy==='assign'||!taskAssignee||!taskTitle.trim()} onClick={()=>void assignEngineeringTask()} className="w-full bg-accent text-white rounded-lg p-3 text-xs font-bold disabled:opacity-50">{busy==='assign'?'Assigning...':'Assign engineering task'}</button>
    </section>}
    <section className="bg-white dark:bg-darkcard rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-navy dark:text-white flex items-center gap-2"><ClipboardList size={16}/> My assigned engineering tasks</h3><span className="text-[10px] text-gray-500">{tasks.length} tasks</span></div>
      {error&&<p role="alert" className="text-xs text-red-600 mt-2">{error}</p>}
      {tasks.length===0?<div className="py-8 text-center text-xs text-gray-500">No engineering tasks assigned yet.</div>:<div className="space-y-3 mt-3">
        {tasks.map(task=><article key={task.id} className="border border-gray-100 dark:border-darkline rounded-xl p-3">
          <div className="flex items-start justify-between gap-2"><h4 className="text-xs font-bold text-navy dark:text-white">{task.title}</h4><span className="text-[9px] rounded-full px-2 py-1 bg-gray-100 dark:bg-darkline">{String(task.status).replace('_',' ')}</span></div>
          {task.description&&<p className="text-[11px] text-gray-600 dark:text-gray-300 mt-2 whitespace-pre-wrap">{task.description}</p>}
          {task.due_at&&<p className="text-[9px] text-gray-500 mt-2 flex items-center gap-1"><Clock size={11}/> Due {new Date(task.due_at).toLocaleString()}</p>}
          <textarea value={notes[task.id]||''} onChange={e=>setNotes(v=>({...v,[task.id]:e.target.value}))} rows={2} maxLength={5000} placeholder="Progress update, blockers or completion report..." className="w-full mt-3 p-2 rounded-lg bg-gray-50 dark:bg-darkbg text-xs"/>
          <input value={evidence[task.id]||''} onChange={e=>setEvidence(v=>({...v,[task.id]:e.target.value}))} maxLength={2048} placeholder="HTTPS evidence / PR / document link (optional)" className="w-full mt-2 p-2 rounded-lg bg-gray-50 dark:bg-darkbg text-xs"/>
          <div className="flex flex-wrap gap-2 mt-2">
            {(['in_progress','blocked','submitted'] as string[]).filter(s=>s!==task.status).map(s=><button key={s} disabled={busy===task.id} onClick={()=>void update(task,s)} className="rounded-lg px-3 py-2 text-[10px] font-bold bg-accent/10 text-accent disabled:opacity-50">{busy===task.id?'Saving...':s==='in_progress'?'Start work':s==='blocked'?'Report blocker':'Submit for review'}</button>)}
          </div>
          {(task.updates||[]).slice(-3).map((u:any)=><p key={u.id} className="text-[9px] text-gray-500 mt-2">{u.body||u.update_type} · {new Date(u.created_at).toLocaleString()}</p>)}
        </article>)}
      </div>}
    </section>
    <button onClick={()=>navigate('/staff/team')} className="w-full bg-accent text-white rounded-xl p-3 text-xs font-bold flex items-center justify-center gap-2"><MessageCircle size={15}/> Open shared team communication</button>
  </div>;
}
