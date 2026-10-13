import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Zap, Store, FileText, Check, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';

type Tier = {
  id: number;
  price: number;
  duration_days: number;
  scope: string;
  label: string;
  description: string;
};

type Target = {
  type: 'listing' | 'post';
  id: string;
  title: string;
  image?: string | null;
  boosted_until?: string | null;
};

export default function Boosted() {
  const navigate = useNavigate();
  const [listings, setListings] = useState<Target[]>([]);
  const [posts, setPosts] = useState<Target[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [elig, setElig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Target | null>(null);
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const load = async () => {
      const me = await getCachedUser();
      if (!me) { setLoading(false); return; }

      const [tiersRes, eligRes, listingsRes, postsRes] = await Promise.all([
        supabase.rpc('list_boost_tiers'),
        supabase.rpc('get_boost_eligibility'),
        supabase
          .from('listings')
          .select('id, title, images, boosted_until')
          .eq('seller_id', me.id)
          .eq('moderation_status', 'approved')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('posts')
          .select('id, content, image_url, boosted_until')
          .eq('user_id', me.id)
          .eq('moderation_status', 'approved')
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      setTiers(tiersRes.data || []);
      setElig(eligRes.data);

      setListings((listingsRes.data || []).map((l: any) => ({
        type: 'listing',
        id: l.id,
        title: l.title,
        image: Array.isArray(l.images) ? l.images[0] : l.images,
        boosted_until: l.boosted_until,
      })));

      setPosts((postsRes.data || []).map((p: any) => ({
        type: 'post',
        id: p.id,
        title: (p.content || 'Post').slice(0, 60),
        image: p.image_url ? p.image_url.split(',')[0] : null,
        boosted_until: p.boosted_until,
      })));

      setLoading(false);
    };
    load();
  }, []);

  const purchase = async (useFree: boolean) => {
    if (!selected || !selectedTier) return;
    setBusy(true);
    setToast(null);

    const { data, error } = await supabase.rpc('purchase_boost', {
      p_target_type: selected.type,
      p_target_id: selected.id,
      p_tier_id: selectedTier.id,
      p_use_free_premium: useFree,
    });

    if (error || (data && !data.ok)) {
      const msg = (error?.message || data?.error || 'Boost failed.').toLowerCase();
      const friendly =
        msg.includes('insufficient')
          ? 'Insufficient funds. Top up your wallet first.'
          : msg.includes('free')
          ? 'You have used your free monthly boosts.'
          : error?.message || data?.error || 'Boost failed.';
      setToast({ kind: 'error', message: friendly });
      setBusy(false);
      return;
    }

    // Fire a notification so the user sees it in the bell
    try {
      const me = await getCachedUser();
      if (me) {
        await supabase.from('notifications').insert({
          user_id: me.id,
          kind: 'system',
          title: 'Boost activated',
          body: `${selectedTier.label} — ${selected.type === 'listing' ? 'listing' : 'post'} boosted until ${new Date(data.until).toLocaleDateString()}`,
          link_url: `/${selected.type === 'listing' ? 'listing' : 'post'}/${selected.id}`,
          actor_id: me.id,
        });
      }
    } catch (e) {
      // Notification failure is non-fatal
      console.warn('boost notification failed', e);
    }

    setToast({ kind: 'success', message: `Boosted until ${new Date(data.until).toLocaleDateString()}` });
    setSelected(null);
    setSelectedTier(null);
    setBusy(false);
    setTimeout(() => window.location.reload(), 1200);
  };

  const canUseFree = elig?.is_member && elig?.free_boosts_remaining > 0;

  if (loading) {
    return (
      <div className="px-3 py-3 pb-24">
        <div className="h-40 bg-gray-200 dark:bg-darkcard rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="px-3 py-3 pb-24">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-3 left-3 right-3 z-[300] rounded-xl shadow-lg p-3 text-[12px] font-bold flex items-start gap-2 ${
            toast.kind === 'error'
              ? 'bg-red-500 text-white'
              : 'bg-accent text-white'
          }`}
        >
          <span className="flex-1">{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-white/80">✕</button>
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">Boost</h1>
      </div>

      {elig?.is_member && (
        <div className="bg-accent/10 border border-accent/20 rounded-2xl p-3 mb-3 flex items-start gap-2">
          <Sparkles size={16} className="text-accent mt-0.5" />
          <div className="flex-1">
            <p className="text-[11px] font-bold text-navy dark:text-white">Premium free boosts</p>
            <p className="text-[10px] text-gray-600 dark:text-gray-300">
              {elig.free_boosts_remaining} of 2 free tier-1 boosts remaining this month
            </p>
          </div>
        </div>
      )}

      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Boost plans</p>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {tiers.map(t => {
          const isFree = t.id === 1 && canUseFree;
          return (
            <button
              key={t.id}
              onClick={() => { setSelectedTier(t); }}
              className={`p-3 rounded-2xl border-2 text-left ${
                selectedTier?.id === t.id
                  ? 'border-accent bg-accent/5'
                  : 'border-gray-200 dark:border-darkline bg-white dark:bg-darkcard'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">
                  {t.scope}
                </span>
                {isFree && (
                  <span className="text-[8px] font-bold bg-accent text-white px-1.5 py-0.5 rounded">
                    FREE
                  </span>
                )}
              </div>
              <p className="text-[14px] font-black text-navy dark:text-white">
                {t.price.toLocaleString()} <span className="text-[10px]">XAF</span>
              </p>
              <p className="text-[10px] font-bold text-navy dark:text-white mt-0.5">{t.label}</p>
              <p className="text-[9px] text-gray-500 mt-1">{t.duration_days} days</p>
            </button>
          );
        })}
      </div>

      {selectedTier && (
        <p className="text-[10px] text-gray-500 mb-3">{selectedTier.description}</p>
      )}

      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Choose what to boost</p>

      {listings.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-2">
            <Store size={12} className="text-gray-500" />
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Listings</p>
          </div>
          {listings.map(l => {
            const active = l.boosted_until && new Date(l.boosted_until) > new Date();
            const isSel = selected?.type === 'listing' && selected.id === l.id;
            return (
              <button
                key={l.id}
                onClick={() => setSelected(l)}
                className={`w-full bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-2 p-3 flex items-center gap-3 text-left ${
                  isSel ? 'ring-2 ring-accent' : ''
                }`}
              >
                {l.image ? (
                  <img src={l.image} alt="" className="w-12 h-12 rounded-lg object-cover bg-gray-100" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-darkline" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-navy dark:text-white truncate">{l.title}</p>
                  {active && (
                    <p className="text-[9px] text-green-600 font-bold">
                      Boosted until {new Date(l.boosted_until!).toLocaleDateString()}
                    </p>
                  )}
                </div>
                {isSel && <Check size={16} className="text-accent" />}
              </button>
            );
          })}
        </>
      )}

      {posts.length > 0 && (
        <>
          <div className="flex items-center gap-2 mt-4 mb-2">
            <FileText size={12} className="text-gray-500" />
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Posts</p>
          </div>
          {posts.map(p => {
            const active = p.boosted_until && new Date(p.boosted_until) > new Date();
            const isSel = selected?.type === 'post' && selected.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className={`w-full bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-2 p-3 flex items-center gap-3 text-left ${
                  isSel ? 'ring-2 ring-accent' : ''
                }`}
              >
                {p.image ? (
                  <img src={p.image} alt="" className="w-12 h-12 rounded-lg object-cover bg-gray-100" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-darkline" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-navy dark:text-white truncate">{p.title}</p>
                  {active && (
                    <p className="text-[9px] text-green-600 font-bold">
                      Boosted until {new Date(p.boosted_until!).toLocaleDateString()}
                    </p>
                  )}
                </div>
                {isSel && <Check size={16} className="text-accent" />}
              </button>
            );
          })}
        </>
      )}

      {listings.length === 0 && posts.length === 0 && (
        <div className="bg-white dark:bg-darkcard rounded-2xl p-6 text-center shadow-sm">
          <Zap size={28} className="mx-auto text-gray-400 mb-2" />
          <p className="text-[11px] font-bold text-navy dark:text-white">Nothing to boost yet</p>
          <p className="text-[9px] text-gray-500 mt-1">Create a listing or post first.</p>
        </div>
      )}

      {selected && selectedTier && (
        <div className="fixed bottom-20 left-0 right-0 px-3 z-50">
          <div className="bg-white dark:bg-darkcard rounded-2xl shadow-lg p-3 max-w-[600px] mx-auto">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-[11px] font-bold text-navy dark:text-white">
                  {selectedTier.label} · {selectedTier.duration_days}d
                </p>
                <p className="text-[10px] text-gray-500">Targeting: {selectedTier.scope}</p>
              </div>
              <p className="text-[14px] font-black text-accent">
                {selectedTier.price.toLocaleString()} XAF
              </p>
            </div>

            {selectedTier.id === 1 && canUseFree ? (
              <button
                onClick={() => purchase(true)}
                disabled={busy}
                className="w-full bg-accent text-white font-bold py-2.5 rounded-lg text-[12px] disabled:opacity-50"
              >
                {busy ? 'Processing...' : 'Use free premium boost'}
              </button>
            ) : (
              <button
                onClick={() => purchase(false)}
                disabled={busy}
                className="w-full bg-accent text-white font-bold py-2.5 rounded-lg text-[12px] disabled:opacity-50"
              >
                {busy ? 'Processing...' : `Pay ${selectedTier.price.toLocaleString()} XAF from wallet`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
    }
