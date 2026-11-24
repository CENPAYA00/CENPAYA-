import { useEffect, useState } from 'react';
import { d1Request } from '../../lib/d1Api';
import { Phone, Video, Sparkles, Lock, CheckCircle2 } from 'lucide-react';

type FeatureFlag = {
  id: string;
  feature_key: string;
  display_name: string;
  description: string;
  ready: boolean;
  blocked_reason: string | null;
  is_enabled_globally: boolean;
};

const icons: Record<string, typeof Phone> = {
  voice_calls: Phone,
  video_posts: Video,
  ai_assistant: Sparkles,
};

export default function AdminFeatures() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const result = await d1Request<{ data: FeatureFlag[] }>('/api/admin/features');
      setFlags(result.data || []);
    } catch (error) {
      console.warn('Could not load D1 feature flags', error);
      setFlags([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const toggleFlag = async (flag: FeatureFlag) => {
    if (saving || (!flag.is_enabled_globally && !flag.ready)) {
      if (!flag.ready && flag.blocked_reason) alert(flag.blocked_reason);
      return;
    }
    const next = !flag.is_enabled_globally;
    setSaving(flag.id);
    try {
      await d1Request('/api/admin/features/' + encodeURIComponent(flag.feature_key), {
        method: 'PATCH',
        body: JSON.stringify({ is_enabled_globally: next }),
      });
      setFlags(current => current.map(item => item.id === flag.id
        ? { ...item, is_enabled_globally: next } : item));
    } catch (error: any) {
      alert(error.message || 'Could not update feature');
      await load();
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-navy dark:text-white mb-4">⚙️ Feature Flags</h2>
      <p className="text-xs text-gray-500 mb-4">Feature switches are controlled by the D1 Worker. Features cannot be enabled until their required services are configured.</p>
      {flags.map(flag => {
        const Icon = icons[flag.feature_key] || Sparkles;
        const enabled = flag.is_enabled_globally;
        return (
          <div key={flag.id} className="bg-white dark:bg-darkcard p-4 rounded-xl shadow-sm mb-2 flex justify-between items-center gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="w-9 h-9 bg-accent/15 rounded-lg flex items-center justify-center text-accent shrink-0">
                <Icon size={16} />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-navy dark:text-white text-[12px]">{flag.display_name}</p>
                <p className="text-[10px] text-gray-500">{flag.description}</p>
                <p className="text-[10px] mt-1 flex items-center gap-1">
                  {flag.ready
                    ? <><CheckCircle2 size={11} className="text-green-600" /> <span className="text-green-600">Ready to enable</span></>
                    : <><Lock size={11} className="text-amber-600" /> <span className="text-amber-700">{flag.blocked_reason || 'Required service not configured'}</span></>}
                </p>
              </div>
            </div>
            <button
              onClick={() => void toggleFlag(flag)}
              disabled={saving !== null || (!enabled && !flag.ready)}
              aria-label={(enabled ? 'Disable ' : 'Enable ') + flag.display_name}
              aria-pressed={enabled}
              className={`w-12 h-6 rounded-full transition-colors shrink-0 ${enabled ? 'bg-accent' : 'bg-gray-300 dark:bg-darkline'} disabled:opacity-50`}
            >
              <div className={`w-5 h-5 bg-white rounded-full transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
