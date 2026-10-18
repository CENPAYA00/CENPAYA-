import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Search, Briefcase, Zap, Plus, Eye, EyeOff, Store } from 'lucide-react';
import { getCachedUser } from '../lib/cache';
import BoostModal from '../components/BoostModal';

export default function Services() {
  const navigate = useNavigate();
  const [services, setServices] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [meId, setMeId] = useState<string | null>(null);
  const [boostTarget, setBoostTarget] = useState<any>(null);
  const [showDemo, setShowDemo] = useState(true);

  useEffect(() => {
    const load = async () => {
      const me = await getCachedUser();
      setMeId(me?.id || null);

      const { data } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(50);
      
      setServices(data || []);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = services.filter(s => 
    (showDemo || !s.is_demo) && s.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="px-4 py-4 pb-24 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-4 px-1">
        <div>
          <h1 className="text-[20px] font-bold text-navy dark:text-white">Freelance Services</h1>
          <p className="text-[11px] text-mute mt-0.5">Available everywhere — no country limits</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowDemo(v => !v)} className="text-[11px] font-semibold text-mute flex items-center gap-1 cursor-pointer">
            {showDemo ? <><Eye size={13} /> Hide demo</> : <><EyeOff size={13} /> Show demo</>}
          </button>
          <button 
            onClick={() => navigate('/create-service')} 
            className="flex items-center gap-1 bg-[#12935a] text-white text-[12px] font-bold px-3 py-1.5 rounded-xl cursor-pointer active:scale-95 transition-transform"
          >
            <Plus size={14} /> Sell
          </button>
        </div>
      </div>

      <div className="flex bg-gray-100 dark:bg-darkline rounded-full p-1 mb-4 shadow-inner">
        <button onClick={() => navigate('/market')} className="flex-1 py-2.5 text-[14px] font-bold rounded-full text-gray-500 flex items-center justify-center gap-2 hover:text-[#0a3d2b] transition-colors">
          <Store size={16} /> Marketplace
        </button>
        <button className="flex-1 py-2.5 text-[14px] font-bold rounded-full bg-white dark:bg-darkcard text-[#0a3d2b] dark:text-white shadow-sm flex items-center justify-center gap-2">
          <Briefcase size={16} /> Freelance
        </button>
      </div>

      <div className="relative mb-6">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search freelance services..."
          className="w-full pl-11 pr-4 py-3.5 border border-gray-200 dark:border-darkline rounded-pill bg-white dark:bg-darkcard text-[14px] text-ink outline-none"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="aspect-square bg-gray-200 dark:bg-darkcard rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10">
          <Briefcase size={32} className="mx-auto text-gray-400 mb-3" />
          <p className="text-[15px] font-bold text-navy dark:text-white">No services found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map(s => {
            const cover = Array.isArray(s.images) ? s.images[0] : s.thumbnail_url;
            const isBoosted = s.boosted_until && new Date(s.boosted_until) > new Date();
            return (
              <div key={s.id} className="bg-white dark:bg-darkcard rounded-[20px] shadow-sm overflow-hidden flex flex-col border border-gray-100 dark:border-darkline">
                <button onClick={() => navigate(`/service/${s.id}`)} className="w-full aspect-square bg-gray-100 dark:bg-darkline relative">
                  {cover ? (
                    <img src={cover} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400"><Briefcase size={24} /></div>
                  )}
                  {isBoosted && (
                    <span className="absolute top-2 right-2 bg-[#12935a] text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-md flex items-center gap-1">
                      <Zap size={10} fill="currentColor" /> Boosted
                    </span>
                  )}
                </button>
                <div className="p-3 flex-1 flex flex-col">
                  {/* ADDED: data-no-translate to service title */}
                  <p data-no-translate className="text-[14px] font-bold text-navy dark:text-white line-clamp-1">{s.title}</p>
                  <p className="text-[15px] font-black text-[#12935a] mt-1">From {Number(s.starting_price || 0).toLocaleString()} XAF</p>
                  
                  {meId === s.seller_id && (
                    <button
                      onClick={(e) => { e.preventDefault(); setBoostTarget(s); }}
                      className="mt-3 w-full bg-[#eaf6ef] dark:bg-[#12935a]/10 text-[#12935a] font-bold py-2 rounded-xl text-[12px] flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                    >
                      <Zap size={14} /> {isBoosted ? 'Extend Boost' : 'Boost'}
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
