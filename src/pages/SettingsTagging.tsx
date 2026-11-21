import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { d1Request } from '../lib/d1Api';
import { getCachedUser } from '../lib/cache';

type Tagging = 'everyone' | 'followers' | 'nobody';

export default function SettingsTagging() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tagging, setTagging] = useState<Tagging>('everyone');
  const [mentioning, setMentioning] = useState<Tagging>('everyone');

  useEffect(() => {
    d1Request<{ data?: { allow_tagging?: Tagging; allow_mentioning?: Tagging } }>('/api/me/tagging-settings')
      .then(result => { if (result.data?.allow_tagging) setTagging(result.data.allow_tagging); if (result.data?.allow_mentioning) setMentioning(result.data.allow_mentioning); })
      .catch((error: any) => alert(error.message || 'Could not load tagging settings'))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await d1Request('/api/me/tagging-settings', { method: 'PATCH', body: JSON.stringify({ allow_tagging: tagging, allow_mentioning: mentioning }) });
      alert('Saved');
      navigate(-1);
    } catch (error: any) { alert(error.message || 'Could not save tagging settings'); }
    finally { setSaving(false); }
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
