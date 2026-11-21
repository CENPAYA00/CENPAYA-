import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { supabaseWorkerRequest } from '../lib/supabaseWorkerApi';
import { d1Request } from '../lib/d1Api';
import { ArrowLeft, Shield, Upload, Check, AlertTriangle, Wallet, Clock } from 'lucide-react';
import { getCachedUser } from '../lib/cache';
import { PaymentMethodLogo, METHOD_LABELS } from '../components/PaymentMethodLogo';
import { compressImage } from '../utils/compressImage';

type Method = 'mtn_momo' | 'orange_money' | 'airtel_money' | 'moov_money';
const METHODS: Method[] = ['mtn_momo', 'orange_money', 'airtel_money', 'moov_money'];

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
  const [payMethod, setPayMethod] = useState<'wallet' | Method>('wallet');
  const [walletBalance, setWalletBalance] = useState(0);

  const [deliveryNote, setDeliveryNote] = useState('');
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
        const selectedPackage = (packagesRes.data || []).find((row: any) => row.id === packageId) || null;
        setService(svcRes.data);
        setPkg(selectedPackage);
        setWalletBalance(walletRes.data?.available_funds || 0);

        if (svcRes.data?.seller_id) {
          const { data: s } = await d1Request<{ data: any }>(`/api/profiles/${encodeURIComponent(svcRes.data.seller_id)}`);
          setSeller(s);
        }
      } else if (id) {
        try {
          const { data } = await supabaseWorkerRequest<{ data: any }>(`/api/v1/service-orders/${encodeURIComponent(id)}`);
          setOrder(data);
        } catch (error: unknown) {
          setErrorMsg(error instanceof Error ? error.message : 'Service orders are unavailable until the financial schema is migrated.');
          setLoading(false);
          return;
        }

        if (data) {
          const [svcRes, packagesRes, sellerRes] = await Promise.all([
            d1Request<{ data: any }>(`/api/market/listings/${encodeURIComponent(data.service_id)}`),
            d1Request<{ data: any[] }>(`/api/market/listings/${encodeURIComponent(data.service_id)}/packages`),
            d1Request<{ data: any }>(`/api/profiles/${encodeURIComponent(data.seller_id)}`),
          ]);
          setService(svcRes.data);
          setPkg((packagesRes.data || []).find((row: any) => row.id === data.package_id) || null);
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
      await supabaseWorkerRequest('/api/v1/checkout/service-orders', {
        method: 'POST',
        body: JSON.stringify({ service_id: service.id, package_id: pkg.id, requirements: requirements.trim(), payment_method: payMethod }),
      });
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
      await supabaseWorkerRequest(`/api/v1/service-orders/${encodeURIComponent(order.id)}/delivery`, { method: 'POST', body: JSON.stringify({ delivery_note: deliveryNote.trim(), delivery_file_url: fileUrl }) });
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : 'Service delivery is unavailable.');
      setBusy(false);
      return;
    }

    alert('Delivered! Buyer has 72 hours to review.');
    window.location.reload();
  };

  const approve = async () => {
    if (!window.confirm('Approve this delivery and release funds?')) return;
    setBusy(true);
    try {
      await supabaseWorkerRequest(`/api/v1/service-orders/${encodeURIComponent(order.id)}/approve`, { method: 'POST', body: JSON.stringify({}) });
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
          <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-2">Pay with</p>

          <button
            onClick={() => setPayMethod('wallet')}
            className={`w-full p-3 rounded-xl border-2 mb-2 flex items-center gap-3 ${
              payMethod === 'wallet' ? 'border-accent bg-accent/5' : 'border-gray-200 dark:border-darkline'
            }`}
          >
            <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center text-white">
              <Wallet size={16} />
            </div>
            <div className="flex-1 text-left">
              <p className="text-[12px] font-bold text-navy dark:text-white">Pay from Wallet</p>
              <p className="text-[10px] text-gray-500">Balance: {walletBalance.toLocaleString()} XAF</p>
            </div>
            {payMethod === 'wallet' && <Check size={16} className="text-accent" />}
          </button>

          {METHODS.map(m => (
            <button
              key={m}
              onClick={() => setPayMethod(m)}
              className={`w-full p-3 rounded-xl border-2 mb-2 flex items-center gap-3 ${
                payMethod === m ? 'border-accent bg-accent/5' : 'border-gray-200 dark:border-darkline'
              }`}
            >
              <PaymentMethodLogo method={m} size={32} />
              <p className="flex-1 text-left text-[12px] font-bold text-navy dark:text-white">
                {METHOD_LABELS[m]}
              </p>
              {payMethod === m && <Check size={16} className="text-accent" />}
            </button>
          ))}
        </div>

        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[11px] p-3 rounded-xl mb-3">
          Service-order checkout is paused. Its financial tables and atomic payment settlement are not present in the current Supabase schema; fees will not be estimated or charged in the browser.
        </div>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-[11px] p-3 rounded-xl mb-3">
            {errorMsg}
          </div>
        )}

        <button
          onClick={createOrder}
          disabled={true}
          className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[12px] disabled:opacity-50"
        >
          {busy ? 'Processing...' : 'Service orders unavailable'}
        </button>
      </div>
    );
  }

  // ---------- EXISTING ORDER ----------
  if (!order) return <div className="p-4 text-center text-xs">Order not found.</div>;

  const isSeller = me?.id === order.seller_id;
  const isBuyer = me?.id === order.buyer_id;

  const statusColor: Record<string, string> = {
    hold: 'bg-yellow-100 text-yellow-700',
    delivered: 'bg-blue-100 text-blue-700',
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

        {order.auto_release_deadline_at && order.escrow_status === 'delivered' && (
          <p className="text-[10px] text-gray-500 mt-2 flex items-center gap-1">
            <Clock size={11} /> Auto-releases {new Date(order.auto_release_deadline_at).toLocaleString()}
          </p>
        )}
      </div>

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

      {isSeller && order.escrow_status === 'hold' && (
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

      {isBuyer && order.escrow_status === 'delivered' && (
        <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-3 mb-3 flex flex-col gap-2">
          <button
            onClick={approve}
            disabled={busy}
            className="w-full bg-green-600 text-white font-bold py-2.5 rounded-lg text-[12px] flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <Check size={13} /> {busy ? 'Confirming...' : 'Approve & release funds'}
          </button>
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
