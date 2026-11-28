import { useEffect, useState } from 'react';
import { d1Request } from '../lib/d1Api';
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
    setError('');
    try {
      const [profileResult, taskResult] = await Promise.all([
        d1Request<{data:any}>('/api/team/workspace/profile'),
        d1Request<{data:any}>('/api/team/tasks'),
      ]);
      if (!profileResult.data?.ok) throw new Error('An active team appointment is required.');
      if (!taskResult.data?.ok) throw new Error('You do not have permission to supervise team tasks.');
      setProfile({ ...profileResult.data, can_assign: taskResult.data.can_assign });
      setTasks(taskResult.data.tasks || []);
      setMembers(taskResult.data.members || []);
    } catch(e:any) {
      setError(e?.message || 'Could not load team tasks.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(()=>{void load();},[]);

  const canAssign = profile?.can_assign === true;

  const assign = async () => {
    setError('');
    if (!title.trim() || !assignee) { setError('Choose a Staff Member and enter a task title.'); return; }
    setSaving(true);
    try {
      await d1Request('/api/team/tasks',{
        method:'POST',
        body:JSON.stringify({
          title:title.trim(),
          description:description.trim(),
          assigned_to_user_id:assignee,
          due_at:dueAt?new Date(dueAt).toISOString():null,
        }),
      });
      setTitle('');setDescription('');setAssignee('');setDueAt('');
      await load();
    } catch(e:any){setError(e?.message || 'Could not assign task.');}
    finally{setSaving(false);}
  };

  const changeStatus = async (task:any,status:string) => {
    try {
      await d1Request(`/api/team/tasks/${task.id}`,{
        method:'PATCH',body:JSON.stringify({status}),
      });
      await load();
    } catch(e:any){setError(e?.message || 'Could not update task.');}
  };

  if(loading) return <div className="p-6 text-center text-xs text-gray-500">Loading team tasks...</div>;
  return (
    <div className="max-w-4xl mx-auto pb-24 space-y-4">
      <header className="bg-white dark:bg-darkcard rounded-xl p-4 shadow-sm">
        <h2 className="text-lg font-black text-navy dark:text-white flex items-center gap-2"><ClipboardList size={18}/> Team task management</h2>
        <p className="text-[10px] text-gray-500 mt-1">Staff Members see only their own assigned tasks. Supervisors can assign and review work within their granted authority.</p>
      </header>
      {error && <p role="alert" className="text-xs text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
      {canAssign && (
        <section className="bg-white dark:bg-darkcard rounded-xl p-4 shadow-sm space-y-2">
          <h3 className="text-sm font-bold text-navy dark:text-white flex items-center gap-2"><Plus size={15}/> Assign a task</h3>
          <select value={assignee} onChange={e=>setAssignee(e.target.value)} className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-darkline bg-gray-50 dark:bg-darkbg text-xs">
            <option value="">Select active Staff Member</option>
            {members.map(m=><option key={m.id} value={m.id}>@{m.username}</option>)}
          </select>
          <input value={title} onChange={e=>setTitle(e.target.value)} maxLength={160} placeholder="Task title" className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-darkline bg-gray-50 dark:bg-darkbg text-xs"/>
          <textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={5000} rows={3} placeholder="Instructions and expected outcome" className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-darkline bg-gray-50 dark:bg-darkbg text-xs"/>
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
            <p className="text-[10px] text-gray-500 mt-1">Assigned to @{task.assignee_username || 'staff member'}</p>
            {task.description && <p className="text-xs text-gray-600 dark:text-gray-300 mt-2 whitespace-pre-wrap">{task.description}</p>}
            {task.due_at && <p className="text-[10px] text-gray-500 mt-2 flex items-center gap-1"><Clock size={11}/> Due {new Date(task.due_at).toLocaleString()}</p>}
            {canAssign && !['completed','cancelled'].includes(task.status) && <div className="flex flex-wrap gap-2 mt-3"><button onClick={()=>void changeStatus(task,'completed')} className="text-[10px] font-bold px-3 py-2 rounded-lg bg-green-50 text-green-700 flex items-center gap-1"><CheckCircle2 size={12}/> Approve completion</button><button onClick={()=>void changeStatus(task,'in_progress')} className="text-[10px] font-bold px-3 py-2 rounded-lg bg-blue-50 text-blue-700">In progress</button></div>}
          </article>
        ))}
      </section>
    </div>
  );
}
