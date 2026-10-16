import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, User, Mail, Phone, MapPin, Info, Crown, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Select from '../components/Select';
import DobPicker from '../components/DobPicker';
import PhoneInput from '../components/PhoneInput';
import { useI18n } from '../contexts/i18n';

const OCCUPATIONS = [
  'Student', 'Freelancer', 'Employed', 'Entrepreneur', 'Business Owner',
  'Trader', 'Farmer', 'Teacher', 'Engineer', 'Doctor', 'Nurse',
  'Driver', 'Artisan', 'Technician', 'Designer', 'Developer',
  'Trader / Vendor', 'Civil Servant', 'Unemployed', 'Retired', 'Other',
];

export default function SettingsPersonal() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [details, setDetails] = useState<any>(null);
  const [username, setUsername] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneCountry, setPhoneCountry] = useState('CM');
  const [bio, setBio] = useState('');
  const [dob, setDob] = useState('');
  const [showDobPicker, setShowDobPicker] = useState(false);

  const [countries, setCountries] = useState<any[]>([]);
  const [country, setCountry] = useState('CM');
  const [regions, setRegions] = useState<string[]>([]);
  const [region, setRegion] = useState('');
  const [cities, setCities] = useState<string[]>([]);
  const [city, setCity] = useState('');
  const [occupation, setOccupation] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const load = async () => {
      const [{ data }, { data: countryData }] = await Promise.all([
        supabase.rpc('get_my_personal_details'),
        supabase
          .from('supported_countries')
          .select('code, name, phone_prefix, flag_emoji, regions, cities')
          .in('code', ['CM', 'GA', 'CG', 'TD', 'CF', 'GQ'])
          .order('name'),
      ]);

      setCountries(countryData || []);

      if (data?.ok) {
        const p = data.profile;
        setDetails(p);
        setUsername(p.username || '');
        setBio(p.bio || '');
        setDob(p.date_of_birth || '');
        setCountry(p.country_iso || 'CM');
        setRegion(p.region || '');
        setCity(p.city || '');
        setOccupation(p.occupation || '');
        // Phone — split prefix and number
        const fullPhone = p.phone || '';
        const matchedCountry = (countryData || []).find((c: any) => fullPhone.startsWith(c.phone_prefix));
        if (matchedCountry) {
          setPhoneCountry(matchedCountry.code);
          setPhoneNumber(fullPhone.replace(matchedCountry.phone_prefix, '').trim());
        } else {
          setPhoneNumber(fullPhone.replace(/^\+\d+\s?/, ''));
        }
      }
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (countries.length === 0) return;
    const c = countries.find(x => x.code === country);
    const rList: string[] = Array.isArray(c?.regions) ? c.regions : [];
    setRegions(rList);
    if (!rList.includes(region)) setRegion(rList[0] || '');
  }, [country, countries]);

  useEffect(() => {
    if (countries.length === 0) return;
    const c = countries.find(x => x.code === country);
    const cList: string[] = (c?.cities || {})[region] || [];
    setCities(cList);
    if (!cList.includes(city)) setCity(cList[0] || '');
  }, [region, countries, country]);

  const phoneCountries = countries.map(c => ({
    code: c.code,
    name: c.name,
    prefix: c.phone_prefix,
    flag: c.flag_emoji,
  }));
  const phonePrefix = phoneCountries.find(c => c.code === phoneCountry)?.prefix || '+237';

  const save = async () => {
    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    const fullPhone = phoneNumber.trim() ? `${phonePrefix} ${phoneNumber.trim()}` : null;

    const { data, error } = await supabase.rpc('update_personal_details', {
      p_username: username !== details?.username ? username : null,
      p_phone: fullPhone && fullPhone !== details?.phone ? fullPhone : null,
      p_bio: bio !== details?.bio ? bio : null,
      p_location_city: `${region} - ${city}`,
      p_region: region !== details?.region ? region : null,
      p_city: city !== details?.city ? city : null,
      p_occupation: occupation !== details?.occupation ? occupation : null,
      p_country_iso: country !== details?.country_iso ? country : null,
      p_date_of_birth: dob !== details?.date_of_birth ? (dob || null) : null,
    });

    if (error || !data?.ok) {
      setErrorMsg(error?.message || data?.error || 'Save failed');
    } else {
      setSuccessMsg('✓ Saved');
      setTimeout(() => setSuccessMsg(''), 2000);
    }
    setSaving(false);
  };

  if (loading) return <div className="p-4 text-center text-xs">{t('loading')}</div>;

  const isPremium = details?.is_subscribed || details?.is_membership_exempt;

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand cursor-pointer"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">{t('personal_details')}</h1>
      </div>

      {isPremium && (
        <div className="bg-gradient-to-r from-brand to-brand-dark rounded-xl p-3 mb-3 flex items-center gap-2 text-white">
          <Crown size={16} className="text-gold" />
          <p className="text-[11px] font-bold">{t('premium_member')}</p>
        </div>
      )}

      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-4 mb-3">
        <Row icon={<User size={13} />} label="Username">
          <input
            value={username}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
            className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-darkline bg-gray-50 dark:bg-darkbg text-[12px]"
          />
        </Row>

        <Row icon={<Mail size={13} />} label="Email">
          <p className="text-[12px] text-gray-500">{details?.email}</p>
          <p className="text-[9px] text-gray-400">
            {details?.is_email_verified ? t('verified') : t('not_verified')}
          </p>
        </Row>

        <Row icon={<Phone size={13} />} label="Phone">
          <PhoneInput
            value={phoneNumber}
            onChange={setPhoneNumber}
            countryCode={phoneCountry}
            onCountryChange={setPhoneCountry}
            countries={phoneCountries}
            placeholder="6XX XXX XXX"
          />
          <p className="text-[9px] text-gray-400 mt-1.5">
            {details?.is_phone_verified ? t('verified') : t('not_verified')}
          </p>
        </Row>

        <Row icon={<Calendar size={13} />} label="Date of birth">
          <button
            type="button"
            onClick={() => setShowDobPicker(v => !v)}
            className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-darkline bg-gray-50 dark:bg-darkbg text-[12px] text-left cursor-pointer"
          >
            {dob || 'Select your date of birth'}
          </button>
        </Row>
      </div>

      {showDobPicker && (
        <div className="mb-3">
          <DobPicker
            value={dob}
            onChange={setDob}
            onConfirm={() => setShowDobPicker(false)}
          />
        </div>
      )}

      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-4 mb-3 space-y-3">
        <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
          <MapPin size={12} /> {t('location')}
        </p>

        <Select
          label={t('country')}
          value={country}
          onChange={setCountry}
          options={countries.map(c => ({
            value: c.code,
            label: `${c.flag_emoji || ''} ${c.name} (${c.phone_prefix})`.trim(),
          }))}
          placeholder={t('choose_country')}
        />

        {regions.length > 0 && (
          <Select
            label={t('region')}
            value={region}
            onChange={setRegion}
            options={regions.map(r => ({ value: r, label: r }))}
            placeholder={t('choose_region')}
          />
        )}

        {cities.length > 0 && (
          <Select
            label={t('city')}
            value={city}
            onChange={setCity}
            options={cities.map(c => ({ value: c, label: c }))}
            placeholder={t('choose_city')}
          />
        )}

        <Select
          label={t('occupation')}
          value={occupation}
          onChange={setOccupation}
          options={OCCUPATIONS.map(o => ({ value: o, label: o }))}
          placeholder={t('choose_occupation')}
        />
      </div>

      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-4 mb-3">
        <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1 mb-2">
          <Info size={12} /> {t('bio')}
        </p>
        <textarea
          value={bio}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBio(e.target.value)}
          rows={3}
          className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-darkline bg-gray-50 dark:bg-darkbg text-[12px] resize-none"
        />
      </div>

      {errorMsg && <div className="bg-red-50 border border-red-200 text-red-600 text-[11px] p-3 rounded-xl mb-3">{errorMsg}</div>}
      {successMsg && <div className="bg-green-50 border border-green-200 text-green-700 text-[11px] p-3 rounded-xl mb-3 flex items-center gap-1"><Check size={13} /> {successMsg}</div>}

      <button
        onClick={save}
        disabled={saving}
        className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[13px] disabled:opacity-50 cursor-pointer"
      >
        {saving ? t('processing') : t('save_changes')}
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
