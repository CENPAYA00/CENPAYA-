import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Zap, Store, FileText, Check, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';

type Tier = { id: number; price: number; duration_days: number; scope: string; label: string; description: string };
type Target = { type: 'listing' | 'post'; id: string; title: string; image?: string | null; boosted_until?: string | null };

const resolveUrl = (u: string, bucket = 'listings'): string => {
  if (!u) return "";
  if (/^(https?:|data:|blob:)/i.test(u)) return u;
  const path = u.replace(/^\/+/, "").replace(new RegExp(`^${bucket}/`), "");
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
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
        supabase.from('listings').select('id, title, images, boosted_until').eq('seller_id', me.id).eq('moderation_status', 'approved').order('created_at', { ascending: false }).limit(50),
        supabase.from('posts').select('id, content, image_url, boosted_until, post_type').eq('user_id', me.id).eq('moderation_status', 'approved').order('created_at', { ascending: false }).limit(50),
      ]);

      setTiers(tiersRes.data || []);
      setElig(eligRes.data);

      setListings((listingsRes.data || []).map((l: any) => {
        let rawImg = Array.isArray(l.images) ? l.images[0] : (typeof l.images === 'string' ? l.images.split(',')[0] : null);
        return { type: 'listing', id: l.id, title: l.title, image: rawImg ? resolveUrl(rawImg) : null, boosted_until: l.boosted_until };
      }));

      setPosts((postsRes.data || []).map((p: any) => {
        let rawImg = p.image_url ? p.image_url.split(',')[0].trim() : null;
        return { type: 'post', id: p.id, title: p.content || (p.post_type === 'colored' ? 'Colored Post' : 'Media Post'), image: rawImg ? resolveUrl(rawImg) : null, boosted_until: p.boosted_until };
      }));

      setLoading(false);
    };
    load();
  }, []);

  const purchase = async (useFree: boolean) => {
    if (!selected || !selectedTier) return;
    setBusy(true);
    setToast(null);

    const { data, error } = await supabase.rpc('purchase_boost', {
      p_target_type: selected.type, p_target_id: selected.id, p_tier_id: selectedTier.id, p_use_free_premium: useFree,
    });

    if (error || (data && !data.ok)) {
      const msg = (error?.message || data?.error || 'Boost failed.').toLowerCase();
      const friendly = msg.includes('insufficient') ? 'Insufficient funds. Top up your wallet first.' : msg.includes('free') ? 'You have used your free monthly boosts.' : error?.message || data?.error || 'Boost failed.';
      setToast({ kind: 'error', message: friendly });
      setBusy(false);
      return;
    }

    try {
      const me = await getCachedUser();
      if (me) {
        await supabase.from('notifications').insert({
          user_id: me.id, kind: 'system', title: 'Boost activated',
          body: `${selectedTier.label} — ${selected.type} boosted until ${new Date(data.until).toLocaleDateString()}`,
          link_url: `/${selected.type}/${selected.id}`, actor_id: me.id,
        });
      }
    } catch (e) { console.warn('boost notification failed', e); }

    setToast({ kind: 'success', message: `Boosted until ${new Date(data.until).toLocaleDateString()}` });
    setSelected(null);
    setSelectedTier(null);
    setBusy(false);
    setTimeout(() => window.location.reload(), 1200);
  };

  const canUseFree = elig?.is_member && elig?.free_boosts_remaining > 0;

  if (loading) return <div className="px-4 py-4 pb-24"><div className="h-40 bg-gray-200 dark:bg-darkcard rounded-[20px] animate-pulse" /></div>;

  const renderTargetCard = (item: Target) => {
    const active = item.boosted_until && new Date(item.boosted_until) > new Date();
    const isSel = selected?.type === item.type && selected.id === item.id;

    return (
      <button
        key={item.id}
        onClick={() => setSelected(item)}
        className={`w-full flex items-start gap-4 p-4 rounded-[20px] border-2 text-left transition-all active:scale-[0.99] mb-3 ${
          isSel ? 'border-[#12935a] bg-[#f1faf5] dark:bg-[#12935a]/10' : 'border-transparent bg-white dark:bg-darkcard shadow-sm hover:bg-gray-50 dark:hover:bg-white/5'
        }`}
      >
        {item.image ? (
          <img src={item.image} alt="" className="w-20 h-20 rounded-xl object-cover bg-gray-100 shrink-0 border border-gray-100 dark:border-darkline mt-1" />
        ) : (
          <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-[#14a465] to-[#0a3d2b] text-white flex items-center justify-center shrink-0 mt-1">
            <FileText size={28} className="opacity-80" />
          </div>
        )}
        <div className="flex-1 min-w-0 py-1">
          {/* FIXED: Removed line-clamp so the full text shows */}
          <p className="text-[15px] font-semibold text-navy dark:text-white leading-relaxed break-words whitespace-pre-wrap">
            {item.title}
          </p>
          {active && (
            <p className="text-[12px] text-[#12935a] font-bold mt-2 flex items-center gap-1">
              <Check size={12} /> Boosted until {new Date(item.boosted_until!).toLocaleDateString()}
            </p>
          )}
        </div>
        <div className={`flex-none w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors mt-2 ${isSel ? 'bg-[#12935a] border-[#12935a] text-white' : 'border-gray-300 text-transparent'}`}>
          <Check size={14} strokeWidth={3} />
        </div>
      </button>
    );
  };

  return (
    <div className="px-4 py-4 pb-32 max-w-2xl mx-auto">
      {toast && (
        <div className={`fixed top-4 left-4 right-4 z-[300] rounded-[16px] shadow-lg p-4 text-[14px] font-bold flex items-start gap-2 ${toast.kind === 'error' ? 'bg-[#e5484d] text-white' : 'bg-[#12935a] text-white'}`}>
          <span className="flex-1">{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-white/80">✕</button>
        </div>
      )}

      <div className="flex items-center gap-3 mb-5 mt-1">
        <button onClick={() => navigate(-1)} className="text-navy dark:text-white"><ArrowLeft size={22} /></button>
        <h1 className="text-[22px] font-bold text-navy dark:text-white">Boost</h1>
      </div>

      {elig?.is_member && (
        <div className="bg-[#eaf6ef] dark:bg-[#12935a]/10 border border-[#12935a]/20 rounded-[16px] p-4 mb-6 flex items-start gap-3">
          <Sparkles size={20} className="text-[#12935a] mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-[14px] font-bold text-[#0a3d2b] dark:text-white">Premium free boosts</p>
            <p className="text-[13px] text-[#3e4f47] dark:text-gray-300 mt-0.5">{elig.free_boosts_remaining} of 2 free tier-1 boosts remaining this month</p>
          </div>
        </div>
      )}

      <p className="text-[12px] font-bold text-mute uppercase tracking-widest mb-3">Boost plans</p>
      <div className="grid grid-cols-2 gap-3 mb-6">
        {tiers.map(t => {
          const isFree = t.id === 1 && canUseFree;
          const isSel = selectedTier?.id === t.id;
          return (
            <button key={t.id} onClick={() => { setSelectedTier(t); }}
              className={`p-4 rounded-[20px] border-2 text-left transition-all ${isSel ? 'border-[#12935a] bg-[#f1faf5] dark:bg-[#12935a]/10 shadow-sm' : 'border-transparent bg-white dark:bg-darkcard shadow-sm'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-mute">{t.scope}</span>
                {isFree && <span className="text-[10px] font-bold bg-[#12935a] text-white px-2 py-0.5 rounded-md">FREE</span>}
              </div>
              <p className="text-[18px] font-bold text-[#0a3d2b] dark:text-white">{t.price.toLocaleString()} <span className="text-[12px] font-semibold text-mute">XAF</span></p>
              <p className="text-[13px] font-semibold text-navy dark:text-gray-200 mt-1">{t.label}</p>
              <p className="text-[12px] text-mute mt-0.5">{t.duration_days} days</p>
            </button>
          );
        })}
      </div>

      {selectedTier && <p className="text-[13px] text-mute mb-5 px-1">{selectedTier.description}</p>}

      <p className="text-[12px] font-bold text-mute uppercase tracking-widest mb-3 mt-8">Choose what to boost</p>

      {listings.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-3 px-1"><Store size={16} className="text-mute" /><p className="text-[12px] font-bold text-mute uppercase tracking-widest">Listings</p></div>
          {listings.map(l => renderTargetCard(l))}
        </>
      )}

      {posts.length > 0 && (
        <>
          <div className="flex items-center gap-2 mt-6 mb-3 px-1"><FileText size={16} className="text-mute" /><p className="text-[12px] font-bold text-mute uppercase tracking-widest">Posts</p></div>
          {posts.map(p => renderTargetCard(p))}
        </>
      )}

      {listings.length === 0 && posts.length === 0 && (
        <div className="bg-white dark:bg-darkcard rounded-[20px] p-8 text-center shadow-sm mt-4 border border-gray-100 dark:border-darkline">
          <Zap size={32} className="mx-auto text-gray-400 mb-3" />
          <p className="text-[15px] font-bold text-navy dark:text-white">Nothing to boost yet</p>
          <p className="text-[13px] text-mute mt-1">Create a listing or post first.</p>
        </div>
      )}

      {selected && selectedTier && (
        <div className="fixed bottom-[90px] left-0 right-0 px-4 z-50 pointer-events-none">
          <div className="bg-white dark:bg-darkcard rounded-[20px] shadow-[0_8px_30px_rgba(0,0,0,0.15)] p-4 max-w-[600px] mx-auto border border-gray-100 dark:border-darkline pointer-events-auto">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[15px] font-bold text-navy dark:text-white">{selectedTier.label} · {selectedTier.duration_days}d</p>
                <p className="text-[12px] text-mute mt-0.5">Targeting: {selectedTier.scope}</p>
              </div>
              <p className="text-[18px] font-bold text-[#12935a]">{selectedTier.price.toLocaleString()} XAF</p>
            </div>
            {selectedTier.id === 1 && canUseFree ? (
              <button onClick={() => purchase(true)} disabled={busy} className="w-full bg-[#12935a] text-white font-bold py-3.5 rounded-[14px] text-[15px] disabled:opacity-50 active:scale-95 transition-transform">
                {busy ? 'Processing...' : 'Use free premium boost'}
              </button>
            ) : (
              <button onClick={() => purchase(false)} disabled={busy} className="w-full bg-[#12935a] text-white font-bold py-3.5 rounded-[14px] text-[15px] disabled:opacity-50 active:scale-95 transition-transform">
                {busy ? 'Processing...' : `Pay ${selectedTier.price.toLocaleString()} XAF from wallet`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
