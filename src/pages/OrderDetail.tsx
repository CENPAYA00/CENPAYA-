import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { supabaseWorkerRequest } from '../lib/supabaseWorkerApi';
import { d1Me, d1Request } from '../lib/d1Api';
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
  const [deliveryVideoFile, setDeliveryVideoFile] = useState<File | null>(null);
  const [deliveryVideos, setDeliveryVideos] = useState<any[]>([]);
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
      try {
        const workflow = await d1Request<{ data: { deliveries?: any[] } }>(`/api/market/orders/${encodeURIComponent(id || '')}`);
        setDeliveryVideos((workflow.data.deliveries || []).flatMap((delivery: any) => (delivery.videos || []).map((video: any) => ({ ...video, delivery_id: delivery.id }))));
      } catch { /* The financial order remains available even if its non-financial media projection is temporarily unavailable. */ }
      setLoading(false);
    };
    load();
  }, [id]);

  const handleSellerDeliver = async () => {
    setErrorMsg('');
    if (!photoFile && !deliveryVideoFile) return setErrorMsg('Upload a photo or a delivery video before marking delivered.');
    setActionLoading(true);
    let videoIds: string[] = [];
    let photoUrl: string | null = null;
    let photoHash: string | null = null;
    try {
      if (deliveryVideoFile) {
        if (!deliveryVideoFile.type.startsWith('video/') || deliveryVideoFile.size > 500 * 1024 * 1024) throw new Error('Choose a supported video up to 500 MB.');
        const intent = await d1Request<{ data: { video_id: string; upload_url: string; method: string; headers: Record<string, string>; max_duration_seconds: number } }>('/api/video-assets/upload-intent', {
          method: 'POST', body: JSON.stringify({ purpose: 'delivery', related_id: order.id, mime_type: deliveryVideoFile.type, size_bytes: deliveryVideoFile.size, filename: deliveryVideoFile.name }),
        });
        const uploadResponse = await fetch(intent.data.upload_url, { method: intent.data.method, headers: intent.data.headers, body: deliveryVideoFile });
        if (!uploadResponse.ok) throw new Error('Delivery video upload failed.');
        await d1Request(`/api/video-assets/${encodeURIComponent(intent.data.video_id)}/complete`, { method: 'POST', body: JSON.stringify({}) });
        let ready = false;
        for (let attempt = 0; attempt < 120; attempt++) {
          await new Promise(resolve => window.setTimeout(resolve, 3000));
          const status = await d1Request<{ data: { status: string } }>(`/api/video-assets/${encodeURIComponent(intent.data.video_id)}/status`);
          if (status.data.status === 'ready') { ready = true; break; }
          if (status.data.status === 'failed') throw new Error('Delivery video processing failed.');
        }
        if (!ready) throw new Error('Delivery video is still processing. Please try again shortly.');
        videoIds = [intent.data.video_id];
      }
      if (photoFile) {
        const filePath = `proofs/${order.id}_${Date.now()}_${photoFile.name}`;
        const { error: upErr } = await supabase.storage.from('listings').upload(filePath, photoFile);
        if (upErr) throw new Error('Photo upload failed: ' + upErr.message);
        const { data: urlData } = supabase.storage.from('listings').getPublicUrl(filePath);
        photoUrl = urlData.publicUrl;
        photoHash = filePath;
      }
      await d1Request(`/api/market/orders/${encodeURIComponent(order.id)}/delivery`, {
        method: 'POST', body: JSON.stringify({ delivery_note: 'Seller submitted delivery evidence.', video_ids: videoIds }),
      });
      await supabaseWorkerRequest(`/api/v1/orders/${encodeURIComponent(order.id)}/action`, {
        method: 'POST', body: JSON.stringify({ action: 'mark_delivered', photo_url: photoUrl, photo_hash: photoHash }),
      });
      setOrder({ ...order, seller_confirmed_delivered: true, photo_proof_url: photoUrl });
      setDeliveryVideoFile(null);
      alert('Marked delivered.');
    } catch (error: unknown) { setErrorMsg(error instanceof Error ? error.message : 'Could not mark order delivered.'); }
    setActionLoading(false);
  };

  const handleBuyerConfirm = async () => {
    setErrorMsg('');
    setActionLoading(true);
    try {
      await supabaseWorkerRequest(`/api/v1/orders/${encodeURIComponent(order.id)}/action`, { method: 'POST', body: JSON.stringify({ action: 'mark_received' }) });
      await d1Request(`/api/market/orders/${encodeURIComponent(order.id)}/accept`, { method: 'POST', body: JSON.stringify({}) }).catch(() => {});
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
      {deliveryVideos.length > 0 && (
        <div className="bg-white p-3 rounded-2xl shadow-sm mb-3">
          <p className="text-[10px] font-bold text-navy mb-2">Delivery Video Evidence</p>
          {deliveryVideos.map((video: any) => (
            <button key={video.id} type="button" onClick={async () => {
              try {
                const result = await d1Request<{ data: { url: string } }>(`/api/video-assets/${encodeURIComponent(video.id)}/download`);
                window.open(result.data.url, '_blank', 'noopener,noreferrer');
              } catch (error: any) { setErrorMsg(error.message || 'Video is unavailable.'); }
            }} className="w-full text-left p-2 rounded-lg bg-gray-50 text-[11px] text-accent underline mb-1">
              Play / download delivery video · {Math.round(Number(video.duration_seconds || 0))} seconds
            </button>
          ))}
        </div>
      )}

      {isSeller && order.escrow_status === 'hold' && !order.seller_confirmed_delivered && (
        <div className="bg-white p-3 rounded-2xl shadow-sm mb-3">
          <p className="text-[11px] font-bold text-navy mb-2">Seller: Mark Delivered</p>
          <input type="file" accept="image/*" onChange={e => setPhotoFile(e.target.files?.[0] || null)} className="w-full p-2 border rounded-lg text-[10px] mb-2" />
          <label className="block text-[10px] font-semibold text-gray-600 mb-1">Or add a delivery video (maximum 3 minutes)</label>
          <input type="file" accept="video/mp4,video/quicktime,video/webm,video/x-matroska" onChange={e => setDeliveryVideoFile(e.target.files?.[0] || null)} className="w-full p-2 border rounded-lg text-[10px] mb-2" />
          <button onClick={handleSellerDeliver} disabled={actionLoading || (!photoFile && !deliveryVideoFile)} className="w-full bg-accent text-white font-bold py-2.5 rounded-lg text-[11px] disabled:opacity-50 flex items-center justify-center gap-1">
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
