import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, MapPin, Zap } from 'lucide-react';

export default function Market() {
  const [listings, setListings] = useState<any[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadListings('');
  }, []);

  const loadListings = async (term: string) => {
    setLoading(true);

    let query = supabase
      .from('listings')
      .select('id, seller_id, title, price, images, listing_type, location, estimated_delivery_days, boosted_until, boost_tier')
      .eq('moderation_status', 'approved')
      .order('boosted_until', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(40);

    if (term.trim()) {
      query = query.ilike('title', `%${term.trim()}%`);
    }

    const { data, error } = await query;

    if (data) setListings(data);
    if (error) console.error('Market error:', error.message);
    setLoading(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadListings(searchText);
  };

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-base font-bold text-navy">Marketplace</h1>
        <button
          onClick={() => navigate('/create-listing')}
          className="bg-accent text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1"
        >
          <Plus size={14} /> Sell
        </button>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search products, services, sellers..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </form>

      {loading && (
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-xl overflow-hidden shadow-sm">
              <div className="h-32 bg-gray-200 animate-pulse"></div>
              <div className="p-2">
                <div className="h-3 bg-gray-200 rounded w-3/4 mb-2 animate-pulse"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2 animate-pulse"></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && listings.length === 0 && (
        <div className="bg-white p-6 rounded-2xl shadow-sm text-center">
          <p className="text-sm font-bold text-navy">No listings found</p>
          <p className="text-[10px] text-gray-500 mt-1">Be the first to post something for sale.</p>
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
          {listings.map(item => {
            const isBoosted = item.boosted_until && new Date(item.boosted_until) > new Date();
            const image = Array.isArray(item.images) ? item.images[0] : null;

            return (
              <div
                key={item.id}
                onClick={() => navigate(`/listing/${item.id}`)}
                className="bg-white rounded-xl overflow-hidden shadow-sm active:scale-[0.98] transition-transform"
              >
                <div className="relative h-32 bg-gray-100">
                  {image ? (
                    <img src={image} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">
                      No photo
                    </div>
                  )}
                  {isBoosted && (
                    <span className="absolute top-1.5 left-1.5 bg-accent text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                      <Zap size={9} /> Boosted
                    </span>
                  )}
                  {item.listing_type === 'service' && (
                    <span className="absolute top-1.5 right-1.5 bg-brand text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                      Service
                    </span>
                  )}
                </div>
                <div className="p-2">
                  <p className="text-xs font-bold text-navy line-clamp-2 leading-snug mb-1">
                    {item.title}
                  </p>
                  <p className="text-sm font-black text-accent">
                    {item.price.toLocaleString()} <span className="text-[10px]">XAF</span>
                  </p>
                  {item.location && (
                    <p className="text-[10px] text-gray-400 flex items-center gap-0.5 mt-0.5">
                      <MapPin size={9} /> {item.location}
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
