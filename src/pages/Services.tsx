import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Search, Star, Plus, Briefcase } from 'lucide-react';
import { getCachedUser } from '../lib/cache';
import { useI18n } from '../contexts/i18n';

const CATEGORIES = [
  'All',
  'Writing', 'Design', 'Business', 'Software', 'Translation',
  'Freelance Design', 'Web Development', 'App Development',
  'Graphic Design', 'Content Writing', 'Tutoring', 'Repairs',
  'Event Planning', 'Photography', 'Ebooks', 'Poems',
];

export default function Services() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [services, setServices] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const load = async () => {
      const u = await getCachedUser();
      setIsLoggedIn(!!u);
      await fetchServices();
    };
    load();
  }, [category]);

  const fetchServices = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('list_services', {
      p_category: category === 'All' ? null : category,
      p_search: null,
      p_limit: 60,
    });
    if (error) console.warn(error);
    setServices(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  const filtered = services.filter(s =>
    !search.trim() ||
    s.title?.toLowerCase().includes(search.toLowerCase()) ||
    s.seller_username?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-base font-bold text-navy dark:text-white">{t('freelance_services')}</h1>
          <p className="text-[10px] text-gray-500">Available everywhere — no country limits</p>
        </div>
        {isLoggedIn && (
          <button onClick={() => navigate('/create-service')} className="bg-accent text-white text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1">
            <Plus size={12} /> {t('sell_service')}
          </button>
        )}
      </div>

      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          placeholder={t('search')}
          className="w-full pl-9 pr-3 py-2.5 border border-gray-200 dark:border-darkline rounded-xl bg-white dark:bg-darkcard text-xs focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 -mx-3 px-3 scrollbar-hide">
        {CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`whitespace-nowrap text-[10px] font-bold px-3 py-1.5 rounded-full ${
              category === c
                ? 'bg-navy dark:bg-accent text-white'
                : 'bg-white dark:bg-darkcard text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-darkline'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {loading && (
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white dark:bg-darkcard rounded-xl overflow-hidden shadow-sm">
              <div className="h-28 bg-gray-200 dark:bg-darkline animate-pulse" />
              <div className="p-2">
                <div className="h-3 bg-gray-200 dark:bg-darkline rounded w-3/4 mb-2 animate-pulse" />
                <div className="h-3 bg-gray-200 dark:bg-darkline rounded w-1/2 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="bg-white dark:bg-darkcard p-6 rounded-2xl shadow-sm text-center">
          <Briefcase size={28} className="mx-auto text-gray-400 mb-2" />
          <p className="text-[11px] font-bold text-navy dark:text-white">{t('no_services')}</p>
          <p className="text-[9px] text-gray-500 mt-1">{t('be_first_service')}</p>
          {isLoggedIn && (
            <button onClick={() => navigate('/create-service')} className="mt-3 bg-accent text-white text-[10px] font-bold px-4 py-2 rounded-lg">
              {t('create_service')}
            </button>
          )}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map(s => {
            const images: string[] = Array.isArray(s.images) ? s.images : [];
            const cover = s.thumbnail_url || images[0];
            const hasRange = s.price_is_range && s.price_min != null;
            const priceLabel = hasRange
              ? `${Number(s.price_min).toLocaleString()} – ${Number(s.price_max ?? s.price_min).toLocaleString()}`
              : `${Number(s.starting_price || 0).toLocaleString()}`;
            return (
              <button
                key={s.id}
                onClick={() => navigate(`/service/${s.id}`)}
                className="bg-white dark:bg-darkcard rounded-xl overflow-hidden shadow-sm active:scale-[0.98] text-left"
              >
                <div className="relative h-28 bg-gray-100 dark:bg-darkline">
                  {cover ? (
                    <img src={cover} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-[10px]">No image</div>
                  )}
                  {images.length > 1 && (
                    <span className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                      1/{images.length}
                    </span>
                  )}
                </div>
                <div className="p-2">
                  <p className="text-[10px] font-bold text-navy dark:text-white line-clamp-2 leading-snug mb-1">
                    {s.title}
                  </p>
                  <div className="flex items-center gap-1 text-[9px] text-gray-500">
                    <Star size={9} className="text-gold" fill="currentColor" />
                    <span>@{s.seller_username}</span>
                  </div>
                  <p className="text-[10px] font-black text-accent mt-1">
                    From {priceLabel} XAF
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
            }
