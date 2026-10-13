import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, MapPin, Zap } from 'lucide-react';

type Category = {
  id: string;
  slug: string;
  display_name: string;
  section: string;
  display_order: number;
};

export default function Market() {
  const [listings, setListings] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const init = async () => {
      const { data: cats } = await supabase
        .from('listing_categories')
        .select('id, slug, display_name, section, display_order')
        .eq('is_active', true)
        .order('section')
        .order('display_order');
      if (cats) setCategories(cats as Category[]);
      await loadListings('', null);
    };
    init();
  }, []);

  const loadListings = async (term: string, categorySlug: string | null) => {
    setLoading(true);

    let query = supabase
      .from('listings')
      .select('id, seller_id, title, price, price_min, price_max, price_is_range, images, listing_type, location, location_city, availability, boosted_until, boost_tier, category')
      .eq('moderation_status', 'approved')
      .order('boosted_until', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(60);

    if (term.trim()) query = query.ilike('title', `%${term.trim()}%`);
    if (categorySlug) query = query.eq('category', categorySlug);

    const { data, error } = await query;
    if (data) setListings(data);
    if (error) console.error('Market error:', error.message);
    setLoading(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadListings(searchText, activeCategory);
  };

  const pickCategory = (slug: string | null) => {
    setActiveCategory(slug);
    loadListings(searchText, slug);
  };

  const grouped = categories.reduce<Record<string, Category[]>>((acc, c) => {
    (acc[c.section] = acc[c.section] || []).push(c);
    return acc;
  }, {});

  const topCategories = categories.slice(0, 6);

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-base font-bold text-navy dark:text-white">Marketplace</h1>
        <button
          onClick={() => navigate('/create-listing')}
          className="bg-accent text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1"
        >
          <Plus size={14} /> Sell
        </button>
      </div>

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

      {/* Category chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 -mx-3 px-3 scrollbar-hide">
        <button
          onClick={() => pickCategory(null)}
          className={`whitespace-nowrap text-[10px] font-bold px-3 py-1.5 rounded-full ${
            activeCategory === null
              ? 'bg-navy dark:bg-accent text-white'
              : 'bg-white dark:bg-darkcard text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-darkline'
          }`}
        >
          All
        </button>
        {topCategories.map(c => (
          <button
            key={c.id}
            onClick={() => pickCategory(c.slug)}
            className={`whitespace-nowrap text-[10px] font-bold px-3 py-1.5 rounded-full ${
              activeCategory === c.slug
                ? 'bg-navy dark:bg-accent text-white'
                : 'bg-white dark:bg-darkcard text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-darkline'
            }`}
          >
            {c.display_name}
          </button>
        ))}
      </div>

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
          <p className="text-[10px] text-gray-500 mt-1">Try a different search or category.</p>
        </div>
      )}

      {!loading && listings.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {listings.map(item => {
            const isBoosted = item.boosted_until && new Date(item.boosted_until) > new Date();
            const images: string[] = Array.isArray(item.images) ? item.images : [];
            const first = images[0];
            const hasRange = item.price_is_range && item.price_min != null;
            const priceLabel = hasRange
              ? `${Number(item.price_min).toLocaleString()} – ${Number(item.price_max ?? item.price_min).toLocaleString()}`
              : `${Number(item.price || 0).toLocaleString()}`;

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
                  {item.listing_type === 'service' && (
                    <span className="absolute top-1.5 right-1.5 bg-brand text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                      Service
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

      {/* All categories browse */}
      {!activeCategory && !searchText && !loading && (
        <div className="mt-6">
          {Object.entries(grouped).map(([section, items]) => (
            <div key={section} className="mb-4">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                {section === 'physical' ? 'Products' : section === 'services' ? 'Services' : section}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {items.map(c => (
                  <button
                    key={c.id}
                    onClick={() => pickCategory(c.slug)}
                    className="bg-white dark:bg-darkcard rounded-xl shadow-sm p-3 flex items-center gap-2 text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent text-[11px] font-bold">
                      {c.display_name[0]}
                    </div>
                    <span className="text-[11px] font-bold text-navy dark:text-white truncate">
                      {c.display_name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
      }
