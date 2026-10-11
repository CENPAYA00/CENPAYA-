import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Check, Upload, AlertCircle, Shield } from 'lucide-react';
import { getCachedUser } from '../lib/cache';

export default function ServiceOrder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [isSeller, setIsSeller] = useState(false);
  const [isBuyer, setIsBuyer] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const load = async () => {
      const u = await getCachedUser();
      if (!u) return;
      const { data } = await supabase
        .from('service_orders')
        .select('*')
        .eq('id', id)
        .single();
      if (data) {
        setOrder(data);
        setIsSeller(data.seller_id === u.id);
        setIsBuyer(data.buyer_id === u.id);
      }
      setLoading(false);
    };
    load();
  }, [id]);

  const handleDeliver = async () => {
    if (!file) {
      setErrorMsg('Upload delivery file first.');
      return;
    }
    setBusy(true);
    setErrorMsg('');
    const path = `service-deliveries/${order.id}_${file.name}`;
    const { error: upErr } = await supabase.storage
      .from('listings')
      .upload(path, file);
    if (upErr) {
      setErrorMsg(upErr.message);
      setBusy(false);
      return;
    }
    const { data } = supabase.storage.from('listings').getPublicUrl(path);
    await supabase
      .from('service_orders')
      .update({
        delivery_file_url: data.publicUrl,
        escrow_status: 'delivered',
      })
      .eq('id', order.id);
    setOrder({
      ...order,
      delivery_file_url: data.publicUrl,
      escrow_status: 'delivered',
    });
    setBusy(false);
  };

  const handleConfirm = async () => {
    setBusy(true);
    await supabase
      .from('service_orders')
      .update({
        buyer_confirmed_received: true,
        escrow_status: 'released',
      })
      .eq('id', order.id);
    setOrder({
      ...order,
      buyer_confirmed_received: true,
      escrow_status: 'released',
    });
    setBusy(false);
  };

  const handleDispute = async () => {
    const reason = prompt('Describe the issue:');
    if (!reason) return;
    await supabase.from('order_disputes').insert({
      order_id: order.id,
      raised_by: order.buyer_id,
      reason,
      status: 'open',
    });
    await supabase
      .from('service_orders')
      .update({ escrow_status: 'disputed' })
      .eq('id', order.id);
    setOrder({ ...order, escrow_status: 'disputed' });
  };

  if (loading)
    return <div className="p-4 text-center text-xs">Loading...</div>;
  if (!order)
    return <div className="p-4 text-center text-xs">Order not found.</div>;

  const statusColor: Record<string, string> = {
    hold: 'bg-yellow-100 text-yellow-700',
    delivered: 'bg-blue-100 text-blue-700',
    released: 'bg-green-100 text-green-700',
    disputed: 'bg-red-100 text-red-700',
  };

  return (
    <div className="px-3 py-3 pb-24">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => navigate(-1)}
          className="text-brand p-1"
          aria-label="Go back"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-sm font-semibold flex-1">Service Order</h1>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
            statusColor[order.escrow_status] || 'bg-gray-100 text-gray-600'
          }`}
        >
          {order.escrow_status}
        </span>
      </div>

      {/* Error banner */}
      {errorMsg && (
        <div className="flex items-center gap-1 text-[11px] text-red-600 bg-red-50 p-2 rounded mb-2">
          <AlertCircle size={12} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Order summary */}
      <div className="border border-gray-200 rounded-lg p-3 mb-3">
        <div className="flex items-center gap-1 text-[11px] text-gray-500 mb-1">
          <Shield size={12} /> Escrow protected
        </div>
        <p className="text-xs text-gray-700">
          Order ID: <span className="font-mono">{order.id}</span>
        </p>
        {order.amount != null && (
          <p className="text-xs text-gray-700 mt-1">
            Amount: <span className="font-semibold">${order.amount}</span>
          </p>
        )}
      </div>

      {/* Delivery file */}
      {order.delivery_file_url && (
        <div className="border border-gray-200 rounded-lg p-3 mb-3">
          <p className="text-[11px] font-medium mb-1">Delivery</p>
          <a
            href={order.delivery_file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand text-xs underline"
          >
            View delivered file
          </a>
        </div>
      )}

      {/* Seller actions */}
      {isSeller && order.escrow_status === 'hold' && (
        <div className="border border-gray-200 rounded-lg p-3 mb-3">
          <p className="text-[11px] font-medium mb-2">Deliver your service</p>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="text-xs mb-2 block w-full"
          />
          <button
            onClick={handleDeliver}
            disabled={busy}
            className="flex items-center gap-1 bg-brand text-white text-xs px-3 py-2 rounded disabled:opacity-50"
          >
            <Upload size={12} />
            {busy ? 'Uploading...' : 'Mark as delivered'}
          </button>
        </div>
      )}

      {/* Buyer actions */}
      {isBuyer && order.escrow_status === 'delivered' && (
        <div className="border border-gray-200 rounded-lg p-3 mb-3 flex flex-col gap-2">
          <button
            onClick={handleConfirm}
            disabled={busy}
            className="flex items-center justify-center gap-1 bg-green-600 text-white text-xs px-3 py-2 rounded disabled:opacity-50"
          >
            <Check size={12} />
            {busy ? 'Confirming...' : 'Confirm received'}
          </button>
          <button
            onClick={handleDispute}
            className="flex items-center justify-center gap-1 border border-red-300 text-red-600 text-xs px-3 py-2 rounded"
          >
            <AlertCircle size={12} />
            Raise dispute
          </button>
        </div>
      )}

      {/* Released / disputed state */}
      {order.escrow_status === 'released' && (
        <div className="text-xs text-green-700 bg-green-50 p-3 rounded flex items-center gap-1">
          <Check size={12} /> Order completed. Funds released to seller.
        </div>
      )}
      {order.escrow_status === 'disputed' && (
        <div className="text-xs text-red-700 bg-red-50 p-3 rounded flex items-center gap-1">
          <AlertCircle size={12} /> Order is under dispute. Support will
          review.
        </div>
      )}
    </div>
  );
  }
