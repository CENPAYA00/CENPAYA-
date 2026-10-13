import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
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
  const [buyer, setBuyer] = useState<any>(null);
  const [seller, setSeller] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [requirements, setRequirements] = useState('');
  const [payMethod, setPayMethod] = useState<'wallet' | Method>('wallet');
  const [walletBalance, setWalletBalance] = useState(0);

  const [deliveryNote, setDeliveryNote] = useState('');
  const [deliveryFile, setDeliveryFile] = useState<File | null>(null);

  useEffect(() => {
    const load = async () => {
      const me = await getCachedUser();
      if (!me) { setLoading(false); return; }

      if (isNew) {
        const serviceId = search.get('service')!;
        const packageId = search.get('package')!;

        const [svcRes, pkgRes, walletRes] = await Promise.all([
          supabase.from('services').select('*').eq('id', serviceId).single(),
          supabase.from('service_packages').select('*').eq('id', packageId).single(),
          supabase.from('wallets').select('available_funds').eq('user_id', me.id).single(),
        ]);

        setService(svcRes.data);
        setPkg(pkgRes.data);
        setWalletBalance(walletRes.data?.available_funds || 0);

        if (svcRes.data?.seller_id) {
          const { data: s } = await supabase
            .from('public_profiles')
            .select('id, username, avatar_url')
            .eq('id', svcRes.data.seller_id)
            .maybeSingle();
          setSeller(s);
        }
      } else if (id) {
        const { data } = await supabase.from('service_orders').select('*').eq('id', id).single();
        setOrder(data);

        if (data) {
          const [svcRes, pkgRes, buyerRes, sellerRes] = await Promise.all([
            supabase.from('services').select('*').eq('id', data.service_id).single(),
            data.package_id ? supabase.from('service_packages').select('*').eq('id', data.package_id).single() : Promise.resolve({ data: null }),
            supabase.from('public_profiles').select('id, username, avatar_url').eq('id', data.buyer_id).maybeSingle(),
            supabase.from('public_profiles').select('id, username, avatar_url').eq('id', data.seller_id).maybeSingle(),
          ]);
          setService(svcRes.data);
          setPkg(pkgRes.data);
          setBuyer(buyerRes.data);
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
    const me = await getCachedUser();
    if (!me) return;

    setBusy(true);

    if (payMethod === 'wallet') {
      const { data, error } = await supabase.rpc('create_service_order', {
        p_service_id: service.id,
        p_package_id: pkg.id,
        p_requirements: requirements.trim(),
        p_pay_from_wallet: true,
      });
      if (error || !data?.ok) {
        setErrorMsg(error?.message || data?.error || 'Order failed');
        setBusy(false);
        return;
      }
      navigate(`/service-order/${data.order_id}`);
    } else {
      const { data, error } = await supabase.functions.invoke('initiate-service-payment', {
        body: {
          service_id: service.id,
          package_id: pkg.id,
          buyer_id: me.id,
          requirements: requirements.trim(),
          method: payMethod,
        },
      });
      if (error || !data?.payment_url) {
        setErrorMsg(error?.message || 'Payment initiation failed');
        setBusy(false);
        return;
      }
      window.location.href = data.payment_url;
    }
    setBusy(false);
  };

  const submitDelivery = async () => {
    setErrorMsg('');
    if (!deliveryNote.trim()) return setErrorMsg('Add a delivery note.');
    setBusy(true);

    const me = await getCachedUser();
    if (!me) { setBusy(false); return; }

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

    const { data, error } = await supabase.rpc('submit_service_delivery', {
      p_order_id: order.id,
      p_delivery_note: deliveryNote.trim(),
      p_delivery_file_url: fileUrl,
    });

    if (error || !data?.ok) {
      setErrorMsg(error?.message || data?.error || 'Delivery failed');
      setBusy(false);
      return;
    }

    alert('Delivered! Buyer has 72 hours to review.');
    window.location.reload();
  };

  const approve = async () => {
    if (!window.confirm('Approve this delivery and release funds?')) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('approve_service_delivery', { p_order_id: order.id });
    if (error || !data?.ok) {
      setErrorMsg(error?.message || data?.error || 'Approval failed');
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
    const { data, error } = await supabase.rpc('open_service_dispute', {
      p_order_id: order.id,
      p_reason: reason.trim(),
    });
    if (error || !data?.ok) {
      setErrorMsg(error?.message || data?.error || 'Dispute failed');
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
    const feePct = 3;
    const feeFixed = 50;
    const fee = amount * feePct / 100 + feeFixed;
    const total = amount + fee;

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

        <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-3 mb-3">
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-gray-500">Service amount</span>
            <span className="text-navy dark:text-white">{amount.toLocaleString()} XAF</span>
          </div>
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-gray-500">Transaction fee ({feePct}% + {feeFixed})</span>
            <span className="text-navy dark:text-white">{fee.toFixed(0)} XAF</span>
          </div>
          <div className="flex justify-between text-[13px] font-bold border-t border-gray-100 dark:border-darkline pt-2 mt-2">
            <span className="text-navy dark:text-white">Total</span>
            <span className="text-accent">{total.toLocaleString()} XAF</span>
          </div>
        </div>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-[11px] p-3 rounded-xl mb-3">
            {errorMsg}
          </div>
        )}

        <button
          onClick={createOrder}
          disabled={busy || !requirements.trim()}
          className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[12px] disabled:opacity-50"
        >
          {busy ? 'Processing...' : `Pay ${total.toLocaleString()} XAF`}
        </button>
      </div>
    );
  }

  // ---------- EXISTING ORDER ----------
  if (!order) return <div className="p-4 text-center text-xs">Order not found.</div>;

  const me = await getCachedUser();
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
            <a
              href={order.delivery_file_url}
              target="_blank"
              rel="noreferrer"
              className="text-accent text-[11px] font-bold underline"
            >
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

      {order.escrow_status === 'released' || order.escrow_status === 'auto_released_72h' ? (
        <div className="text-[12px] text-green-700 bg-green-50 p-3 rounded-xl flex items-center gap-1">
          <Check size={13} /> Completed. Funds released to seller.
        </div>
      ) : null}

      {order.escrow_status === 'disputed' && (
        <div className="text-[12px] text-red-700 bg-red-50 p-3 rounded-xl flex items-center gap-1">
          <AlertTriangle size={13} /> Under dispute. Support will review.
        </div>
      )}
    </div>
  );
}
