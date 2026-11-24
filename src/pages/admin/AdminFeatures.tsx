import { useEffect, useState } from 'react';
import { Bot, Phone, RefreshCw, Video } from 'lucide-react';
import { d1Request } from '../../lib/d1Api';

type FeatureFlag = {
  id: string;
  feature_key: string;
  display_name: string;
  description: string;
  is_enabled_globally: boolean;
};

const icons: Record<string, typeof Phone> = {
  voice_calls: Phone,
  video_posts: Video,
  ai_assistant: Bot,
};

export default function AdminFeatures() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await d1Request<{ data: FeatureFlag[] }>('/api/admin/features');
      setFlags(result.data || []);
    } catch (err: any) {
      setError(err.message || 'Could not load feature controls.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const toggleFlag = async (flag: FeatureFlag) => {
    if (saving) return;
    const next = !flag.is_enabled_globally;
    setSaving(flag.id);
    setError('');
    try {
      await d1Request('/api/admin/features/' + encodeURIComponent(flag.feature_key), {
        method: 'PATCH',
        body: JSON.stringify({ is_enabled_globally: next }),
      });
      setFlags(current => current.map(item => item.id === flag.id
        ? { ...item, is_enabled_globally: next }
        : item));
    } catch (err: any) {
      setError(err.message || 'Could not update feature.');
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <div className="p-4 text-center text-xs text-gray-500">Loading feature controls...</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-2xl font-bold text-navy dark:text-white">Feature controls</h2>
          <p className="text-xs text-gray-500 mt-1">Manage availability across the Cenpaya app.</p>
        </div>
        <button onClick={() => void load()} disabled={!!saving} aria-label="Refresh feature controls" className="p-2 rounded-xl border border-gray-200 dark:border-darkline text-gray-600 dark:text-gray-300">
          <RefreshCw size={17} />
        </button>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 text-red-700 p-3 text-xs">{error}</div>}

      {flags.map(flag => {
        const Icon = icons[flag.feature_key] || Phone;
        const isSaving = saving === flag.id;
        return (
          <section key={flag.id} className="bg-white dark:bg-darkcard border border-gray-100 dark:border-darkline p-4 rounded-2xl shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-brand flex items-center justify-center shrink-0">
              <Icon size={19} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-navy dark:text-white">{flag.display_name}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">{flag.description}</p>
              <p className="text-[10px] mt-1 font-semibold text-gray-500">{flag.is_enabled_globally ? 'Enabled for users' : 'Disabled for users'}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={flag.is_enabled_globally}
              aria-label={'Toggle ' + flag.display_name}
              onClick={() => void toggleFlag(flag)}
              disabled={!!saving}
              className={'relative w-12 h-7 rounded-full shrink-0 transition-colors ' + (flag.is_enabled_globally ? 'bg-brand' : 'bg-gray-300 dark:bg-darkline') + (isSaving ? ' opacity-50' : '')}
            >
              <span className={'absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform ' + (flag.is_enabled_globally ? 'translate-x-6' : 'translate-x-1')} />
            </button>
          </section>
        );
      })}

      <p className="text-[10px] text-gray-500 px-1">Video and AI controls are initially off. Enabling a switch only activates a feature after its complete user-facing implementation is deployed.</p>
    </div>
  );
}
