import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Search as SearchIcon, X, Clock, User as UserIcon, Store, Briefcase, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';
import DemoBadge from '../components/DemoBadge';

type Context = 'home' | 'market' | 'services';
type ResultKind = 'post' | 'listing' | 'service';
type Result = {
  id: string;
  kind: ResultKind;
  title: string;
  subtitle?: string;
  cover?: string | null;
  meta?: string;
  is_demo?: boolean;
};

const RECENT_KEY = 'cenpaya_recent_searches';
const MAX_RECENT = 8;

export default function Search() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const contextParam = (params.get('context') || 'home') as Context;
  const [context, setContext] = useState<Context>(contextParam);

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);

  // Sync context if URL changes (unlikely but safe)
  useEffect(() => { setContext(contextParam); }, [contextParam]);

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw));
    } catch {}
  }, []);

  // Load "people you may know"
  useEffect(() => {
    const load = async () => {
      const me = await getCachedUser();
      setMeId(me?.id || null);

      // Fetch some public profiles (exclude me). Simple approach: recent signups.
      const { data } = await supabase
        .from('public_profiles')
        .select('id, username, avatar_url, occupation, city')
        .limit(20);

      const filtered = (data || []).filter((u: any) => u.id !== me?.id).slice(0, 8);
      setPeople(filtered);
    };
    load();
  }, []);

  // Debounce the query
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 280);
    return () => clearTimeout(t);
  }, [query]);

  // Run search when debounced query or context changes
  useEffect(() => {
    if (!debounced) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        let list: Result[] = [];

        if (context === 'home') {
          const { data } = await supabase
            .from('posts')
            .select('id, user_id, content, image_url, post_type, is_demo, created_at')
            .eq('moderation_status', 'approved')
            .is('archived_at', null)
            .ilike('content', `%${debounced}%`)
            .limit(30);

          const userIds = [...new Set((data || []).map((p: any) => p.user_id))];
          const { data: profiles } = await supabase
            .from('public_profiles')
            .select('id, username')
            .in('id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']);
          const nameMap: Record<string, string> = {};
          (profiles || []).forEach((p: any) => { nameMap[p.id] = p.username; });

          list = (data || []).map((p: any) => ({
            id: p.id,
            kind: 'post',
            title: (p.content || 'Post').slice(0, 80),
            subtitle: `@${nameMap[p.user_id] || 'user'}`,
            cover: p.image_url ? p.image_url.split(',')[0] : null,
            meta: new Date(p.created_at).toLocaleDateString(),
            is_demo: p.is_demo,
          }));
        }

        if (context === 'market') {
          const { data, error } = await supabase.rpc('get_market_listings', {
            p_search: debounced,
            p_category: null,
            p_limit: 40,
            p_offset: 0,
          });
          if (error) console.warn(error);
          const listings = (data?.listings || []) as any[];
          list = listings.map((l: any) => ({
            id: l.id,
            kind: 'listing',
            title: l.title,
            subtitle: l.location_city || l.location_region || l.location_country || '',
            cover: Array.isArray(l.images) ? l.images[0] : null,
            meta: (l.price_is_range
              ? `${Number(l.price_min).toLocaleString()} – ${Number(l.price_max ?? l.price_min).toLocaleString()}`
              : `${Number(l.price || 0).toLocaleString()}`) + ' XAF',
            is_demo: l.is_demo,
          }));
        }

        if (context === 'services') {
          const { data } = await supabase
            .from('services')
            .select('id, title, category, starting_price, thumbnail_url, images, is_demo, seller_username:seller_id')
            .eq('is_active', true)
            .eq('moderation_status', 'approved')
            .ilike('title', `%${debounced}%`)
            .limit(40);

          // Enrich seller usernames
          const sellerIds = [...new Set((data || []).map((s: any) => s.seller_username))];
          const { data: profiles } = await supabase
            .from('public_profiles')
            .select('id, username')
            .in('id', sellerIds.length ? sellerIds : ['00000000-0000-0000-0000-000000000000']);
          const nameMap: Record<string, string> = {};
          (profiles || []).forEach((p: any) => { nameMap[p.id] = p.username; });

          list = (data || []).map((s: any) => ({
            id: s.id,
            kind: 'service',
            title: s.title,
            subtitle: `@${nameMap[s.seller_username] || 'seller'}${s.category ? ` · ${s.category}` : ''}`,
            cover: s.thumbnail_url || (Array.isArray(s.images) ? s.images[0] : null),
            meta: `From ${Number(s.starting_price || 0).toLocaleString()} XAF`,
            is_demo: s.is_demo,
          }));
        }

        if (!cancelled) setResults(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [debounced, context]);

  const saveRecent = (term: string) => {
    const clean = term.trim();
    if (!clean) return;
    const next = [clean, ...recent.filter(r => r.toLowerCase() !== clean.toLowerCase())].slice(0, MAX_RECENT);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
  };

  const removeRecent = (term: string) => {
    const next = recent.filter(r => r !== term);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
  };

  const clearRecent = () => {
    setRecent([]);
    try { localStorage.removeItem(RECENT_KEY); } catch {}
  };

  const pickRecent = (term: string) => {
    setQuery(term);
  };

  const openResult = (r: Result) => {
    saveRecent(debounced || query);
    if (r.kind === 'post') navigate(`/post/${r.id}`);
    else if (r.kind === 'listing') navigate(`/listing/${r.id}`);
    else navigate(`/service/${r.id}`);
  };

  const openPerson = (u: any) => {
    navigate(`/seller/${u.id}`);
  };

  const contextLabel = useMemo(() => {
    if (context === 'home') return 'Posts';
    if (context === 'market') return 'Marketplace';
    return 'Freelance Services';
  }, [context]);

  const tabs: { key: Context; label: string }[] = [
    { key: 'home', label: 'Posts' },
    { key: 'market', label: 'Market' },
    { key: 'services', label: 'Services' },
  ];

  return (
    <div className="min-h-screen bg-offwhite dark:bg-darkbg">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white dark:bg-darkcard border-b border-gray-100 dark:border-darkline px-3 py-2.5 flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center text-navy dark:text-white hover:bg-gray-100 dark:hover:bg-darkbg cursor-pointer"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="relative flex-1">
          <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { saveRecent(query); } }}
            placeholder={`Search ${contextLabel.toLowerCase()}...`}
            autoFocus
            className="w-full pl-9 pr-9 py-2.5 rounded-full bg-gray-100 dark:bg-darkbg border border-transparent focus:border-accent focus:bg-white dark:focus:bg-darkcard text-[13px] text-navy dark:text-white outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 cursor-pointer"
              aria-label="Clear"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Tabs (context switch) */}
      {debounced && (
        <div className="bg-white dark:bg-darkcard border-b border-gray-100 dark:border-darkline px-2 flex">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setContext(t.key)}
              className={`flex-1 py-2.5 text-[11px] font-bold border-b-2 cursor-pointer ${
                context === t.key
                  ? 'text-accent border-accent'
                  : 'text-gray-500 border-transparent'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Results or Empty State */}
      <div className="px-3 py-3">
        {debounced ? (
          <>
            {loading && (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 bg-white dark:bg-darkcard rounded-xl animate-pulse" />
                ))}
              </div>
            )}

            {!loading && results.length === 0 && (
              <div className="bg-white dark:bg-darkcard rounded-2xl p-6 text-center shadow-sm">
                <SearchIcon size={28} className="mx-auto text-gray-400 mb-2" />
                <p className="text-[11px] font-bold text-navy dark:text-white">No results for "{debounced}"</p>
                <p className="text-[10px] text-gray-500 mt-1">Try different keywords or switch tabs.</p>
              </div>
            )}

            {!loading && results.map(r => (
              <button
                key={`${r.kind}-${r.id}`}
                onClick={() => openResult(r)}
                className="w-full bg-white dark:bg-darkcard rounded-xl shadow-sm mb-2 p-2.5 flex items-center gap-3 text-left cursor-pointer hover:bg-gray-50 dark:hover:bg-darkbg"
              >
                <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-darkbg shrink-0 flex items-center justify-center overflow-hidden">
                  {r.cover ? (
                    <img src={r.cover} alt="" className="w-full h-full object-cover" />
                  ) : r.kind === 'post' ? (
                    <FileText size={18} className="text-gray-400" />
                  ) : r.kind === 'listing' ? (
                    <Store size={18} className="text-gray-400" />
                  ) : (
                    <Briefcase size={18} className="text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-[12px] font-bold text-navy dark:text-white truncate">{r.title}</p>
                    {r.is_demo && <DemoBadge />}
                  </div>
                  {r.subtitle && (
                    <p className="text-[10px] text-gray-500 truncate mt-0.5">{r.subtitle}</p>
                  )}
                  {r.meta && (
                    <p className="text-[10px] text-accent font-bold mt-0.5">{r.meta}</p>
                  )}
                </div>
              </button>
            ))}
          </>
        ) : (
          <>
            {/* Recent searches */}
            {recent.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-bold text-navy dark:text-white">Recent</p>
                  <button
                    onClick={clearRecent}
                    className="text-[10px] font-bold text-accent cursor-pointer"
                  >
                    Clear all
                  </button>
                </div>
                {recent.map(term => (
                  <div
                    key={term}
                    className="w-full flex items-center gap-3 py-2.5 border-b border-gray-100 dark:border-darkline"
                  >
                    <button
                      onClick={() => pickRecent(term)}
                      className="flex-1 flex items-center gap-3 text-left cursor-pointer"
                    >
                      <Clock size={14} className="text-gray-400 shrink-0" />
                      <span className="text-[12px] text-navy dark:text-white truncate">{term}</span>
                    </button>
                    <button
                      onClick={() => removeRecent(term)}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-darkbg cursor-pointer"
                      aria-label="Remove"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* People you may know */}
            {people.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-navy dark:text-white mb-2">People you may know</p>
                <div className="grid grid-cols-2 gap-2">
                  {people.map(u => (
                    <button
                      key={u.id}
                      onClick={() => openPerson(u)}
                      className="bg-white dark:bg-darkcard rounded-xl overflow-hidden shadow-sm text-left cursor-pointer"
                    >
                      <div className="h-28 bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center overflow-hidden">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-white font-black text-3xl">
                            {u.username?.[0]?.toUpperCase() || 'U'}
                          </span>
                        )}
                      </div>
                      <div className="p-2">
                        <div className="flex items-center gap-1">
                          <UserIcon size={10} className="text-accent shrink-0" />
                          <p className="text-[11px] font-bold text-navy dark:text-white truncate">
                            @{u.username}
                          </p>
                        </div>
                        {(u.occupation || u.city) && (
                          <p className="text-[9px] text-gray-500 truncate mt-0.5">
                            {u.occupation || u.city}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {recent.length === 0 && people.length === 0 && (
              <div className="text-center py-12">
                <SearchIcon size={32} className="mx-auto text-gray-400 mb-3" />
                <p className="text-[11px] font-bold text-navy dark:text-white">Start searching</p>
                <p className="text-[10px] text-gray-500 mt-1">Try a product, seller, or service.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
            }
