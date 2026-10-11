import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Search, Star, Zap, Plus } from 'lucide-react';
import { getCachedUser } from '../lib/cache';

const CATEGORIES = ['All', 'Design', 'Development', 'Writing', 'Marketing', 'Video', 'Music', 'Business', 'Tutoring'];

export default function Services() {
  const navigate = useNavigate();
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
    let query = supabase
      .from('services')
      .select('*, public_profiles!inner(username)')
      .eq('moderation_status', 'approved')
      .order('created_at', { ascending: false })
      .limit(40);

    if (category !== 'All') query = query.eq('category', category);

    const { data } = await query;
    if (data) setServices(data);
    setLoading(false);
  };

  const filtered = services.filter(s =>
    !search.trim() ||
    s.title?.toLowerCase().includes(search.toLowerCase()) ||
    s.public_profiles?.username?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-base font-bold text-navy">Freelance Services</h1>
        {isLoggedIn && (
          <button
            onClick={() => navigate('/create-service')}
            className="bg-accent text-white text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1"
          >
            <Plus size={12} /> Sell a service
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search any service..."
          className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl bg-white text-xs focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {/* Category chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 -mx-3 px-3">
        {CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`whitespace-nowrap text-[10px] font-bold px-3 py-1.5 rounded-full ${
              category === c ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {loading && (
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-xl overflow-hidden shadow-sm">
              <div className="h-28 bg-gray-200 animate-pulse"></div>
              <div className="p-2">
                <div className="h-3 bg-gray-200 rounded w-3/4 mb-2 animate-pulse"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2 animate-pulse"></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="bg-white p-6 rounded-2xl shadow-sm text-center">
          <p className="text-[11px] font-bold text-navy">No services yet</p>
          <p className="text-[9px] text-gray-500 mt-1">Be the first to offer a service on CenPaya.</p>
          {isLoggedIn && (
            <button
              onClick={() => navigate('/create-service')}
              className="mt-3 bg-accent text-white text-[10px] font-bold px-4 py-2 rounded-lg"
            >
              Create your first service
            </button>
          )}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map(s => (
            <div
              key={s.id}
              onClick={() => navigate(`/service/${s.id}`)}
              className="bg-white rounded-xl overflow-hidden shadow-sm active:scale-[0.98] transition-transform"
            >
              <div className="relative h-28 bg-gray-100">
                {s.thumbnail_url ? (
                  <img src={s.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300 text-[10px]">No image</div>
                )}
                <span className="absolute top-1.5 left-1.5 bg-brand text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                  Service
                </span>
              </div>
              <div className="p-2">
                <p className="text-[10px] font-bold text-navy line-clamp-2 leading-snug mb-1">{s.title}</p>
                <div className="flex items-center gap-1 text-[9px] text-gray-500">
                  <Star size={9} className="text-gold" fill="currentColor" />
                  <span>{(s.rating || 0).toFixed(1)}</span>
                  <span>·</span>
                  <span>@{s.public_profiles?.username || 'seller'}</span>
                </div>
                <p className="text-[10px] font-black text-accent mt-1">
                  From {Number(s.starting_price || 0).toLocaleString()} XAF
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
    }
