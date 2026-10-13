import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, MapPin, Zap, Lock } from 'lucide-react';

export default function Market() {
  const [listings, setListings] = useState<any[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [userCountry, setUserCountry] = useState('CM');
  const [isPremium, setIsPremium] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { load(''); }, []);

  const load = async (term: string) => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_market_listings', {
      p_search: term.trim() || null,
      p_category: null,
      p_limit: 60,
      p_offset: 0,
    });
    if (error) console.error('Market error:', error.message);
    if (data?.ok) {
      setListings(data.listings || []);
      setUserCountry(data.user_country);
      setIsPremium(!!data.is_premium);
    } else {
      setListings([]);
    }
    setLoading(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load(searchText);
  };

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-base font-bold text-navy dark:text-white">Marketplace</h1>
          <p className="text-[10px] text-gray-500">
            {isPremium ? 'All countries (Premium)' : `Showing ${userCountry} only`}
          </p>
        </div>
        <button
          onClick={() => navigate('/create-listing')}
          className="bg-accent text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1"
        >
          <Plus size={14} /> Sell
        </button>
      </div>

      {!isPremium && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 mb-3 flex items-start gap-2">
          <Lock size={14} className="text-blue-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[11px] font-bold text-blue-800 dark:text-blue-200">
              Buyers see their own country only
            </p>
            <p className="text-[10px] text-blue-700 dark:text-blue-300">
              Premium members can buy from any CEMAC country.
            </p>
          </div>
          <button onClick={() => navigate('/subscribe')} className="text-[10px] font-bold text-accent shrink-0">
            Upgrade
          </button>
        </div>
      )}

      <form onSubmit={handleSearch} className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search products, services, sellers..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          className="w-full pl-10 pr-3 py-2.5 border border-gray-200 dark:border-darkline rounded-xl bg-white dark:bg-darkcard text-sm focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </form>

      {loading && (
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white dark:bg-darkcard rounded-xl overflow-hidden shadow-sm">
              <div className="h-32 bg-gray-200 dark:bg-darkline animate-pulse" />
              <div className="p-2">
                <div className="h-3 bg-gray-200 dark:bg-darkline rounded w-3/4 mb-2 animate-pulse" />
                <div className="h-3 bg-gray-200 dark:bg-darkline rounded w-1/2 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && listings.length === 0 && (
        <div className="bg-white dark:bg-darkcard p-6 rounded-2xl shadow-sm text-center">
          <p className="text-sm font-bold text-navy dark:text-white">No listings found</p>
          <p className="text-[10px] text-gray-500 mt-1">
            {isPremium ? 'No listings in any country yet.' : `No listings in ${userCountry} yet.`}
          </p>
          <button
            onClick={() => navigate('/create-listing')}
            className="mt-3 bg-accent text-white text-xs font-bold px-4 py-2 rounded-lg"
          >
            Sell an item
          </button>
        </div>
      )}

      {!loading && listings.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {listings.map((item: any) => {
            const isBoosted = item.boosted_until && new Date(item.boosted_until) > new Date();
            const images: string[] = Array.isArray(item.images) ? item.images : [];
            const first = images[0];
            const hasRange = item.price_is_range && item.price_min != null;
            const priceLabel = hasRange
              ? `${Number(item.price_min).toLocaleString()} – ${Number(item.price_max ?? item.price_min).toLocaleString()}`
              : `${Number(item.price || 0).toLocaleString()}`;
            const crossBorder = item.location_country && item.location_country !== userCountry;

            return (
              <div
                key={item.id}
                onClick={() => navigate(`/listing/${item.id}`)}
                className="bg-white dark:bg-darkcard rounded-xl overflow-hidden shadow-sm active:scale-[0.98] transition-transform"
              >
                <div className="relative h-32 bg-gray-100 dark:bg-darkbg">
                  {first ? (
                    <img src={first} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">No photo</div>
                  )}
                  {isBoosted && (
                    <span className="absolute top-1.5 left-1.5 bg-accent text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                      <Zap size={9} /> Boosted
                    </span>
                  )}
                  {crossBorder && (
                    <span className="absolute top-1.5 right-1.5 bg-blue-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                      {item.location_country}
                    </span>
                  )}
                  {images.length > 1 && (
                    <span className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                      1/{images.length}
                    </span>
                  )}
                </div>
                <div className="p-2">
                  <p className="text-xs font-bold text-navy dark:text-white line-clamp-2 leading-snug mb-1">
                    {item.title}
                  </p>
                  <p className="text-sm font-black text-accent">
                    {priceLabel} <span className="text-[10px]">XAF</span>
                  </p>
                  {item.location_city && (
                    <p className="text-[10px] text-gray-400 flex items-center gap-0.5 mt-0.5">
                      <MapPin size={9} /> {item.location_city}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
