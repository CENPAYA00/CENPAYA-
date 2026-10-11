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
      const { data } = await supabase.from('service_orders').select('*').eq('id', id).single();
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
    if (!file) return setErrorMsg('Upload delivery file first.');
    setBusy(true);
    const path = `service-deliveries/${order.id}_${file.name}`;
    const { error: upErr } = await supabase.storage.from('listings').upload(path, file);
    if (upErr) { setErrorMsg(upErr.message); setBusy(false); return; }
    const { data } = supabase.storage.from('listings').getPublicUrl(path);
    await supabase.from('service_orders').update({ delivery_file_url: data.publicUrl, escrow_status: 'delivered' }).eq('id', order.id);
    setOrder({ ...order, delivery_file_url: data.publicUrl, escrow_status: 'delivered' });
    setBusy(false);
  };

  const handleConfirm = async () => {
    setBusy(true);
    await supabase.from('service_orders').update({ buyer_confirmed_received: true, escrow_status: 'released' }).eq('id', order.id);
    setOrder({ ...order, buyer_confirmed_received: true, escrow_status: 'released' });
    setBusy(false);
  };

  const handleDispute = async () => {
    const reason = prompt('Describe the issue:');
    if (!reason) return;
    await supabase.from('order_disputes').insert({ order_id: order.id, raised_by: order.buyer_id, reason, status: 'open' });
    await supabase.from('service_orders').update({ escrow_status: 'disputed' }).eq('id', order.id);
    setOrder({ ...order, escrow_status: 'disputed' });
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;
  if (!order) return <div className="p-4 text-center text-xs">Order not found.</div>;

  const statusColor: Record<string, string> = {
    hold: 'bg-yellow-100 text-yellow-700',
    delivered: 'bg-blue-100 text-blue-700',
    released: 'bg-green-100 text-green-700',
    disputed: 'bg-red-100 text-red-700',
  };

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand"><Arrow
