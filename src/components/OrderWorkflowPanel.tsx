import { useEffect, useState } from 'react';
import { d1Request, getD1ApiUrl, getD1Token } from '../lib/d1Api';
import { FileText, Upload, CheckCircle, RotateCcw, Star, ShieldCheck } from 'lucide-react';

type DeliveryFile = { id: string; name: string; mime_type: string; size: number; url: string };
type Delivery = { id: string; version: number; delivery_note: string; status: string; ai_disclosure: string; files: DeliveryFile[]; delivery_links_json: string };
type Workflow = { financial_status: string; workflow_status: string; deliveries: Delivery[]; review: any };

async function uploadDeliveryFile(file: File): Promise<string> {
  const form = new FormData();
  form.append('folder', 'services/documents');
  form.append('file', file);
  const headers = new Headers();
  const token = getD1Token();
  if (token) headers.set('Authorization', 'Bearer ' + token);
  const response = await fetch(getD1ApiUrl('/api/market/media'), { method: 'POST', body: form, headers, credentials: 'include' });
  const payload = await response.json().catch(() => ({})) as { success?: boolean; url?: string; error?: string };
  if (!response.ok || !payload.url) throw new Error(payload.error || 'File upload failed');
  return payload.url;
}

export default function OrderWorkflowPanel({ orderId, userId, buyerId, sellerId }: { orderId: string; userId: string; buyerId: string; sellerId: string }) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [revision, setRevision] = useState('');
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [disclosure, setDisclosure] = useState<'human_created'|'ai_assisted'|'primarily_ai_generated'|'unknown'>('unknown');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isSeller = userId === sellerId;
  const isBuyer = userId === buyerId;
  const refresh = async () => {
    const result = await d1Request<{ data: Workflow }>(`/api/market/orders/${encodeURIComponent(orderId)}`);
    setWorkflow(result.data);
  };
  useEffect(() => { refresh().catch(e => setError(e instanceof Error ? e.message : 'Order workflow unavailable')); }, [orderId]);
  const run = async (action: string, body: Record<string, unknown>) => {
    setBusy(true); setError('');
    try { await d1Request(`/api/market/orders/${encodeURIComponent(orderId)}/${action}`, { method: 'POST', body: JSON.stringify(body) }); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Action failed'); }
    finally { setBusy(false); }
  };
  const submit = async () => {
    setBusy(true); setError('');
    try {
      const attachment_urls = file ? [await uploadDeliveryFile(file)] : [];
      await d1Request(`/api/market/orders/${encodeURIComponent(orderId)}/delivery`, { method: 'POST', body: JSON.stringify({ delivery_note: note.trim(), attachment_urls, ai_disclosure: disclosure }) });
      setNote(''); setFile(null); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Delivery submission failed'); }
    finally { setBusy(false); }
  };
  const latest = workflow?.deliveries?.find(d => d.status === 'submitted');
  return <section className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-3 mb-3">
    <div className="flex items-center gap-2 mb-2"><ShieldCheck size={14} className="text-accent"/><h2 className="text-[12px] font-bold text-navy dark:text-white">Work delivery & review</h2></div>
    {workflow && <p className="text-[10px] text-gray-500 mb-2">Workflow: {workflow.workflow_status .replace(/_/g,' ')} · Payment: {workflow.financial_status .replace(/_/g,' ')}</p>}
    {workflow?.deliveries?.map(d => <div key={d.id} className="border border-gray-200 dark:border-darkline rounded-xl p-2 mb-2">
      <div className="flex justify-between text-[10px] font-bold"><span>Delivery v{d.version}</span><span>{d.status .replace(/_/g,' ')}</span></div>
      {d.delivery_note && <p className="text-[11px] whitespace-pre-wrap mt-1">{d.delivery_note}</p>}
      {d.files?.map(f => <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[10px] text-accent underline mt-2"><FileText size={12}/>{f.name} · {(f.size/1024/1024).toFixed(1)} MB</a>)}
    </div>)}
    {isSeller && workflow && ['hold','paid','in_progress'].includes(workflow.financial_status) && workflow.workflow_status !== 'accepted' && <div className="mt-2">
      <textarea value={note} onChange={e=>setNote(e.target.value)} rows={3} placeholder="Describe the completed work and instructions for the buyer" className="w-full p-2 border rounded-lg text-xs bg-gray-50 dark:bg-darkbg dark:border-darkline"/>
      <input type="file" onChange={e=>setFile(e.target.files?.[0]||null)} className="block w-full text-[10px] my-2"/>
      <label className="block text-[10px] text-gray-500 mb-1">AI use disclosure</label>
      <select value={disclosure} onChange={e=>setDisclosure(e.target.value as typeof disclosure)} className="w-full p-2 border rounded-lg text-xs bg-gray-50 dark:bg-darkbg dark:border-darkline">
        <option value="unknown">Not specified</option><option value="human_created">Human-created</option><option value="ai_assisted">AI-assisted</option><option value="primarily_ai_generated">Primarily AI-generated</option>
      </select>
      <button onClick={submit} disabled={busy||(!note.trim()&&!file)} className="w-full mt-2 bg-accent text-white rounded-lg py-2 text-xs font-bold disabled:opacity-50"><Upload size={12} className="inline mr-1"/>{busy?'Submitting…':'Submit delivery'}</button>
    </div>}
    {isBuyer && latest && <div className="mt-2 flex flex-col gap-2">
      <button disabled={busy} onClick={()=>run('accept',{})} className="w-full bg-green-600 text-white rounded-lg py-2 text-xs font-bold"><CheckCircle size={12} className="inline mr-1"/>Accept work (does not release payment)</button>
      <textarea value={revision} onChange={e=>setRevision(e.target.value)} rows={2} placeholder="Explain what needs changing (at least 10 characters)" className="w-full p-2 border rounded-lg text-xs bg-gray-50 dark:bg-darkbg dark:border-darkline"/>
      <button disabled={busy||revision.trim().length<10} onClick={()=>run('revision',{reason:revision.trim()})} className="w-full border border-amber-400 text-amber-700 rounded-lg py-2 text-xs font-bold"><RotateCcw size={12} className="inline mr-1"/>Request revision</button>
    </div>}
    {isBuyer && workflow && ['released','completed'].includes(workflow.financial_status) && !workflow.review && <div className="mt-3 border-t pt-3">
      <p className="text-[11px] font-bold mb-2">Rate this completed order</p>
      <div className="flex items-center gap-1 mb-2">{[1,2,3,4,5].map(n=><button key={n} onClick={()=>setRating(n)} aria-label={`${n} stars`}><Star size={20} className={n<=rating?'text-amber-400 fill-amber-400':'text-gray-300'}/></button>)}</div>
      <textarea value={reviewText} onChange={e=>setReviewText(e.target.value)} rows={2} placeholder="Share feedback (optional)" className="w-full p-2 border rounded-lg text-xs bg-gray-50 dark:bg-darkbg dark:border-darkline"/>
      <button disabled={busy} onClick={()=>run('review',{rating,review_text:reviewText.trim()})} className="w-full mt-2 bg-accent text-white rounded-lg py-2 text-xs font-bold">Submit review</button>
    </div>}
    {workflow?.review && <p className="text-[11px] mt-2">Buyer rating: {'★'.repeat(Number(workflow.review.rating))}</p>}
    {error && <p role="alert" className="text-[10px] text-red-600 mt-2">{error}</p>}
  </section>;
}
