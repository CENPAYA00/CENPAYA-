import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Zap, MapPin, Eye, Check } from 'lucide-react';
import { getCachedUser } from '../lib/cache';
import BoostModal from '../components/BoostModal'; // ADDED: Import the modal

export default function MyListings() {
  const navigate = useNavigate();
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [boostTarget, setBoostTarget] = useState<any>(null); // ADDED: State for the boost modal

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
      <div className="px-4 py-4 pb-24 space-y-4 max-w-2xl mx-auto">
        <div className="h-32 bg-gray-200 dark:bg-darkcard rounded-[20px] animate-pulse" />
        <div className="h-32 bg-gray-200 dark:bg-darkcard rounded-[20px] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="px-4 py-4 pb-24 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-5 mt-1">
        <button onClick={() => navigate(-1)} className="text-navy dark:text-white"><ArrowLeft size={22} /></button>
        <h1 className="text-[22px] font-bold text-navy dark:text-white">My Listings</h1>
        <button
          onClick={() => navigate('/create-listing')}
          className="ml-auto bg-[#12935a] text-white text-[12px] font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 active:scale-95 transition-transform"
        >
          <Plus size={14} /> New
        </button>
      </div>

      {listings.length === 0 && (
        <div className="bg-white dark:bg-darkcard p-8 rounded-[20px] shadow-sm text-center border border-gray-100 dark:border-darkline">
          <Store size={32} className="mx-auto text-gray-400 mb-3" />
          <p className="text-[15px] font-bold text-navy dark:text-white">No listings yet</p>
          <button
            onClick={() => navigate('/create-listing')}
            className="mt-4 bg-[#12935a] text-white text-[13px] font-bold px-5 py-2.5 rounded-xl active:scale-95 transition-transform"
          >
            Create listing
          </button>
        </div>
      )}

      {listings.map(l => {
        const isBoosted = l.boosted_until && new Date(l.boosted_until) > new Date();
        const images: string[] = Array.isArray(l.images) ? l.images : (typeof l.images === 'string' ? l.images.split(',') : []);
        const first = images[0];
        const hasRange = l.price_is_range && l.price_min != null;
        const priceLabel = hasRange
          ? `${Number(l.price_min).toLocaleString()} – ${Number(l.price_max ?? l.price_min).toLocaleString()}`
          : `${Number(l.price || 0).toLocaleString()}`;

        return (
          <div key={l.id} className="bg-white dark:bg-darkcard rounded-[20px] shadow-sm mb-4 overflow-hidden border border-gray-100 dark:border-darkline">
            <div className="flex gap-4 p-4">
              <button
                onClick={() => navigate(`/listing/${l.id}`)}
                className="w-24 h-24 rounded-2xl overflow-hidden bg-gray-100 dark:bg-darkline shrink-0 relative"
              >
                {first ? (
                  <img src={first} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">No img</div>
                )}
                {isBoosted && (
                   <div className="absolute top-1 right-1 bg-[#12935a] p-1 rounded-md">
                     <Zap size={10} className="text-white" fill="currentColor" />
                   </div>
                )}
              </button>
              
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <p className="text-[15px] font-bold text-navy dark:text-white line-clamp-2">{l.title}</p>
                <p className="text-[16px] font-black text-[#12935a] mt-1">{priceLabel} <span className="text-[11px] text-mute">XAF</span></p>
                {l.location_city && (
                  <p className="text-[12px] text-mute flex items-center gap-1 mt-1">
                    <MapPin size={12} /> {l.location_city}
                  </p>
                )}
                
                <div className="flex items-center gap-2 mt-2">
                  {l.moderation_status === 'approved' && (
                    <span className="bg-[#eaf6ef] text-[#12935a] text-[10px] font-bold px-2 py-0.5 rounded-md">Live</span>
                  )}
                  {l.moderation_status === 'pending' && (
                    <span className="bg-yellow-100 text-yellow-700 text-[10px] font-bold px-2 py-0.5 rounded-md">Pending</span>
                  )}
                  {isBoosted && (
                    <span className="bg-[#12935a] text-white text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                      <Check size={10} /> Boosted
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center border-t border-gray-100 dark:border-darkline">
              <button
                onClick={() => navigate(`/listing/${l.id}`)}
                className="flex-1 py-3 text-[13px] font-bold text-gray-600 dark:text-gray-300 flex items-center justify-center gap-1.5 active:bg-gray-50 dark:active:bg-white/5"
              >
                <Eye size={15} /> View
              </button>
              
              {/* CHANGED: Opens the Boost Modal directly instead of navigating to /boosted */}
              <button
                onClick={() => setBoostTarget(l)}
                className="flex-1 py-3 text-[13px] font-bold text-[#12935a] flex items-center justify-center gap-1.5 border-l border-r border-gray-100 dark:border-darkline active:bg-[#eaf6ef] dark:active:bg-[#12935a]/10"
              >
                <Zap size={15} /> {isBoosted ? 'Extend' : 'Boost'}
              </button>
              
              <button
                onClick={() => handleDelete(l.id)}
                disabled={deleting === l.id}
                className="flex-1 py-3 text-[13px] font-bold text-red-500 flex items-center justify-center gap-1.5 disabled:opacity-50 active:bg-red-50 dark:active:bg-red-900/20"
              >
                <Trash2 size={15} /> {deleting === l.id ? '...' : 'Delete'}
              </button>
            </div>
          </div>
        );
      })}

      {/* ADDED: Boost Modal */}
      {boostTarget && (
        <BoostModal
          isOpen={!!boostTarget}
          onClose={() => setBoostTarget(null)}
          targetType="listing"
          targetId={boostTarget.id}
          targetTitle={boostTarget.title}
        />
      )}
    </div>
  );
        }
