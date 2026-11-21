import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { d1Request } from '../lib/d1Api';

type Visibility = 'public' | 'followers' | 'private';
type DetailsVisibility = { bio: Visibility; phone: Visibility; email: Visibility; joined: Visibility; occupation: Visibility; location: Visibility };
const DEFAULTS: DetailsVisibility = { bio: 'public', phone: 'followers', email: 'private', joined: 'public', occupation: 'public', location: 'followers' };
export default function SettingsDetails() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<DetailsVisibility>(DEFAULTS);
  useEffect(() => {
    d1Request<{ data?: Partial<DetailsVisibility> }>('/api/me/profile-details-visibility')
      .then(r => { if (r.data) setValues(v => ({ ...v, ...r.data })); })
      .catch((e: any) => alert(e.message || 'Could not load profile detail visibility'))
      .finally(() => setLoading(false));
  }, []);
  const set = (key: keyof DetailsVisibility, value: Visibility) => setValues(v => ({ ...v, [key]: value }));
  const save = async () => {
    setSaving(true);
    try { await d1Request('/api/me/profile-details-visibility', { method: 'PATCH', body: JSON.stringify(values) }); alert('Saved'); navigate(-1); }
    catch (e: any) { alert(e.message || 'Could not save settings'); }
    finally { setSaving(false); }
  };
  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;
  const options: { key: Visibility; label: string; sub: string }[] = [
    { key: 'public', label: 'Everyone', sub: 'Anyone can see this' },
    { key: 'followers', label: 'Followers only', sub: 'Only people who follow you' },
    { key: 'private', label: 'Only me', sub: 'No one else can see this' },
  ];
  const renderField = (title: string, key: keyof DetailsVisibility) => <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-3 mb-3">
    <p className="text-[11px] font-bold text-navy dark:text-white mb-2">{title}</p>
    {options.map(opt => <button key={opt.key} onClick={() => set(key, opt.key)} className={`w-full p-3 rounded-xl border-2 mb-2 flex items-center gap-3 text-left ${values[key] === opt.key ? 'border-accent bg-accent/5' : 'border-gray-200 dark:border-darkline'}`}>
      <div className="flex-1"><p className="text-[12px] font-bold text-navy dark:text-white">{opt.label}</p><p className="text-[10px] text-gray-500">{opt.sub}</p></div>
      {values[key] === opt.key && <Check size={16} className="text-accent" />}
    </button>)}
  </div>;
  return <div className="px-3 py-3 pb-24">
    <div className="flex items-center gap-2 mb-3"><button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button><h1 className="text-base font-bold text-navy dark:text-white">Profile details</h1></div>
    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-3 mb-3"><p className="text-[10px] text-blue-700 dark:text-blue-300 leading-relaxed">Control who can see each part of your profile.</p></div>
    {renderField('Bio', 'bio')}{renderField('Phone number', 'phone')}{renderField('Email address', 'email')}{renderField('Join date', 'joined')}{renderField('Occupation', 'occupation')}{renderField('Location', 'location')}
    <button onClick={save} disabled={saving} className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[13px] disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
  </div>;
}
