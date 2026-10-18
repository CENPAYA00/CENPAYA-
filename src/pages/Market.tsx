import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Search, Store, Zap } from 'lucide-react';
import { getCachedUser } from '../lib/cache';
import BoostModal from '../components/BoostModal';

export default function Market() {
  const navigate = useNavigate();
  const [listings, setListings] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [meId, setMeId] = useState<string | null>(null);
  const [boostTarget, setBoostTarget] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      const me = await getCachedUser();
      setMeId(me?.id || null);

      const { data } = await supabase
        .from('listings')
        .select('*')
        .eq('moderation_status', 'approved')
        .order('created_at', { ascending: false })
        .limit(50);
      
      setListings(data || []);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = listings.filter(l => 
    l.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="px-4 py-4 pb-24 max-w-4xl mx-auto">
      <div className="relative mb-6 mt-2">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search products, sellers..."
          className="w-full pl-11 pr-4 py-3.5 border border-gray-200 dark:border-darkline rounded-pill bg-white dark:bg-darkcard text-[14px] text-ink outline-none"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="aspect-square bg-gray-200 dark:bg-darkcard rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10">
          <Store size={32} className="mx-auto text-gray-400 mb-3" />
          <p className="text-[15px] font-bold text-navy dark:text-white">No listings found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map(l => {
            const cover = Array.isArray(l.images) ? l.images[0] : l.images;
            return (
              <div key={l.id} className="bg-white dark:bg-darkcard rounded-[20px] shadow-sm overflow-hidden flex flex-col border border-gray-100 dark:border-darkline">
                <button onClick={() => navigate(`/listing/${l.id}`)} className="w-full aspect-square bg-gray-100 dark:bg-darkline relative">
                  {cover ? (
                    <img src={cover} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400"><Store size={24} /></div>
                  )}
                </button>
                <div className="p-3 flex-1 flex flex-col">
                  <p className="text-[14px] font-bold text-navy dark:text-white line-clamp-1">{l.title}</p>
                  <p className="text-[15px] font-black text-[#12935a] mt-1">{Number(l.price || 0).toLocaleString()} XAF</p>
                  {l.location_city && <p className="text-[11px] text-mute mt-0.5">{l.location_city}</p>}
                  
                  {/* BOOST BUTTON INSIDE THE GRID CARD */}
                  {meId === l.seller_id && (
                    <button
                      onClick={(e) => { e.preventDefault(); setBoostTarget(l); }}
                      className="mt-3 w-full bg-[#eaf6ef] dark:bg-[#12935a]/10 text-[#12935a] font-bold py-2 rounded-xl text-[12px] flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                    >
                      <Zap size={14} /> Boost
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
