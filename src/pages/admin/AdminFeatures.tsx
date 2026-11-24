import { useEffect, useState } from 'react';
import { Bot, Phone, RefreshCw, Video } from 'lucide-react';
import { d1Request } from '../../lib/d1Api';
import { supabaseWorkerRequest } from '../../lib/supabaseWorkerApi';

type FeatureFlag = {
  id: string;
  feature_key: string;
  display_name: string;
  description: string;
  is_enabled_globally: boolean;
};

type HostOption = { name: string; display_name: string; active: boolean };
type AssistanceStatus = {
  enabled?: string | boolean;
  host?: string;
  max_minutes?: string | number;
  max_seconds?: string | number;
  available_hosts?: HostOption[];
};

const icons: Record<string, typeof Phone> = {
  voice_calls: Phone,
  video_posts: Video,
  ai_assistant: Bot,
};

const enabled = (value: unknown) => String(value).toLowerCase() === 'true';

export default function AdminFeatures() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [callStatus, setCallStatus] = useState<AssistanceStatus | null>(null);
  const [videoStatus, setVideoStatus] = useState<AssistanceStatus | null>(null);
  const [callHost, setCallHost] = useState('none');
  const [videoHost, setVideoHost] = useState('none');
  const [callMinutes, setCallMinutes] = useState('30');
  const [videoSeconds, setVideoSeconds] = useState('90');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [featureResult, callsResult, videoResult] = await Promise.all([
        d1Request<{ data: FeatureFlag[] }>('/api/admin/features'),
        supabaseWorkerRequest<{ data: AssistanceStatus }>('/api/v1/admin/rpc/admin_call_status', {
          method: 'POST', body: JSON.stringify({ args: {} }),
        }),
        supabaseWorkerRequest<{ data: AssistanceStatus }>('/api/v1/admin/rpc/admin_video_status', {
          method: 'POST', body: JSON.stringify({ args: {} }),
        }),
      ]);
      setFlags(featureResult.data || []);
      setCallStatus(callsResult.data || null);
      setVideoStatus(videoResult.data || null);
      setCallHost(callsResult.data?.host || 'none');
      setVideoHost(videoResult.data?.host || 'none');
      setCallMinutes(String(callsResult.data?.max_minutes || 30));
      setVideoSeconds(String(videoResult.data?.max_seconds || 90));
    } catch (err: any) {
      setError(err.message || 'Could not load all feature controls.');
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

  const saveHost = async (kind: 'call' | 'video') => {
    const host = kind === 'call' ? callHost : videoHost;
    setSaving(kind + '-host');
    setError('');
    try {
      await supabaseWorkerRequest('/api/v1/admin/rpc/' + (kind === 'call' ? 'admin_set_call_host' : 'admin_set_video_host'), {
        method: 'POST', body: JSON.stringify({ args: { p_host: host } }),
      });
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not update assistance provider.');
      setSaving(null);
    }
  };

  const toggleAssistance = async (kind: 'call' | 'video') => {
    if (saving) return;
    const status = kind === 'call' ? callStatus : videoStatus;
    const next = !enabled(status?.enabled);
    if (next && (!status?.host || status.host === 'none')) {
      setError('Choose and save an active provider before enabling this service.');
      return;
    }
    setSaving(kind);
    setError('');
    try {
      await supabaseWorkerRequest('/api/v1/admin/rpc/' + (kind === 'call' ? 'admin_toggle_calls' : 'admin_toggle_video'), {
        method: 'POST',
        body: JSON.stringify({ args: kind === 'call'
          ? { p_enabled: next, p_max_minutes: Number(callMinutes) }
          : { p_enabled: next, p_max_seconds: Number(videoSeconds) } }),
      });
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not update assistance availability.');
      setSaving(null);
    }
  };

  if (loading) return <div className="p-4 text-center text-xs text-gray-500">Loading feature controls...</div>;

  const renderAssistance = (kind: 'call' | 'video') => {
    const isCall = kind === 'call';
    const status = isCall ? callStatus : videoStatus;
    const host = isCall ? callHost : videoHost;
    const hosts = (status?.available_hosts || []).filter(item => item.active);
    const isOn = enabled(status?.enabled);
    const isSaving = saving === kind || saving === kind + '-host';
    const maxValue = isCall ? callMinutes : videoSeconds;
    const setMaxValue = isCall ? setCallMinutes : setVideoSeconds;
    return (
      <section key={kind} className="bg-white dark:bg-darkcard border border-gray-100 dark:border-darkline p-4 rounded-2xl shadow-sm space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-brand flex items-center justify-center shrink-0">
            {isCall ? <Phone size={19} /> : <Video size={19} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-navy dark:text-white">Live {isCall ? 'voice' : 'video'} assistance</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Configure the provider and control whether members can start {isCall ? 'voice' : 'video'} assistance sessions.</p>
            <p className="text-[10px] mt-1 font-semibold text-gray-500">{isOn ? 'Enabled for members' : 'Disabled for members'}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isOn}
            aria-label={'Toggle live ' + kind + ' assistance'}
            onClick={() => void toggleAssistance(kind)}
            disabled={!!saving || ( !isOn && (!status?.host || status.host === 'none'))}
            className={'relative w-12 h-7 rounded-full shrink-0 transition-colors ' + (isOn ? 'bg-brand' : 'bg-gray-300 dark:bg-darkline') + (isSaving ? ' opacity-50' : '')}
          >
            <span className={'absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform ' + (isOn ? 'translate-x-6' : 'translate-x-1')} />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
          <label className="text-[10px] font-bold text-gray-600 dark:text-gray-300">
            Provider
            <select value={host} onChange={e => isCall ? setCallHost(e.target.value) : setVideoHost(e.target.value)} className="mt-1 w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs">
              <option value="none">No provider (disabled)</option>
              {hosts.map(item => <option key={item.name} value={item.name}>{item.display_name || item.name}</option>)}
            </select>
          </label>
          <button onClick={() => void saveHost(kind)} disabled={!!saving || host === (status?.host || 'none')} className="self-end px-4 py-2.5 rounded-lg bg-navy dark:bg-accent text-white text-[11px] font-bold disabled:opacity-50">
            Save provider
          </button>
        </div>
        <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-300">
          Maximum session {isCall ? 'minutes (1–120)' : 'seconds (15–600)'}
          <input type="number" min={isCall ? 1 : 15} max={isCall ? 120 : 600} value={maxValue} onChange={e => setMaxValue(e.target.value)} className="mt-1 w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs" />
        </label>
        <p className="text-[9px] text-gray-400">{hosts.length ? hosts.length + ' active provider(s) available.' : 'No active provider is configured. Activate a provider and add its credentials in Provider Vault first.'}</p>
      </section>
    );
  };

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

      <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">Platform feature flags</h3>
      {flags.map(flag => {
        const Icon = icons[flag.feature_key] || Phone;
        const isSaving = saving === flag.id;
        const isImplemented = flag.feature_key === "voice_calls";
        return (
          <section key={flag.id} className="bg-white dark:bg-darkcard border border-gray-100 dark:border-darkline p-4 rounded-2xl shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-brand flex items-center justify-center shrink-0">
              <Icon size={19} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-navy dark:text-white">{flag.display_name}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">{flag.description}</p>
              <p className="text-[10px] mt-1 font-semibold text-gray-500">{!isImplemented ? 'Not implemented — locked off' : flag.is_enabled_globally ? 'Enabled for users' : 'Disabled for users'}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={flag.is_enabled_globally}
              aria-label={'Toggle ' + flag.display_name}
              onClick={() => void toggleFlag(flag)}
              disabled={!!saving || !isImplemented}
              title={!isImplemented ? 'Not available until implementation is complete' : undefined}
              className={'relative w-12 h-7 rounded-full shrink-0 transition-colors ' + (flag.is_enabled_globally ? 'bg-brand' : 'bg-gray-300 dark:bg-darkline') + (isSaving ? ' opacity-50' : '')}
            >
              <span className={'absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform ' + (flag.is_enabled_globally ? 'translate-x-6' : 'translate-x-1')} />
            </button>
          </section>
        );
      })}

      <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 pt-2">Live assistance services</h3>
      {renderAssistance('call')}
      {renderAssistance('video')}

      <p className="text-[10px] text-gray-500 px-1">Video publishing and the AI assistant remain locked until their complete user-facing implementations are deployed. Live voice and video assistance require an active provider and credentials.</p>
    </div>
  );
}
