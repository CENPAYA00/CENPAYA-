import { useEffect, useState } from 'react';
import { d1Request } from '../lib/d1Api';
import { supabaseWorkerRequest } from '../lib/supabaseWorkerApi';
import { d1Me } from '../lib/d1Api';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Check, AlertCircle, Shield } from 'lucide-react';

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [isSeller, setIsSeller] = useState(false);
  const [isBuyer, setIsBuyer] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const load = async () => {
      const { user } = await d1Me();
      if (!user) return;
      setUserId(user.id);
      const { data } = await supabaseWorkerRequest<{ data: any }>(`/api/v1/orders/${encodeURIComponent(id || '')}`);
      if (data) {
        setOrder(data);
        setIsSeller(data.seller_id === user.id);
        setIsBuyer(data.buyer_id === user.id);
      }
      setLoading(false);
    };
    load();
  }, [id]);

  const handleSellerDeliver = async () => {
    setErrorMsg('');
    if (!photoFile) return setErrorMsg('Upload photo proof before marking delivered.');
    setActionLoading(true);

    let photoUrl = '';
    let photoHash = '';
    try {
      const form = new FormData();
      form.append('file', photoFile);
      form.append('folder', 'listings/images');
      const uploaded = await d1Request<{ url: string }>('/api/market/media', { method: 'POST', body: form });
      photoUrl = uploaded.url || '';
      if (!photoUrl) throw new Error('Upload did not return a media URL.');
      const digest = await crypto.subtle.digest('SHA-256', await photoFile.arrayBuffer());
      photoHash = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
      await supabaseWorkerRequest(`/api/v1/orders/${encodeURIComponent(order.id)}/action`, {
        method: 'POST', body: JSON.stringify({ action: 'mark_delivered', photo_url: photoUrl, photo_hash: photoHash }),
      });
      setOrder({ ...order, seller_confirmed_delivered: true, photo_proof_url: photoUrl });
      alert('Marked delivered.');
    } catch (error: unknown) { setErrorMsg(error instanceof Error ? error.message : 'Could not mark order delivered.'); }
    setActionLoading(false);
  };

  const handleBuyerConfirm = async () => {
    setErrorMsg('');
    setActionLoading(true);
    try {
      await supabaseWorkerRequest(`/api/v1/orders/${encodeURIComponent(order.id)}/action`, { method: 'POST', body: JSON.stringify({ action: 'mark_received' }) });
      setOrder({ ...order, buyer_confirmed_received: true, escrow_status: 'released' });
      alert('Funds released to seller.');
    } catch (error: unknown) { setErrorMsg(error instanceof Error ? error.message : 'Could not confirm delivery.'); }
    setActionLoading(false);
  };

  const handleDispute = async () => {
    setErrorMsg('');
    const reason = prompt('Describe the problem:');
    if (!reason) return;
    setActionLoading(true);
    try {
      await supabaseWorkerRequest(`/api/v1/orders/${encodeURIComponent(order.id)}/action`, { method: 'POST', body: JSON.stringify({ action: 'dispute', reason: reason.trim() }) });
      setOrder({ ...order, escrow_status: 'disputed', dispute_hold: true });
      alert('Dispute opened.');
    } catch (error: unknown) { setErrorMsg(error instanceof Error ? error.message : 'Could not open dispute.'); }
    setActionLoading(false);
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;
  if (!order) return <div className="p-4 text-center text-xs">Order not found.</div>;

  const statusColors: Record<string, string> = {
    hold: 'bg-yellow-100 text-yellow-700',
    released: 'bg-green-100 text-green-700',
    auto_released_48h: 'bg-green-100 text-green-700',
    auto_refunded_48h: 'bg-red-100 text-red-700',
    disputed: 'bg-red-100 text-red-700',
  };

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy">Order Details</h1>
      </div>

      <div className="bg-white p-3 rounded-2xl shadow-sm mb-3">
        <p className="text-[10px] text-gray-500">Order ID</p>
        <p className="text-[11px] font-mono font-bold text-navy mb-2">#{order.id.slice(0, 8)}</p>
        <div className="flex justify-between text-[10px] mb-1">
          <span className="text-gray-500">Amount</span>
          <span className="font-bold text-navy">{order.amount?.toLocaleString()} XAF</span>
        </div>
        <div className="flex justify-between text-[10px] mb-2">
          <span className="text-gray-500">Status</span>
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${statusColors[order.escrow_status] || 'bg-gray-100 text-gray-700'}`}>
            {order.escrow_status}
          </span>
        </div>
        {order.escrow_status === 'hold' && (
          <div className="flex items-center gap-1.5 text-[10px] text-yellow-700 bg-yellow-50 p-2 rounded-lg">
            <Shield size={12} /> Funds held in escrow.
          </div>
        )}
      </div>

      {order.photo_proof_url && (
        <div className="bg-white p-3 rounded-2xl shadow-sm mb-3">
          <p className="text-[10px] font-bold text-navy mb-2">Photo Proof</p>
          <img src={order.photo_proof_url} alt="Proof" className="w-full rounded-lg" />
        </div>
      )}

      {isSeller && order.escrow_status === 'hold' && !order.seller_confirmed_delivered && (
        <div className="bg-white p-3 rounded-2xl shadow-sm mb-3">
          <p className="text-[11px] font-bold text-navy mb-2">Seller: Mark Delivered</p>
          <input type="file" accept="image/*" onChange={e => setPhotoFile(e.target.files?.[0] || null)} className="w-full p-2 border rounded-lg text-[10px] mb-2" />
          <button onClick={handleSellerDeliver} disabled={actionLoading || !photoFile} className="w-full bg-accent text-white font-bold py-2.5 rounded-lg text-[11px] disabled:opacity-50 flex items-center justify-center gap-1">
            <Upload size={12} /> {actionLoading ? 'Uploading...' : 'Mark Delivered'}
          </button>
        </div>
      )}

      {isBuyer && order.escrow_status === 'hold' && order.seller_confirmed_delivered && !order.buyer_confirmed_received && (
        <div className="bg-white p-3 rounded-2xl shadow-sm mb-3">
          <p className="text-[11px] font-bold text-navy mb-2">Buyer: Confirm Receipt</p>
          <button onClick={handleBuyerConfirm} disabled={actionLoading} className="w-full bg-green-600 text-white font-bold py-2.5 rounded-lg text-[11px] disabled:opacity-50 flex items-center justify-center gap-1">
            <Check size={12} /> Confirm & Release Funds
          </button>
        </div>
      )}

      {(isBuyer || isSeller) && order.escrow_status === 'hold' && (
        <button onClick={handleDispute} disabled={actionLoading} className="w-full bg-red-50 text-red-600 font-bold py-2.5 rounded-lg text-[11px] mb-3 flex items-center justify-center gap-1">
          <AlertCircle size={12} /> Open Dispute
        </button>
      )}

      {errorMsg && <div className="bg-red-50 border border-red-200 text-red-600 text-[10px] p-2 rounded-lg mb-3">{errorMsg}</div>}
    </div>
  );
    }
