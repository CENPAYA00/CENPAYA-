import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';

type Visibility = 'public' | 'followers' | 'private';

export default function SettingsDetails() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bioVis, setBioVis] = useState<Visibility>('public');
  const [phoneVis, setPhoneVis] = useState<Visibility>('followers');
  const [emailVis, setEmailVis] = useState<Visibility>('private');
  const [joinedVis, setJoinedVis] = useState<Visibility>('public');
  const [occupationVis, setOccupationVis] = useState<Visibility>('public');
  const [locationVis, setLocationVis] = useState<Visibility>('followers');

  useEffect(() => {
    const load = async () => {
      const me = await getCachedUser();
      if (!me) { setLoading(false); return; }
      const { data } = await supabase
        .from('users')
        .select('profile_details_visibility')
        .eq('id', me.id)
        .maybeSingle();
      const v = data?.profile_details_visibility || {};
      setBioVis(v.bio || 'public');
      setPhoneVis(v.phone || 'followers');
      setEmailVis(v.email || 'private');
      setJoinedVis(v.joined || 'public');
      setOccupationVis(v.occupation || 'public');
      setLocationVis(v.location || 'followers');
      setLoading(false);
    };
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    const me = await getCachedUser();
    if (!me) { setSaving(false); return; }
    const payload = {
      bio: bioVis,
      phone: phoneVis,
      email: emailVis,
      joined: joinedVis,
      occupation: occupationVis,
      location: locationVis,
    };
    const { error } = await supabase.from('users').update({ profile_details_visibility: payload }).eq('id', me.id);
    setSaving(false);
    if (error) { alert(error.message); return; }
    alert('Saved');
    navigate(-1);
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  const options: { key: Visibility; label: string; sub: string }[] = [
    { key: 'public', label: 'Everyone', sub: 'Anyone can see this' },
    { key: 'followers', label: 'Followers only', sub: 'Only people who follow you' },
    { key: 'private', label: 'Only me', sub: 'No one else can see this' },
  ];

  const renderField = (title: string, value: Visibility, setter: (v: Visibility) => void) => (
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
          <div className="flex-1">
            <p className="text-[12px] font-bold text-navy dark:text-white">{opt.label}</p>
            <p className="text-[10px] text-gray-500">{opt.sub}</p>
          </div>
          {value === opt.key && <Check size={16} className="text-accent" />}
        </button>
      ))}
    </div>
  );

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand cursor-pointer"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">Profile details</h1>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-3 mb-3">
        <p className="text-[10px] text-blue-700 dark:text-blue-300 leading-relaxed">
          Control who can see each part of your profile.
        </p>
      </div>

      {renderField('Bio', bioVis, setBioVis)}
      {renderField('Phone number', phoneVis, setPhoneVis)}
      {renderField('Email address', emailVis, setEmailVis)}
      {renderField('Join date', joinedVis, setJoinedVis)}
      {renderField('Occupation', occupationVis, setOccupationVis)}
      {renderField('Location', locationVis, setLocationVis)}

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
