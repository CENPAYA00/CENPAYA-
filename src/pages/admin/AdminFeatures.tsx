import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Phone, Zap } from 'lucide-react';

export default function AdminFeatures() {
  const [flags, setFlags] = useState<any[]>([]);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingVoice, setSavingVoice] = useState(false);

  const load = async () => {
    setLoading(true);
    const [flagsRes, voiceRes] = await Promise.all([
      supabase.from('application_feature_flags').select('*'),
      supabase.from('app_settings').select('value').eq('key', 'voice_calls_enabled').maybeSingle(),
    ]);
    setFlags(flagsRes.data || []);
    setVoiceEnabled(voiceRes.data?.value === 'true');
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleFlag = async (flag: any) => {
    await supabase
      .from('application_feature_flags')
      .update({ is_enabled_globally: !flag.is_enabled_globally })
      .eq('id', flag.id);
    setFlags(flags.map(f => f.id === flag.id ? { ...f, is_enabled_globally: !f.is_enabled_globally } : f));
  };

  const toggleVoice = async () => {
    setSavingVoice(true);
    const next = !voiceEnabled;
    const { error } = await supabase.rpc('admin_set_app_setting', {
      p_key: 'voice_calls_enabled',
      p_value: next ? 'true' : 'false',
    });
    if (error) alert(error.message);
    else setVoiceEnabled(next);
    setSavingVoice(false);
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-navy dark:text-white mb-4">⚙️ Feature Flags</h2>

      {/* Voice call toggle */}
      <div className="bg-white dark:bg-darkcard p-4 rounded-xl shadow-sm mb-4 flex justify-between items-center">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 bg-accent/15 rounded-lg flex items-center justify-center text-accent shrink-0">
            <Phone size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-navy dark:text-white">Voice calls</p>
            <p className="text-[10px] text-gray-500">
              {voiceEnabled ? 'Enabled for all users' : 'Disabled — hidden from all users'}
            </p>
          </div>
        </div>
        <button
          onClick={toggleVoice}
          disabled={savingVoice}
          className={`w-12 h-6 rounded-full transition-colors shrink-0 ${voiceEnabled ? 'bg-accent' : 'bg-gray-300 dark:bg-darkline'} disabled:opacity-50`}
        >
          <div className={`w-5 h-5 bg-white rounded-full transition-transform ${voiceEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {/* Existing flags */}
      {flags.map(f => (
        <div key={f.id} className="bg-white dark:bg-darkcard p-4 rounded-xl shadow-sm mb-2 flex justify-between items-center">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-navy dark:text-white text-[12px]">{f.display_name}</p>
            <p className="text-[10px] text-gray-500">{f.description}</p>
          </div>
          <button
            onClick={() => toggleFlag(f)}
            className={`w-12 h-6 rounded-full transition-colors shrink-0 ${f.is_enabled_globally ? 'bg-accent' : 'bg-gray-300 dark:bg-darkline'}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full transition-transform ${f.is_enabled_globally ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        </div>
      ))}
    </div>
  );
      }
