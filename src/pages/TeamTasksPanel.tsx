import { useEffect, useState } from 'react';
import { supabaseWorkerRequest } from '../lib/supabaseWorkerApi';
import { ClipboardList, Plus, Clock, CheckCircle2 } from 'lucide-react';

export default function TeamTasksPanel() {
  const [profile,setProfile] = useState<any>(null);
  const [tasks,setTasks] = useState<any[]>([]);
  const [members,setMembers] = useState<any[]>([]);
  const [title,setTitle] = useState('');
  const [description,setDescription] = useState('');
  const [assignee,setAssignee] = useState('');
  const [dueAt,setDueAt] = useState('');
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [p,t,m] = await Promise.all([
        supabaseWorkerRequest<{data:any}>('/api/v1/admin/rpc/staff_my_profile',{method:'POST',body:JSON.stringify({args:{}})}),
        supabaseWorkerRequest<{data:any}>('/api/v1/admin/rpc/team_my_tasks',{method:'POST',body:JSON.stringify({args:{}})}),
        supabaseWorkerRequest<{data:any}>('/api/v1/admin/rpc/team_available_colleagues',{method:'POST',body:JSON.stringify({args:{}})}),
      ]);
      if (!p.data?.ok) throw new Error(p.data?.error || 'Active team appointment required.');
      if (!t.data?.ok) throw new Error(t.data?.error || 'Could not load tasks.');
      setProfile(p.data);
      setTasks(t.data.tasks || []);
      setMembers(m.data?.ok ? m.data.members || [] : []);
    } catch(e:any) { setError(e?.message || 'Could not load team tasks.'); }
    finally { setLoading(false); }
  };
  useEffect(()=>{void load();},[]);

  const canAssign = profile?.role === 'owner' || profile?.role === 'super_admin' ||
    (profile?.role === 'vice_admin' && profile?.permissions?.includes('can_manage_tasks')) ||
    (profile?.role === 'support_agent' && profile?.permissions?.includes('can_supervise_staff'));

  const assign = async () => {
    setError('');
    if (!title.trim() || !assignee) { setError('Choose a Staff Member and enter a task title.'); return; }
    setSaving(true);
    try {
      const r=await supabaseWorkerRequest<{data:any}>('/api/v1/admin/rpc/team_assign_task',{
        method:'POST',body:JSON.stringify({args:{p_title:title.trim(),p_description:description.trim(),p_assigned_to:assignee,p_due_at:dueAt?new Date(dueAt).toISOString():null,p_department_id:null}})
      });
      if(!r.data?.ok) throw new Error(r.data?.error || 'Task assignment failed.');
      setTitle('');setDescription('');setAssignee('');setDueAt('');
      await load();
    } catch(e:any){setError(e?.message || 'Could not assign task.');}
    finally{setSaving(false);}
  };

  const changeStatus = async (task:any,status:string) => {
    try {
      const r=await supabaseWorkerRequest<{data:any}>('/api/v1/admin/rpc/team_update_task',{
        method:'POST',body:JSON.stringify({args:{p_task_id:task.id,p_status:status,p_body:null,p_attachment_url:null}})
      });
      if(!r.data?.ok) throw new Error(r.data?.error || 'Could not update task.');
      await load();
    } catch(e:any){alert(e?.message || 'Could not update task.');}
  };

  if(loading) return <div className="p-6 text-center text-xs text-gray-500">Loading team tasks...</div>;
  return (
    <div className="max-w-4xl mx-auto pb-24 space-y-4">
      <header className="bg-white dark:bg-darkcard rounded-xl p-4 shadow-sm">
        <h2 className="text-lg font-black text-navy dark:text-white flex items-center gap-2"><ClipboardList size={18}/> Team task management</h2>
        <p className="text-[10px] text-gray-500 mt-1">Staff Members can access only tasks assigned to their own accounts. Supervisors can monitor work within their granted authority.</p>
      </header>
      {error && <p role="alert" className="text-xs text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
      {canAssign && (
        <section className="bg-white dark:bg-darkcard rounded-xl p-4 shadow-sm space-y-2">
          <h3 className="text-sm font-bold text-navy dark:text-white flex items-center gap-2"><Plus size={15}/> Assign a task</h3>
          <select value={assignee} onChange={e=>setAssignee(e.target.value)} className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-darkline bg-gray-50 dark:bg-darkbg text-xs">
            <option value="">Select active Staff Member</option>
            {members.filter(m=>m.role==='staff_member').map(m=><option key={m.id} value={m.id}>@{m.username} {m.department ? '· '+m.department : ''}</option>)}
          </select>
          <input value={title} onChange={e=>setTitle(e.target.value)} maxLength={160} placeholder="Task title" className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-darkline bg-gray-50 dark:bg-darkbg text-xs"/>
          <textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={5000} rows={3} placeholder="Instructions, expected outcome and required evidence" className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-darkline bg-gray-50 dark:bg-darkbg text-xs"/>
          <input type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)} className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-darkline bg-gray-50 dark:bg-darkbg text-xs"/>
          <button disabled={saving || !assignee || !title.trim()} onClick={()=>void assign()} className="w-full bg-accent text-white font-bold rounded-lg py-2.5 text-xs disabled:opacity-50">{saving?'Assigning...':'Assign task'}</button>
        </section>
      )}
      <section className="space-y-2">
        {tasks.length===0 && <div className="bg-white dark:bg-darkcard rounded-xl p-6 text-center text-xs text-gray-500">No tasks are assigned to you or supervised by you.</div>}
        {tasks.map(task=>(
          <article key={task.id} className="bg-white dark:bg-darkcard rounded-xl p-4 shadow-sm">
            <div className="flex justify-between gap-2">
              <h3 className="text-sm font-bold text-navy dark:text-white">{task.title}</h3>
              <span className="text-[9px] rounded-full px-2 py-1 bg-gray-100 dark:bg-darkline text-gray-600 dark:text-gray-300">{String(task.status).replace('_',' ')}</span>
            </div>
            {task.description && <p className="text-xs text-gray-600 dark:text-gray-300 mt-2 whitespace-pre-wrap">{task.description}</p>}
            {task.due_at && <p className="text-[10px] text-gray-500 mt-2 flex items-center gap-1"><Clock size={11}/> Due {new Date(task.due_at).toLocaleString()}</p>}
            {Array.isArray(task.updates) && task.updates.map((u:any)=><div key={u.id} className="border-t border-gray-100 dark:border-darkline mt-2 pt-2"><p className="text-[10px] text-gray-600 dark:text-gray-300">{u.body || u.update_type}</p><p className="text-[9px] text-gray-400">{new Date(u.created_at).toLocaleString()}</p>{u.attachment_url && <a className="text-[10px] text-accent underline" href={u.attachment_url} target="_blank" rel="noreferrer">View evidence</a>}</div>)}
            {canAssign && !['completed','cancelled'].includes(task.status) && <div className="flex flex-wrap gap-2 mt-3"><button onClick={()=>void changeStatus(task,'completed')} className="text-[10px] font-bold px-3 py-2 rounded-lg bg-green-50 text-green-700 flex items-center gap-1"><CheckCircle2 size={12}/> Approve completion</button><button onClick={()=>void changeStatus(task,'in_progress')} className="text-[10px] font-bold px-3 py-2 rounded-lg bg-blue-50 text-blue-700">In progress</button></div>}
          </article>
        ))}
      </section>
    </div>
  );
}
