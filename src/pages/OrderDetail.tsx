import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data } = await supabase.from('orders').select('*').eq('id', id).single();
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

    const filePath = `proofs/${order.id}_${Date.now()}_${photoFile.name}`;
    const { error: upErr } = await supabase.storage.from('listings').upload(filePath, photoFile);
    if (upErr) { setErrorMsg('Upload failed: ' + upErr.message); setActionLoading(false); return; }
    const { data: urlData } = supabase.storage.from('listings').getPublicUrl(filePath);

    const { error } = await supabase.rpc('seller_mark_delivered', {
      p_order_id: order.id,
      p_photo_url: urlData.publicUrl,
      p_photo_hash: filePath,
    });

    if (error) setErrorMsg(error.message);
    else { setOrder({ ...order, seller_confirmed_delivered: true, photo_proof_url: urlData.publicUrl }); alert('Marked delivered.'); }
    setActionLoading(false);
  };

  const handleBuyerConfirm = async () => {
    setErrorMsg('');
    setActionLoading(true);
    const { error } = await supabase.rpc('buyer_mark_received', { p_order_id: order.id });
    if (error) setErrorMsg(error.message);
    else { setOrder({ ...order, buyer_confirmed_received: true, escrow_status: 'released' }); alert('Funds released to seller.'); }
    setActionLoading(false);
  };

  const handleDispute = async () => {
    setErrorMsg('');
    const reason = prompt('Describe the problem:');
    if (!reason) return;
    setActionLoading(true);
    const { error } = await supabase.from('order_disputes').insert({ order_id: order.id, raised_by: userId, reason, status: 'open' });
    if (error) setErrorMsg(error.message);
    else {
      await supabase.rpc('transition_escrow', { p_order_id: order.id, p_target_status: 'disputed' });
      setOrder({ ...order, escrow_status: 'disputed', dispute_hold: true });
      alert('Dispute opened.');
    }
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
