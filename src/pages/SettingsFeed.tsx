import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, SlidersHorizontal, Sparkles, Info } from 'lucide-react';
import { d1Request } from '../lib/d1Api';

type Interest = { topic_key: string; score: number; updated_at: string };

export default function SettingsFeed() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Interest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await d1Request<{ data: Interest[] }>('/api/me/feed-interests');
      setItems(Array.isArray(result.data) ? result.data : []);
    } catch (e: any) {
      setError(e.message || 'Could not load feed preferences.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const reset = async () => {
    if (!window.confirm('Reset your learned feed interests? Your likes, saves and follows will not be removed.')) return;
    setBusy(true);
    setError('');
    try {
      await d1Request('/api/me/feed-interests', { method: 'DELETE' });
      setItems([]);
    } catch (e: any) {
      setError(e.message || 'Could not reset recommendations.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => navigate(-1)} className="text-brand" aria-label="Back"><ArrowLeft size={18}/></button>
        <div><h1 className="text-base font-bold text-navy dark:text-white">Feed preferences</h1><p className="text-[10px] text-gray-500">Control what Cenpaya recommends</p></div>
      </div>
      <div className="rounded-2xl p-4 bg-gradient-to-br from-[#0b6540] to-[#123b2b] text-white mb-4">
        <div className="flex items-center gap-2"><Sparkles size={18}/><p className="font-bold text-sm">Your interests</p></div>
        <p className="text-xs text-white/80 mt-2 leading-relaxed">Your feed learns from repeated watch time, reading time, likes, comments, saves and shares. One accidental view does not define your interests.</p>
      </div>
      <div className="bg-white dark:bg-darkcard rounded-2xl p-4 border border-gray-100 dark:border-darkline">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2"><SlidersHorizontal size={16}/><h2 className="font-bold text-sm text-navy dark:text-white">Topics shaping your feed</h2></div>
          <button onClick={() => void load()} className="text-brand" aria-label="Refresh"><RefreshCw size={15}/></button>
        </div>
        {loading ? <p className="text-xs text-gray-500 py-6">Loading your interests…</p> :
          items.length === 0 ? <p className="text-xs text-gray-500 py-6">Your feed is still learning. Explore posts and videos to build relevant recommendations.</p> :
          <div className="flex flex-wrap gap-2 mt-4">
            {items.map(item => <span key={item.topic_key} className="px-3 py-2 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200 text-xs font-semibold capitalize">{item.topic_key}</span>)}
          </div>}
      </div>
      <div className="flex gap-2 items-start p-3 mt-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200">
        <Info size={15} className="shrink-0 mt-0.5"/>
        <p className="text-[10px] leading-relaxed">Following, privacy settings and blocked accounts always take priority over recommendations. Private and followers-only posts are never made public by feed ranking.</p>
      </div>
      {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
      <button onClick={reset} disabled={busy || loading} className="w-full mt-4 py-3 rounded-xl border border-red-200 dark:border-red-900/40 text-red-600 font-bold text-xs disabled:opacity-50">{busy ? 'Resetting…' : 'Reset learned interests'}</button>
    </div>
  );
}
