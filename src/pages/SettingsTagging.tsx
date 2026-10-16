import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';

type Tagging = 'everyone' | 'followers' | 'nobody';

export default function SettingsTagging() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tagging, setTagging] = useState<Tagging>('everyone');
  const [mentioning, setMentioning] = useState<Tagging>('everyone');

  useEffect(() => {
    const load = async () => {
      const me = await getCachedUser();
      if (!me) { setLoading(false); return; }
      const { data } = await supabase
        .from('users')
        .select('allow_tagging, allow_mentioning')
        .eq('id', me.id)
        .maybeSingle();
      if (data?.allow_tagging) setTagging(data.allow_tagging as Tagging);
      if (data?.allow_mentioning) setMentioning(data.allow_mentioning as Tagging);
      setLoading(false);
    };
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    const me = await getCachedUser();
    if (!me) { setSaving(false); return; }
    const { error } = await supabase
      .from('users')
      .update({ allow_tagging: tagging, allow_mentioning: mentioning })
      .eq('id', me.id);
    setSaving(false);
    if (error) { alert(error.message); return; }
    alert('Saved');
    navigate(-1);
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  const options: { key: Tagging; label: string }[] = [
    { key: 'everyone', label: 'Everyone' },
    { key: 'followers', label: 'People you follow' },
    { key: 'nobody', label: 'Nobody' },
  ];

  const renderField = (title: string, value: Tagging, setter: (v: Tagging) => void) => (
    <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-3 mb-3">
      <p className="text-[11px] font-bold text-navy dark:text-white mb-2">{title}</p>
      {options.map(opt => (
        <button
          key={opt.key}
          onClick={() => setter(opt.key)}
          className={`w-full p-3 rounded-xl border-2 mb-2 flex items-center gap-3 text-left cursor-pointer ${
            value === opt.key ? 'border-accent bg-accent/5' : 'border-gray-200 dark:border-darkline'
          }`}
        >
          <span className="flex-1 text-[12px] font-bold text-navy dark:text-white">{opt.label}</span>
          {value === opt.key && <Check size={16} className="text-accent" />}
        </button>
      ))}
    </div>
  );

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand cursor-pointer"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">Profile and tagging</h1>
      </div>

      {renderField('Who can tag you in posts', tagging, setTagging)}
      {renderField('Who can @mention you', mentioning, setMentioning)}

      <button
        onClick={save}
        disabled={saving}
        className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[13px] disabled:opacity-50 cursor-pointer"
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
}
