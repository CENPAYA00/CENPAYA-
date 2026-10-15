import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowRight, MapPin, Phone, Briefcase } from 'lucide-react';
import { getCachedUser } from '../lib/cache';
import Select from '../components/Select';

const OCCUPATIONS = [
  'Student', 'Freelancer', 'Employed', 'Entrepreneur', 'Business Owner',
  'Trader', 'Farmer', 'Teacher', 'Engineer', 'Doctor', 'Nurse',
  'Driver', 'Artisan', 'Technician', 'Designer', 'Developer',
  'Trader / Vendor', 'Civil Servant', 'Unemployed', 'Retired', 'Other',
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [countries, setCountries] = useState<any[]>([]);
  const [country, setCountry] = useState('CM');
  const [regions, setRegions] = useState<string[]>([]);
  const [region, setRegion] = useState('');
  const [cities, setCities] = useState<string[]>([]);
  const [city, setCity] = useState('');
  const [occupation, setOccupation] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('supported_countries')
        .select('code, name, phone_prefix, flag_emoji, regions, cities')
        .in('code', ['CM', 'GA', 'CG', 'TD', 'CF', 'GQ'])
        .order('name');
      setCountries(data || []);
    })();
  }, []);

  useEffect(() => {
    const c = countries.find(x => x.code === country);
    const rList: string[] = Array.isArray(c?.regions) ? c.regions : [];
    setRegions(rList);
    if (rList.length > 0) {
      setRegion(rList[0]);
      const citiesMap: Record<string, string[]> = c?.cities || {};
      const cList = citiesMap[rList[0]] || [];
      setCities(cList);
      setCity(cList[0] || '');
    } else {
      setRegion('');
      setCities([]);
      setCity('');
    }
  }, [country, countries]);

  useEffect(() => {
    const c = countries.find(x => x.code === country);
    const citiesMap: Record<string, string[]> = c?.cities || {};
    const cList = citiesMap[region] || [];
    setCities(cList);
    setCity(cList[0] || '');
  }, [region]);

  const selectedCountry = countries.find(c => c.code === country);

  const handleSubmit = async () => {
    setErrorMsg('');
    if (!region) return setErrorMsg('Please select your region.');
    if (!city) return setErrorMsg('Please select your city.');
    if (!occupation) return setErrorMsg('Please select your occupation.');

    setLoading(true);
    const me = await getCachedUser();
    if (!me) { setLoading(false); return setErrorMsg('Not logged in.'); }

    const { data, error } = await supabase.rpc('complete_onboarding', {
      p_country_iso: country,
      p_location_city: `${region} - ${city}`,
      p_region: region,
      p_city: city,
      p_occupation: occupation,
    });

    if (error || !data?.ok) {
      setErrorMsg(error?.message || data?.error || 'Something went wrong.');
      setLoading(false);
      return;
    }

    navigate('/home');
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-offwhite dark:bg-darkbg flex flex-col">
      <div className="px-6 pt-10 pb-6">
        <h1 className="text-[22px] font-black text-navy dark:text-white">Welcome to CenPaya</h1>
        <p className="text-[12px] text-gray-500 mt-1">We need a few details before you start.</p>
      </div>

      <div className="flex-1 px-6 space-y-3 overflow-y-auto">
        <div className="bg-white dark:bg-darkcard rounded-2xl p-4 shadow-sm">
          <Select
            label="Country"
            value={country}
            onChange={setCountry}
            options={countries.map(c => ({
              value: c.code,
              label: `${c.flag_emoji || ''} ${c.name} (${c.phone_prefix})`.trim(),
            }))}
            placeholder="Choose your country"
          />
        </div>

        {regions.length > 0 && (
          <div className="bg-white dark:bg-darkcard rounded-2xl p-4 shadow-sm">
            <Select
              label="Region"
              value={region}
              onChange={setRegion}
              options={regions.map(r => ({ value: r, label: r }))}
              placeholder="Choose your region"
            />
          </div>
        )}

        {cities.length > 0 && (
          <div className="bg-white dark:bg-darkcard rounded-2xl p-4 shadow-sm">
            <Select
              label="Your city"
              value={city}
              onChange={setCity}
              options={cities.map(c => ({ value: c, label: c }))}
              placeholder="Choose your city"
            />
          </div>
        )}

        <div className="bg-white dark:bg-darkcard rounded-2xl p-4 shadow-sm">
          <Select
            label="Occupation"
            value={occupation}
            onChange={setOccupation}
            options={OCCUPATIONS.map(o => ({ value: o, label: o }))}
            placeholder="Choose your occupation"
          />
        </div>

        {selectedCountry && (
          <div className="bg-white dark:bg-darkcard rounded-2xl p-4 shadow-sm">
            <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1 mb-2">
              <Phone size={11} /> Your phone prefix
            </label>
            <p className="text-[15px] font-bold text-navy dark:text-white">{selectedCountry.phone_prefix}</p>
            <p className="text-[9px] text-gray-400 mt-1">Added automatically to your MoMo number.</p>
          </div>
        )}

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-[11px] p-3 rounded-xl">
            {errorMsg}
          </div>
        )}
      </div>

      <div className="p-6">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-accent text-white font-bold py-3.5 rounded-xl text-[13px] flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          {loading ? 'Saving...' : 'Continue'}
          {!loading && <ArrowRight size={15} />}
        </button>
      </div>
    </div>
  );
            }
