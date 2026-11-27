import { useEffect,useState } from 'react';
import { supabaseWorkerRequest } from '../lib/supabaseWorkerApi';
import { UserPlus,ShieldCheck,Trash2,RefreshCw } from 'lucide-react';

const ROLES=[
 {id:'supabase_engineer',name:'Supabase Engineer',desc:'Database schema, migrations, SQL functions, RLS and database performance.'},
 {id:'d1_engineer',name:'D1 Engineer',desc:'Cloudflare D1, Worker APIs, storage bindings, scheduled jobs and runtime reliability.'},
 {id:'application_code_engineer',name:'Application Code Engineer',desc:'Frontend/backend implementation, bugs, pull requests, type checks and tests.'},
 {id:'security_engineer',name:'Security Engineer',desc:'Authorized security reviews, access-control testing, vulnerability reports and fix verification.'},
 {id:'ui_ux_designer',name:'UI/UX Designer',desc:'User flows, interface design, responsive layouts, accessibility and design handoff.'},
];
export default function EngineeringManagement(){
 const [profile,setProfile]=useState<any>(null),[users,setUsers]=useState<any[]>([]),[appointments,setAppointments]=useState<any[]>([]);
 const [userId,setUserId]=useState(''),[role,setRole]=useState(ROLES[0].id),[lead,setLead]=useState(false);
 const [taskTitle,setTaskTitle]=useState(''),[taskDescription,setTaskDescription]=useState(''),[taskAssignee,setTaskAssignee]=useState(''),[taskDue,setTaskDue]=useState('');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 const load=async()=>{
  setLoading(true);setError('');
  try{
   const [p,m,a]=await Promise.all([
    supabaseWorkerRequest<{data:any}>('/api/v1/admin/rpc/staff_my_profile',{method:'POST',body:JSON.stringify({args:{}})}),
    supabaseWorkerRequest<{data:any}>('/api/v1/admin/rpc/engineering_available_users',{method:'POST',body:JSON.stringify({args:{}})}),
    supabaseWorkerRequest<{data:any}>('/api/v1/admin/rpc/engineering_admin_list',{method:'POST',body:JSON.stringify({args:{}})}),
   ]);
   if(!['owner','super_admin'].includes(p.data?.role))throw new Error('Only Owner or Super Admin can manage engineering appointments.');
   if(!m.data?.ok)throw new Error(m.data?.error||'Could not load users.');
   if(!a.data?.ok)throw new Error(a.data?.error||'Could not load engineering appointments.');
   setProfile(p.data);setUsers(m.data.users||[]);setAppointments(a.data.appointments||[]);
  }catch(e:any){setError(e?.message||'Could not load engineering management.');}
  finally{setLoading(false);}
 };
 useEffect(()=>{void load();},[]);
 const appoint=async()=>{
  setBusy(true);setError('');setSuccess('');
  try{
   const r=await supabaseWorkerRequest<{data:any}>('/api/v1/admin/rpc/engineering_appoint_member',{method:'POST',body:JSON.stringify({args:{p_user_id:userId,p_engineering_role:role,p_is_lead:lead}})});
   if(!r.data?.ok)throw new Error(r.data?.error||'Appointment failed.');
   setSuccess('Engineering appointment activated. The member can now open their workspace.');
   setUserId('');setLead(false);await load();
  }catch(e:any){setError(e?.message||'Could not appoint member.');}
  finally{setBusy(false);}
 };
 const assignTask=async()=>{
  setBusy(true);setError('');setSuccess('');
  try{
   const r=await supabaseWorkerRequest<{data:any}>('/api/v1/admin/rpc/engineering_assign_task',{method:'POST',body:JSON.stringify({args:{p_title:taskTitle.trim(),p_description:taskDescription.trim()||null,p_assigned_to:taskAssignee,p_due_at:taskDue?new Date(taskDue).toISOString():null}})});
   if(!r.data?.ok)throw new Error(r.data?.error||'Task assignment failed.');
   setTaskTitle('');setTaskDescription('');setTaskAssignee('');setTaskDue('');
   setSuccess('Engineering task assigned to the selected member.');
  }catch(e:any){setError(e?.message||'Could not assign engineering task.');}
  finally{setBusy(false);}
 };
 const remove=async(a:any)=>{
  if(!window.confirm('Remove this engineering appointment? The app account role and historical tasks will remain unchanged.'))return;
  setBusy(true);setError('');setSuccess('');
  try{
   const r=await supabaseWorkerRequest<{data:any}>('/api/v1/admin/rpc/engineering_remove_member',{method:'POST',body:JSON.stringify({args:{p_appointment_id:a.id}})});
   if(!r.data?.ok)throw new Error(r.data?.error||'Removal failed.');
   setSuccess('Engineering appointment removed and workspace access revoked.');await load();
  }catch(e:any){setError(e?.message||'Could not remove appointment.');}
  finally{setBusy(false);}
 };
 if(loading)return <div className="p-6 text-center text-xs text-gray-500">Loading engineering department...</div>;
 return <div className="max-w-4xl mx-auto pb-24 space-y-3">
  <header className="bg-white dark:bg-darkcard rounded-xl p-4 shadow-sm"><h2 className="text-lg font-black text-navy dark:text-white flex items-center gap-2"><ShieldCheck size={18}/> Engineering Department</h2><p className="text-[10px] text-gray-500 mt-1">Only Owner and Super Admin can appoint or remove engineering members. App roles are not changed.</p></header>
  {error&&<p role="alert" className="text-xs text-red-700 bg-red-50 p-3 rounded-lg">{error}</p>}{success&&<p role="status" className="text-xs text-green-700 bg-green-50 p-3 rounded-lg">{success}</p>}
  <section className="bg-white dark:bg-darkcard rounded-xl p-4 shadow-sm space-y-3">
   <h3 className="text-sm font-bold text-navy dark:text-white flex items-center gap-2"><UserPlus size={15}/> Appoint engineering member</h3>
   <label className="block text-[10px] font-bold text-gray-500">Select existing CenPaya user<select value={userId} onChange={e=>setUserId(e.target.value)} className="w-full mt-1 p-2.5 rounded-lg text-xs"><option value="">Choose user</option>{users.map(u=><option key={u.id} value={u.id}>@{u.username||u.email} · {String(u.role).replace(/_/g,' ')}</option>)}</select></label>
   <label className="block text-[10px] font-bold text-gray-500">Engineering function<select value={role} onChange={e=>setRole(e.target.value)} className="w-full mt-1 p-2.5 rounded-lg text-xs">{ROLES.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
   <p className="text-[10px] text-gray-500">{ROLES.find(r=>r.id===role)?.desc}</p>
   <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={lead} onChange={e=>setLead(e.target.checked)}/> Also appoint as Lead Engineer (one active lead at a time)</label>
   {lead&&profile?.role!=='owner'&&<p className="text-[10px] text-amber-700">Lead Engineer designation is restricted to the Owner.</p>}
   <button disabled={busy||!userId||} onClick={()=>void appoint()} className="w-full rounded-lg bg-accent text-white p-3 text-xs font-bold disabled:opacity-50">{busy?'Processing...':'Activate engineering appointment'}</button>
  </section>
  <section className="bg-white dark:bg-darkcard rounded-xl p-4 shadow-sm space-y-2">
   <h3 className="text-sm font-bold text-navy dark:text-white">Assign engineering work</h3>
   <select value={taskAssignee} onChange={e=>setTaskAssignee(e.target.value)} className="w-full p-2.5 rounded-lg text-xs"><option value="">Select an appointed engineer</option>{appointments.filter(a=>a.status==='active').map(a=><option key={a.id} value={a.user_id}>@{a.username} · {ROLES.find(r=>r.id===a.engineering_role)?.name||a.engineering_role}</option>)}</select>
   <input value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} maxLength={160} placeholder="Task title" className="w-full p-2.5 rounded-lg text-xs"/>
   <textarea value={taskDescription} onChange={e=>setTaskDescription(e.target.value)} maxLength={5000} rows={3} placeholder="Instructions, expected result and review requirements" className="w-full p-2.5 rounded-lg text-xs"/>
   <input type="datetime-local" value={taskDue} onChange={e=>setTaskDue(e.target.value)} className="w-full p-2.5 rounded-lg text-xs"/>
   <button disabled={busy||!taskAssignee||!taskTitle.trim()} onClick={()=>void assignTask()} className="w-full rounded-lg bg-accent text-white p-3 text-xs font-bold disabled:opacity-50">Assign engineering task</button>
  </section>
  <section className="bg-white dark:bg-darkcard rounded-xl p-4 shadow-sm">
   <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-navy dark:text-white">Engineering appointments</h3><button onClick={()=>void load()} className="text-accent"><RefreshCw size={15}/></button></div>
   {appointments.length===0?<p className="text-xs text-gray-500 text-center py-8">No engineering appointments yet.</p>:<div className="space-y-2 mt-3">
    {appointments.map(a=><article key={a.id} className="border border-gray-100 dark:border-darkline rounded-xl p-3">
     <div className="flex justify-between items-start gap-2"><div><p className="text-xs font-bold text-navy dark:text-white">@{a.username||a.email}</p><p className="text-[10px] text-gray-500 mt-1">{ROLES.find(r=>r.id===a.engineering_role)?.name||a.engineering_role} · app role: {a.app_role}</p></div><span className={'text-[9px] rounded-full px-2 py-1 '+(a.status==='active'?'bg-green-100 text-green-700':'bg-gray-100 text-gray-600')}>{a.status}</span></div>
     {a.is_lead&&<p className="text-[9px] font-bold text-amber-700 mt-2">Lead Engineer</p>}
     <p className="text-[9px] text-gray-500 mt-2">{a.description}</p>
     {a.status==='active'&&<button disabled={busy} onClick={()=>void remove(a)} className="mt-3 text-[10px] font-bold text-red-600 flex items-center gap-1"><Trash2 size={12}/> Remove appointment</button>}
    </article>)}
   </div>}
  </section>
 </div>;
}
