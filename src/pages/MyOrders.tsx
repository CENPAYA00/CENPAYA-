import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, ShoppingBag } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';
import { useI18n } from '../contexts/i18n';

type Order = {
  id: string;
  amount: number;
  escrow_status: string;
  escrow_created_at: string;
  buyer_id: string;
  seller_id: string;
  listing_title: string | null;
  counterparty_username: string | null;
  role: 'buyer' | 'seller';
};

export default function MyOrders() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const me = await getCachedUser();
      if (!me) { setLoading(false); return; }

      const { data } = await supabase
        .from('orders')
        .select('id, amount, escrow_status, escrow_created_at, buyer_id, seller_id, listing_id')
        .or(`buyer_id.eq.${me.id},seller_id.eq.${me.id}`)
        .order('escrow_created_at', { ascending: false })
        .limit(50);

      if (!data || data.length === 0) { setLoading(false); return; }

      const listingIds = [...new Set(data.map((o: any) => o.listing_id))];
      const counterpartyIds = [...new Set(
        data.map((o: any) => (o.buyer_id === me.id ? o.seller_id : o.buyer_id))
      )];

      const [listingsRes, profilesRes] = await Promise.all([
        supabase.from('listings').select('id, title').in('id', listingIds),
        supabase.from('public_profiles').select('id, username').in('id', counterpartyIds),
      ]);

      const listingMap: Record<string, string> = {};
      (listingsRes.data || []).forEach((l: any) => { listingMap[l.id] = l.title; });

      const profileMap: Record<string, string> = {};
      (profilesRes.data || []).forEach((p: any) => { profileMap[p.id] = p.username; });

      setOrders(data.map((o: any) => {
        const role: 'buyer' | 'seller' = o.buyer_id === me.id ? 'buyer' : 'seller';
        const cpId = role === 'buyer' ? o.seller_id : o.buyer_id;
        return {
          id: o.id,
          amount: o.amount,
          escrow_status: o.escrow_status,
          escrow_created_at: o.escrow_created_at,
          buyer_id: o.buyer_id,
          seller_id: o.seller_id,
          listing_title: listingMap[o.listing_id] || null,
          counterparty_username: profileMap[cpId] || null,
          role,
        };
      }));
      setLoading(false);
    };
    load();
  }, []);

  const statusLabel = (s: string) => {
    if (s === 'hold') return t('escrow_hold');
    if (s === 'released' || s === 'auto_released_48h') return t('escrow_released');
    if (s === 'auto_refunded_48h' || s === 'buyer_cancelled' || s === 'seller_rejected' || s === 'agent_voided') return t('escrow_refunded');
    return s;
  };

  const statusColor = (s: string) => {
    if (s === 'hold') return 'bg-yellow-100 text-yellow-700';
    if (s === 'released' || s === 'auto_released_48h') return 'bg-green-100 text-green-700';
    return 'bg-gray-100 text-gray-700';
  };

  if (loading) return <div className="p-4 text-center text-xs">{t('loading')}</div>;

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">{t('my_orders')}</h1>
      </div>

      {orders.length === 0 && (
        <div className="bg-white dark:bg-darkcard rounded-2xl p-6 text-center shadow-sm">
          <Package size={28} className="mx-auto text-gray-400 mb-2" />
          <p className="text-[11px] font-bold text-navy dark:text-white">{t('no_orders')}</p>
        </div>
      )}

      {orders.map(o => (
        <button
          key={o.id}
          onClick={() => navigate(`/order/${o.id}`)}
          className="w-full bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-3 p-3 text-left"
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-navy dark:text-white truncate flex-1">
              {o.role === 'buyer' ? t('bought') : t('sold')}: {o.listing_title || '—'}
            </p>
            <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${statusColor(o.escrow_status)}`}>
              {statusLabel(o.escrow_status)}
            </span>
          </div>
          <p className="text-[10px] text-gray-500 mt-1 flex items-center gap-1">
            <ShoppingBag size={11} /> {t('with')} @{o.counterparty_username || 'User'}
          </p>
          <p className="text-sm font-bold text-accent mt-1">{o.amount.toLocaleString()} XAF</p>
          <p className="text-[9px] text-gray-400 mt-0.5">
            {new Date(o.escrow_created_at).toLocaleString()}
          </p>
        </button>
      ))}
    </div>
  );
}
