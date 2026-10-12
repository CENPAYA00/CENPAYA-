import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Zap, Store } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';
import { useI18n } from '../contexts/i18n';

export default function Boosted() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [boosting, setBoosting] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const me = await getCachedUser();
      if (!me) { setLoading(false); return; }

      const { data } = await supabase
        .from('listings')
        .select('id, title, price, images, boost_tier, boosted_until, moderation_status')
        .eq('seller_id', me.id)
        .eq('moderation_status', 'approved')
        .order('created_at', { ascending: false });

      setListings(data || []);
      setLoading(false);
    };
    load();
  }, []);

  const boost = async (listingId: string, tier: 'basic' | 'standard' | 'premium') => {
    setBoosting(listingId);
    const { data, error } = await supabase.rpc('boost_listing', {
      p_listing_id: listingId,
      p_seller_id: (await getCachedUser())?.id,
      p_tier: tier,
      p_payment_method: 'wallet',
    });
    if (error || (data && !data.ok)) {
      alert((error?.message) || (data?.error) || 'Boost failed');
    } else {
      alert('Listing boosted!');
      window.location.reload();
    }
    setBoosting(null);
  };

  if (loading) return <div className="p-4 text-center text-xs">{t('loading')}</div>;

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">{t('boosted')}</h1>
      </div>

      {listings.length === 0 && (
        <div className="bg-white dark:bg-darkcard rounded-2xl p-6 text-center shadow-sm">
          <Store size={28} className="mx-auto text-gray-400 mb-2" />
          <p className="text-[11px] font-bold text-navy dark:text-white">No listings to boost</p>
          <p className="text-[9px] text-gray-500 mt-1">Create a listing first, then boost it here.</p>
          <button
            onClick={() => navigate('/create-listing')}
            className="mt-3 bg-accent text-white text-[10px] font-bold px-4 py-2 rounded-lg"
          >
            Create listing
          </button>
        </div>
      )}

      {listings.map(l => {
        const isActive = l.boosted_until && new Date(l.boosted_until) > new Date();
        return (
          <div key={l.id} className="bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-3 overflow-hidden">
            <div className="flex items-center gap-3 p-3">
              {l.images?.[0] && (
                <img src={l.images[0]} alt="" className="w-14 h-14 rounded-lg object-cover bg-gray-100" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-navy dark:text-white truncate">{l.title}</p>
                <p className="text-[10px] text-accent font-bold mt-0.5">
                  {Number(l.price).toLocaleString()} XAF
                </p>
                {isActive && (
                  <p className="text-[9px] text-green-600 font-bold mt-0.5">
                    Boosting until {new Date(l.boosted_until).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
            <div className="border-t border-gray-100 dark:border-darkline grid grid-cols-3">
              {(['basic', 'standard', 'premium'] as const).map(tier => (
                <button
                  key={tier}
                  disabled={boosting === l.id}
                  onClick={() => boost(l.id, tier)}
                  className="flex flex-col items-center py-2 text-[10px] font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-darkbg disabled:opacity-50"
                >
                  <Zap size={12} className="text-accent" />
                  {tier}
                  <span className="text-[9px] text-gray-500">
                    {tier === 'basic' ? '500' : tier === 'standard' ? '1000' : '2000'} XAF
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
