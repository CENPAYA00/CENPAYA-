import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Zap, MapPin, Eye } from 'lucide-react';
import { getCachedUser } from '../lib/cache';

export default function MyListings() {
  const navigate = useNavigate();
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const me = await getCachedUser();
      if (!me) { setLoading(false); return; }
      const { data } = await supabase
        .from('listings')
        .select('id, title, price, price_min, price_max, price_is_range, images, location_city, boosted_until, moderation_status, availability, created_at')
        .eq('seller_id', me.id)
        .order('created_at', { ascending: false });
      setListings(data || []);
      setLoading(false);
    };
    load();
  }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this listing permanently?')) return;
    setDeleting(id);
    const { error } = await supabase.from('listings').delete().eq('id', id);
    if (!error) setListings(prev => prev.filter(l => l.id !== id));
    setDeleting(null);
  };

  if (loading) {
    return (
      <div className="px-3 py-3 pb-24 space-y-3">
        <div className="h-32 bg-gray-200 dark:bg-darkcard rounded-2xl animate-pulse" />
        <div className="h-32 bg-gray-200 dark:bg-darkcard rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">My Listings</h1>
        <button
          onClick={() => navigate('/create-listing')}
          className="ml-auto bg-accent text-white text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1"
        >
          <Plus size={12} /> New
        </button>
      </div>

      {listings.length === 0 && (
        <div className="bg-white dark:bg-darkcard p-6 rounded-2xl shadow-sm text-center">
          <p className="text-[11px] font-bold text-navy dark:text-white">No listings yet</p>
          <button
            onClick={() => navigate('/create-listing')}
            className="mt-3 bg-accent text-white text-[10px] font-bold px-4 py-2 rounded-lg"
          >
            Create listing
          </button>
        </div>
      )}

      {listings.map(l => {
        const isBoosted = l.boosted_until && new Date(l.boosted_until) > new Date();
        const images: string[] = Array.isArray(l.images) ? l.images : [];
        const first = images[0];
        const hasRange = l.price_is_range && l.price_min != null;
        const priceLabel = hasRange
          ? `${Number(l.price_min).toLocaleString()} – ${Number(l.price_max ?? l.price_min).toLocaleString()}`
          : `${Number(l.price || 0).toLocaleString()}`;

        return (
          <div key={l.id} className="bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-3 overflow-hidden">
            <div className="flex gap-3 p-3">
              <button
                onClick={() => navigate(`/listing/${l.id}`)}
                className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 dark:bg-darkbg shrink-0"
              >
                {first ? (
                  <img src={first} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[9px] text-gray-400">No img</div>
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-navy dark:text-white line-clamp-2">{l.title}</p>
                <p className="text-[12px] font-black text-accent mt-1">{priceLabel} XAF</p>
                {l.location_city && (
                  <p className="text-[9px] text-gray-400 flex items-center gap-1 mt-0.5">
                    <MapPin size={9} /> {l.location_city}
                  </p>
                )}
                <div className="flex items-center gap-1 mt-1">
                  {isBoosted && (
                    <span className="bg-accent text-white text-[8px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                      <Zap size={8} /> Boosted
                    </span>
                  )}
                  {l.moderation_status === 'approved' && (
                    <span className="bg-green-100 text-green-700 text-[8px] font-bold px-1.5 py-0.5 rounded">Live</span>
                  )}
                  {l.moderation_status === 'pending' && (
                    <span className="bg-yellow-100 text-yellow-700 text-[8px] font-bold px-1.5 py-0.5 rounded">Pending</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center border-t border-gray-100 dark:border-darkline">
              <button
                onClick={() => navigate(`/listing/${l.id}`)}
                className="flex-1 py-2.5 text-[10px] font-bold text-gray-600 dark:text-gray-300 flex items-center justify-center gap-1"
              >
                <Eye size={12} /> View
              </button>
              <button
                onClick={() => navigate('/boosted')}
                className="flex-1 py-2.5 text-[10px] font-bold text-accent flex items-center justify-center gap-1 border-l border-r border-gray-100 dark:border-darkline"
              >
                <Zap size={12} /> Boost
              </button>
              <button
                onClick={() => handleDelete(l.id)}
                disabled={deleting === l.id}
                className="flex-1 py-2.5 text-[10px] font-bold text-red-500 flex items-center justify-center gap-1 disabled:opacity-50"
              >
                <Trash2 size={12} /> {deleting === l.id ? '...' : 'Delete'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
        }
