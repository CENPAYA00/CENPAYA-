import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { supabaseWorkerRequest } from '../lib/supabaseWorkerApi';
import { d1Request } from '../lib/d1Api';
import { ArrowLeft, Shield, Upload, Check, AlertTriangle, Wallet, Clock } from 'lucide-react';
import { getCachedUser } from '../lib/cache';
import { compressImage } from '../utils/compressImage';


export default function ServiceOrder() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();

  const isNew = !id && search.get('service') && search.get('package');

  const [order, setOrder] = useState<any>(null);
  const [service, setService] = useState<any>(null);
  const [pkg, setPkg] = useState<any>(null);
  const [seller, setSeller] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [me, setMe] = useState<any>(null);

  const [requirements, setRequirements] = useState('');
  const [milestones, setMilestones] = useState<{ title: string; amount: number }[]>([]);
  const payMethod = 'wallet' as const;
  const [walletBalance, setWalletBalance] = useState(0);

  const [deliveryNote, setDeliveryNote] = useState('');
  const [confirmedDeadline, setConfirmedDeadline] = useState('');
  const [deliveryFile, setDeliveryFile] = useState<File | null>(null);

  useEffect(() => {
    const load = async () => {
      const u = await getCachedUser();
      if (!u) { setLoading(false); return; }
      setMe(u);

      if (isNew) {
        const serviceId = search.get('service')!;
        const packageId = search.get('package')!;

        const [svcRes, packagesRes, walletRes] = await Promise.all([
          d1Request<{ data: any }>(`/api/market/listings/${encodeURIComponent(serviceId)}`),
          d1Request<{ data: any[] }>(`/api/market/listings/${encodeURIComponent(serviceId)}/packages`),
          supabaseWorkerRequest<{ data: { available_funds?: number } }>('/api/v1/wallet'),
        ]);
        const selectedPackage = (packagesRes.data || []).find((row: any) => row.id === packageId) ||
          ((packagesRes.data || []).length === 0 && svcRes.data ? {
            id: null, title: 'Standard service', price: svcRes.data.price,
            delivery_days: svcRes.data.delivery_days || 7,
          } : null);
        setService(svcRes.data);
        setPkg(selectedPackage);
        if (selectedPackage) setMilestones([{ title: 'Project delivery', amount: Number(selectedPackage.price) }]);
        setWalletBalance(walletRes.data?.available_funds || 0);

        if (svcRes.data?.seller_id) {
          const { data: s } = await d1Request<{ data: any }>(`/api/profiles/${encodeURIComponent(svcRes.data.seller_id)}`);
          setSeller(s);
        }
      } else if (id) {
        let existingOrder: any = null;
        try {
          const result = await supabaseWorkerRequest<{ data: any }>(`/api/v1/service-orders/${encodeURIComponent(id)}`);
          existingOrder = result.data;
          setOrder(existingOrder);
          setConfirmedDeadline(existingOrder.proposed_delivery_at ? new Date(existingOrder.proposed_delivery_at).toISOString().slice(0, 10) : '');
        } catch (error: unknown) {
          setErrorMsg(error instanceof Error ? error.message : 'Service orders are unavailable until the financial schema is migrated.');
          setLoading(false);
          return;
        }

        if (existingOrder) {
          const [svcRes, packagesRes, sellerRes] = await Promise.all([
            d1Request<{ data: any }>(`/api/market/listings/${encodeURIComponent(existingOrder.service_id)}`),
            d1Request<{ data: any[] }>(`/api/market/listings/${encodeURIComponent(existingOrder.service_id)}/packages`),
            d1Request<{ data: any }>(`/api/profiles/${encodeURIComponent(existingOrder.seller_id)}`),
          ]);
          setService(svcRes.data);
          setPkg((packagesRes.data || []).find((row: any) => row.id === existingOrder.package_id) || null);
          setSeller(sellerRes.data);
        }
      }
      setLoading(false);
    };
    load();
  }, [id, isNew, search]);

  const createOrder = async () => {
    setErrorMsg('');
    if (!requirements.trim()) return setErrorMsg('Please describe what you need.');

    setBusy(true);

    try {
      if (payMethod !== 'wallet') throw new Error('Freelance escrow checkout currently supports wallet payment only.');
      if (milestones.length === 0 || milestones.some(m => !m.title.trim() || !Number.isSafeInteger(m.amount) || m.amount <= 0) ||
          milestones.reduce((sum, m) => sum + m.amount, 0) !== Number(pkg.price)) {
        throw new Error('Milestone amounts must be positive and add up exactly to the package price.');
      }
      const due = new Date(Date.now() + Math.max(1, Number(pkg.delivery_days) || 7) * 86400000);
      const result = await supabaseWorkerRequest<{ data: any }>('/api/v1/checkout/service-orders', {
        method: 'POST',
        body: JSON.stringify({
          seller_id: service.seller_id, service_id: service.id, package_id: pkg.id,
          amount: Number(pkg.price), requirements: requirements.trim(),
          due_at: due.toISOString(), payment_method: 'wallet',
          milestones: milestones.map(m => ({ title: m.title.trim(), amount: m.amount, due_at: due.toISOString() })),
        }),
      });
      navigate(`/service-order/${result.data.id}`, { replace: true });
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : 'Service order checkout is unavailable.');
    }
    setBusy(false);
  };

  const submitDelivery = async () => {
    setErrorMsg('');
    if (!deliveryNote.trim()) return setErrorMsg('Add a delivery note.');
    setBusy(true);

    let fileUrl: string | null = null;
    if (deliveryFile) {
      const compressed = deliveryFile.type.startsWith('image/')
        ? await compressImage(deliveryFile)
        : deliveryFile;
      const ext = compressed.name.split('.').pop();
      const path = `service-deliveries/${order.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('listings').upload(path, compressed);
      if (upErr) { setErrorMsg(upErr.message); setBusy(false); return; }
      const { data } = supabase.storage.from('listings').getPublicUrl(path);
      fileUrl = data.publicUrl;
    }

    try {
      await supabaseWorkerRequest(`/api/v1/service-orders/${encodeURIComponent(order.id)}/milestones/submit`, { method: 'POST', body: JSON.stringify({ milestone_id: order.service_order_milestones?.[0]?.id, delivery_note: deliveryNote.trim(), delivery_file_url: fileUrl }) });
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : 'Service delivery is unavailable.');
      setBusy(false);
      return;
    }

    alert('Milestone submitted. The buyer can review and accept it or request revisions.');
    window.location.reload();
  };

  const approve = async () => {
    if (!window.confirm('Approve this delivery and release funds?')) return;
    setBusy(true);
    try {
      await supabaseWorkerRequest(`/api/v1/service-orders/${encodeURIComponent(order.id)}/milestones/approve`, { method: 'POST', body: JSON.stringify({ milestone_id: order.service_order_milestones?.find((m: any) => m.status === 'submitted')?.id }) });
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : 'Service order approval is unavailable.');
      setBusy(false);
      return;
    }
    alert('Funds released.');
    window.location.reload();
  };

  const openDispute = async () => {
    const reason = window.prompt('Describe the issue (min 10 characters):');
    if (!reason || reason.trim().length < 10) return;
    setBusy(true);
    try {
      await supabaseWorkerRequest(`/api/v1/service-orders/${encodeURIComponent(order.id)}/dispute`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : 'Service-order disputes are unavailable.');
      setBusy(false);
      return;
    }
    alert('Dispute opened. Support will review.');
    window.location.reload();
  };

  const requestRevision = async (milestoneId: string) => {
    const note = window.prompt('What needs to be revised?');
    if (!note || note.trim().length < 3) return;
    setBusy(true);
    try {
      await supabaseWorkerRequest(`/api/v1/service-orders/${encodeURIComponent(order.id)}/milestones/revision`, {
        method: 'POST', body: JSON.stringify({ milestone_id: milestoneId, note: note.trim() })
      });
      window.location.reload();
    } catch (error: unknown) { setErrorMsg(error instanceof Error ? error.message : 'Could not request revision.'); setBusy(false); }
  };

  const requestDeadlineChange = async () => {
    const proposed = window.prompt('Enter the new delivery date (YYYY-MM-DD). The other party must approve it.');
    if (!proposed || !/^\d{4}-\d{2}-\d{2}$/.test(proposed)) return;
    setBusy(true);
    try {
      await supabaseWorkerRequest(`/api/v1/service-orders/${encodeURIComponent(order.id)}/deadline`, {
        method: 'POST', body: JSON.stringify({ new_deadline: new Date(proposed + 'T23:59:59').toISOString() })
      });
      window.location.reload();
    } catch (error: unknown) { setErrorMsg(error instanceof Error ? error.message : 'Could not request deadline change.'); setBusy(false); }
  };

  const approveDeadlineChange = async (changeId: string) => {
    setBusy(true);
    try {
      await supabaseWorkerRequest(`/api/v1/service-orders/${encodeURIComponent(order.id)}/deadline/approve`, {
        method: 'POST', body: JSON.stringify({ change_id: changeId })
      });
      window.location.reload();
    } catch (error: unknown) { setErrorMsg(error instanceof Error ? error.message : 'Could not approve deadline change.'); setBusy(false); }
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  // ---------- NEW ORDER ----------
  if (isNew && service && pkg) {
    const amount = Number(pkg.price);

    return (
      <div className="px-3 py-3 pb-28">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button>
          <h1 className="text-base font-bold text-navy dark:text-white">New order</h1>
        </div>

        <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-3 mb-3">
          <p className="text-[11px] text-gray-500">{service.title}</p>
          <p className="text-[13px] font-bold text-navy dark:text-white mt-1">{pkg.title} · {pkg.delivery_days} days</p>
          <p className="text-[16px] font-black text-accent mt-1">{amount.toLocaleString()} XAF</p>
        </div>

        <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400">Project milestones</p>
            <button type="button" onClick={() => setMilestones(rows => [...rows, { title: '', amount: 0 }])}
              className="text-[10px] text-accent font-bold">+ Add milestone</button>
          </div>
          {milestones.map((milestone, index) => (
            <div key={index} className="flex gap-2 mb-2">
              <input value={milestone.title} onChange={e => setMilestones(rows => rows.map((m,i) => i === index ? { ...m, title: e.target.value } : m))}
                placeholder={`Milestone ${index + 1}`} className="min-w-0 flex-1 p-2 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs" />
              <input type="number" min="1" value={milestone.amount || ''} onChange={e => setMilestones(rows => rows.map((m,i) => i === index ? { ...m, amount: Number(e.target.value) } : m))}
                placeholder="XAF" className="w-24 p-2 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs" />
              {milestones.length > 1 && <button type="button" onClick={() => setMilestones(rows => rows.filter((_,i) => i !== index))} className="text-red-500 text-xs">×</button>}
            </div>
          ))}
          <p className="text-[10px] text-gray-500">Allocated: {milestones.reduce((sum,m) => sum + (Number(m.amount)||0),0).toLocaleString()} / {amount.toLocaleString()} XAF</p>
        </div>

        <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-3 mb-3">
          <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">What do you need?</p>
          <textarea
            value={requirements}
            onChange={e => setRequirements(e.target.value)}
            rows={4}
            placeholder="Describe the work, deadlines, references..."
            className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs resize-none"
          />
        </div>

        <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-3 mb-3">
          <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-2">Payment method</p>

          <button
            className="w-full p-3 rounded-xl border-2 mb-2 flex items-center gap-3 border-accent bg-accent/5"
          >
            <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center text-white">
              <Wallet size={16} />
            </div>
            <div className="flex-1 text-left">
              <p className="text-[12px] font-bold text-navy dark:text-white">Pay from Wallet</p>
              <p className="text-[10px] text-gray-500">Available balance: {walletBalance.toLocaleString()} XAF · platform fee is shown in checkout response</p>
            </div>
            {payMethod === 'wallet' && <Check size={16} className="text-accent" />}
          </button>


        </div>

        <div className="bg-blue-50 border border-blue-200 text-blue-800 text-[11px] p-3 rounded-xl mb-3">
          Funds are held securely in escrow. The seller must accept the project and confirm the delivery deadline before work begins.
        </div>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-[11px] p-3 rounded-xl mb-3">
            {errorMsg}
          </div>
        )}

        <button
          onClick={createOrder}
          disabled={busy || payMethod !== 'wallet'}
          className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[12px] disabled:opacity-50"
        >
          {busy ? 'Processing...' : 'Fund escrow'}
        </button>
      </div>
    );
  }

  // ---------- EXISTING ORDER ----------
  if (!order) return <div className="p-4 text-center text-xs">Order not found.</div>;

  const isSeller = me?.id === order.seller_id;
  const isBuyer = me?.id === order.buyer_id;

  const statusColor: Record<string, string> = {
    awaiting_acceptance: 'bg-yellow-100 text-yellow-700',
    hold: 'bg-yellow-100 text-yellow-700',
    in_progress: 'bg-blue-100 text-blue-700',
    revision_requested: 'bg-amber-100 text-amber-700',
    delivered: 'bg-blue-100 text-blue-700',
    deadline_refunded: 'bg-gray-100 text-gray-700',
    released: 'bg-green-100 text-green-700',
    auto_released_72h: 'bg-green-100 text-green-700',
    disputed: 'bg-red-100 text-red-700',
    refunded: 'bg-gray-100 text-gray-700',
    cancelled: 'bg-gray-100 text-gray-700',
  };

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white flex-1">Service Order</h1>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${statusColor[order.escrow_status] || 'bg-gray-100 text-gray-600'}`}>
          {order.escrow_status}
        </span>
      </div>

      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-3 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <Shield size={13} className="text-gray-500" />
          <p className="text-[11px] font-bold text-navy dark:text-white">Escrow protected</p>
        </div>
        {service && <p className="text-[11px] text-gray-500">{service.title}</p>}
        {pkg && <p className="text-[12px] font-bold text-navy dark:text-white mt-0.5">{pkg.title}</p>}
        <p className="text-[16px] font-black text-accent mt-2">{Number(order.amount).toLocaleString()} XAF</p>

        {order.proposed_delivery_at && order.escrow_status === 'awaiting_acceptance' && (
          <p className="text-[10px] text-gray-500 mt-2 flex items-center gap-1"><Clock size={11} /> Buyer requested date: {new Date(order.proposed_delivery_at).toLocaleDateString()} · awaiting seller confirmation</p>
        )}
        {order.confirmed_delivery_at && ['in_progress','revision_requested'].includes(order.escrow_status) && (
          <p className="text-[10px] text-gray-500 mt-2 flex items-center gap-1"><Clock size={11} /> Seller-confirmed deadline: {new Date(order.confirmed_delivery_at).toLocaleString()}</p>
        )}
        {order.auto_release_deadline_at && order.escrow_status === 'delivered' && (
          <p className="text-[10px] text-gray-500 mt-2 flex items-center gap-1">
            <Clock size={11} /> Auto-releases {new Date(order.auto_release_deadline_at).toLocaleString()}
          </p>
        )}
      </div>

      {(order.service_order_milestones || []).length > 0 && (
        <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-3 mb-3">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Project milestones</p>
          {order.service_order_milestones.map((m: any) => (
            <div key={m.id} className="border-b last:border-0 border-gray-100 dark:border-darkline py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold text-navy dark:text-white">{m.sequence_no}. {m.title}</p>
                <span className="text-[10px] text-gray-500">{m.status}</span>
              </div>
              <p className="text-[11px] text-accent font-bold">{Number(m.amount).toLocaleString()} XAF</p>
              {m.delivery_note && <p className="text-[10px] text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-wrap">{m.delivery_note}</p>}
              {m.delivery_file_url && <a href={m.delivery_file_url} target="_blank" rel="noreferrer" className="text-[10px] text-accent underline">View milestone submission</a>}
            </div>
          ))}
        </div>
      )}

      {order.requirements && (
        <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-3 mb-3">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Requirements</p>
          <p className="text-[11px] text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{order.requirements}</p>
        </div>
      )}

      {(order.delivery_file_url || order.delivery_note) && (
        <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-3 mb-3">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Delivery</p>
          {order.delivery_note && (
            <p className="text-[11px] text-gray-700 dark:text-gray-200 whitespace-pre-wrap mb-2">{order.delivery_note}</p>
          )}
          {order.delivery_file_url && (
            <a href={order.delivery_file_url} target="_blank" rel="noreferrer" className="text-accent text-[11px] font-bold underline">
              View delivered file →
            </a>
          )}
        </div>
      )}

      {isSeller && order.escrow_status === 'awaiting_acceptance' && (
        <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-3 mb-3">
          <p className="text-[11px] font-bold text-navy dark:text-white mb-2">Accept project and confirm delivery date</p>
          <input type="date" min={new Date(Date.now() + 86400000).toISOString().slice(0,10)}
            value={confirmedDeadline} onChange={e => setConfirmedDeadline(e.target.value)}
            className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs mb-2" />
          <button onClick={async () => {
            if (!confirmedDeadline) { setErrorMsg('Confirm a delivery date first.'); return; }
            setBusy(true);
            try {
              await supabaseWorkerRequest(`/api/v1/service-orders/${encodeURIComponent(order.id)}/accept`, {
                method: 'POST', body: JSON.stringify({ confirmed_deadline: new Date(confirmedDeadline + 'T23:59:59').toISOString() })
              });
              window.location.reload();
            } catch (error: unknown) { setErrorMsg(error instanceof Error ? error.message : 'Could not accept project.'); setBusy(false); }
          }} disabled={busy} className="w-full bg-accent text-white font-bold py-2.5 rounded-lg text-[12px] disabled:opacity-50">
            {busy ? 'Accepting...' : 'Accept project & confirm deadline'}
          </button>
        </div>
      )}

      {isSeller && ['in_progress','revision_requested'].includes(order.escrow_status) && (
        <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-3 mb-3">
          <p className="text-[11px] font-bold text-navy dark:text-white mb-2">Deliver your service</p>
          <textarea
            value={deliveryNote}
            onChange={e => setDeliveryNote(e.target.value)}
            rows={3}
            placeholder="Notes for the buyer..."
            className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs resize-none mb-2"
          />
          <input
            type="file"
            onChange={e => setDeliveryFile(e.target.files?.[0] || null)}
            className="text-xs mb-2 block w-full"
          />
          <button
            onClick={submitDelivery}
            disabled={busy}
            className="w-full bg-accent text-white font-bold py-2.5 rounded-lg text-[12px] flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <Upload size={13} /> {busy ? 'Submitting...' : 'Submit delivery'}
          </button>
        </div>
      )}

      {['in_progress','revision_requested'].includes(order.escrow_status) && (
        <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-3 mb-3">
          <p className="text-[11px] font-bold text-navy dark:text-white mb-2">Project deadline</p>
          <p className="text-[10px] text-gray-500 mb-2">Any change requires approval from both buyer and seller.</p>
          <button onClick={requestDeadlineChange} disabled={busy} className="w-full border border-gray-300 dark:border-darkline rounded-lg py-2 text-[11px] font-bold">Propose new deadline</button>
          {(order.service_order_deadline_changes || []).filter((x: any) => !x.applied_at).map((x: any) => {
            const alreadyApproved = isBuyer ? !!x.buyer_approved_at : !!x.seller_approved_at;
            return <div key={x.id} className="mt-2 p-2 bg-gray-50 dark:bg-darkbg rounded-lg">
              <p className="text-[10px]">Proposed: {new Date(x.proposed_deadline_at).toLocaleString()}</p>
              <p className="text-[10px] text-gray-500">Buyer: {x.buyer_approved_at ? 'approved' : 'pending'} · Seller: {x.seller_approved_at ? 'approved' : 'pending'}</p>
              {!alreadyApproved && <button onClick={() => approveDeadlineChange(x.id)} disabled={busy} className="text-[11px] text-accent font-bold mt-1">Approve deadline change</button>}
            </div>;
          })}
        </div>
      )}

      {isBuyer && order.escrow_status === 'delivered' && (

        <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-3 mb-3 flex flex-col gap-2">
          <button
            onClick={approve}
            disabled={busy}
            className="w-full bg-green-600 text-white font-bold py-2.5 rounded-lg text-[12px] flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <Check size={13} /> {busy ? 'Confirming...' : 'Approve & release funds'}
          </button>
          {order.service_order_milestones?.filter((m: any) => m.status === 'submitted').map((m: any) => (
            <button key={m.id} onClick={() => requestRevision(m.id)} disabled={busy}
              className="w-full border border-amber-300 text-amber-700 font-bold py-2.5 rounded-lg text-[12px]">
              Request revision
            </button>
          ))}
          <button
            onClick={openDispute}
            className="w-full border border-red-300 text-red-600 font-bold py-2.5 rounded-lg text-[12px] flex items-center justify-center gap-1"
          >
            <AlertTriangle size={13} /> Raise dispute
          </button>
        </div>
      )}

      {(order.escrow_status === 'released' || order.escrow_status === 'auto_released_72h') && (
        <div className="text-[12px] text-green-700 bg-green-50 p-3 rounded-xl flex items-center gap-1">
          <Check size={13} /> Completed. Funds released to seller.
        </div>
      )}

      {order.escrow_status === 'disputed' && (
        <div className="text-[12px] text-red-700 bg-red-50 p-3 rounded-xl flex items-center gap-1">
          <AlertTriangle size={13} /> Under dispute. Support will review.
        </div>
      )}
    </div>
  );
                                                   }
