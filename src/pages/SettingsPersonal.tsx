import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, User, Mail, Phone, MapPin, Calendar, Info, Crown } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function SettingsPersonal() {
  const navigate = useNavigate();
  const [details, setDetails] = useState<any>(null);
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [locationCity, setLocationCity] = useState('');
  const [dob, setDob] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.rpc('get_my_personal_details');
      if (data?.ok) {
        const p = data.profile;
        setDetails(p);
        setUsername(p.username || '');
        setPhone(p.phone || '');
        setBio(p.bio || '');
        setLocationCity(p.location_city || '');
        setDob(p.date_of_birth || '');
      }
      setLoading(false);
    };
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');
    const { data, error } = await supabase.rpc('update_personal_details', {
      p_username: username !== details?.username ? username : null,
      p_phone: phone !== details?.phone ? phone : null,
      p_bio: bio !== details?.bio ? bio : null,
      p_location_city: locationCity !== details?.location_city ? locationCity : null,
      p_date_of_birth: dob !== details?.date_of_birth ? (dob || null) : null,
    });
    if (error || !data?.ok) setErrorMsg(error?.message || data?.error || 'Save failed');
    else { setSuccessMsg('Saved'); setTimeout(() => setSuccessMsg(''), 2000); }
    setSaving(false);
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  const isPremium = details?.is_subscribed || details?.is_membership_exempt;

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">Personal details</h1>
      </div>

      {isPremium && (
        <div className="bg-gradient-to-r from-brand to-brand-dark rounded-xl p-3 mb-3 flex items-center gap-2 text-white">
          <Crown size={16} className="text-gold" />
          <p className="text-[11px] font-bold">You are a Premium member</p>
        </div>
      )}

      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-4 mb-3">
        <Row icon={<User size={13} />} label="Username">
          <input value={username} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)} className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-darkline bg-gray-50 dark:bg-darkbg text-[12px]" />
        </Row>

        <Row icon={<Mail size={13} />} label="Email">
          <p className="text-[12px] text-gray-500">{details?.email}</p>
          <p className="text-[9px] text-gray-400">{details?.is_email_verified ? 'Verified' : 'Not verified'}</p>
        </Row>

        <Row icon={<Phone size={13} />} label="Phone">
          <input type="tel" value={phone} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)} placeholder="+237..." className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-darkline bg-gray-50 dark:bg-darkbg text-[12px]" />
          <p className="text-[9px] text-gray-400">{details?.is_phone_verified ? 'Verified' : 'Verify from Security'}</p>
        </Row>

        <Row icon={<Calendar size={13} />} label="Date of birth">
          <input type="date" value={dob} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDob(e.target.value)} className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-darkline bg-gray-50 dark:bg-darkbg text-[12px]" />
        </Row>

        <Row icon={<MapPin size={13} />} label="City">
          <input value={locationCity} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocationCity(e.target.value)} className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-darkline bg-gray-50 dark:bg-darkbg text-[12px]" />
        </Row>

        <Row icon={<Info size={13} />} label="Bio">
          <textarea value={bio} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBio(e.target.value)} rows={3} className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-darkline bg-gray-50 dark:bg-darkbg text-[12px] resize-none" />
        </Row>
      </div>

      {errorMsg && <div className="bg-red-50 border border-red-200 text-red-600 text-[11px] p-3 rounded-xl mb-3">{errorMsg}</div>}
      {successMsg && <div className="bg-green-50 border border-green-200 text-green-700 text-[11px] p-3 rounded-xl mb-3 flex items-center gap-1"><Check size={13} /> {successMsg}</div>}

      <button onClick={save} disabled={saving} className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[13px] disabled:opacity-50">
        {saving ? 'Saving...' : 'Save changes'}
      </button>
    </div>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="py-3 border-b border-gray-100 dark:border-darkline last:border-b-0">
      <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1 mb-1.5">
        {icon} {label}
      </p>
      {children}
    </div>
  );
    }
