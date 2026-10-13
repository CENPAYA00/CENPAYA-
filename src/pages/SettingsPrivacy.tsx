import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';

export default function SettingsPrivacy() {
  const navigate = useNavigate();
  const [visibility, setVisibility] = useState<'public' | 'followers'>('public');
  const [tagging, setTagging] = useState<'everyone' | 'friends' | 'nobody'>('everyone');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const me = await getCachedUser();
      if (!me) { setLoading(false); return; }
      const { data } = await supabase
        .from('users')
        .select('profile_visibility, allow_tagging')
        .eq('id', me.id)
        .single();
      if (data?.profile_visibility) setVisibility(data.profile_visibility);
      if (data?.allow_tagging) setTagging(data.allow_tagging);
      setLoading(false);
    };
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc('update_my_profile', {
      p_profile_visibility: visibility,
      p_allow_tagging: tagging,
    });
    setSaving(false);
    if (error) alert(error.message);
    else { alert('Saved'); navigate(-1); }
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">Profile locking</h1>
      </div>

      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-3 mb-3">
        <p className="text-[11px] font-bold text-navy dark:text-white mb-2">Who can see your profile</p>
        {[
          { key: 'public', label: 'Public', sub: 'Anyone on CenPaya can view your profile' },
          { key: 'followers', label: 'Followers only', sub: 'Only people who follow you can view your profile' },
        ].map(opt => (
          <button
            key={opt.key}
            onClick={() => setVisibility(opt.key as any)}
            className={`w-full p-3 rounded-xl border-2 mb-2 flex items-center gap-3 text-left ${
              visibility === opt.key
                ? 'border-accent bg-accent/5'
                : 'border-gray-200 dark:border-darkline'
            }`}
          >
            <div className="flex-1">
              <p className="text-[12px] font-bold text-navy dark:text-white">{opt.label}</p>
              <p className="text-[10px] text-gray-500">{opt.sub}</p>
            </div>
            {visibility === opt.key && <Check size={16} className="text-accent" />}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-3 mb-3">
        <p className="text-[11px] font-bold text-navy dark:text-white mb-2">Who can tag you</p>
        {[
          { key: 'everyone', label: 'Everyone' },
          { key: 'friends', label: 'Followers only' },
          { key: 'nobody', label: 'Nobody' },
        ].map(opt => (
          <button
            key={opt.key}
            onClick={() => setTagging(opt.key as any)}
            className={`w-full p-3 rounded-xl border-2 mb-2 flex items-center gap-3 ${
              tagging === opt.key
                ? 'border-accent bg-accent/5'
                : 'border-gray-200 dark:border-darkline'
            }`}
          >
            <span className="flex-1 text-left text-[12px] font-bold text-navy dark:text-white">
              {opt.label}
            </span>
            {tagging === opt.key && <Check size={16} className="text-accent" />}
          </button>
        ))}
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full bg-accent text-white font-bold py-3 rounded-xl text-xs disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
    }
