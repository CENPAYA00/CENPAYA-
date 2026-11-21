import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { d1Request, d1UpdateProfile } from '../lib/d1Api';
import { ArrowRight, Phone } from 'lucide-react';
import Select from '../components/Select';

const OCCUPATIONS = [
  'Student', 'Freelancer', 'Employed', 'Entrepreneur', 'Business Owner',
  'Trader', 'Farmer', 'Teacher', 'Engineer', 'Doctor', 'Nurse',
  'Driver', 'Artisan', 'Technician', 'Designer', 'Developer',
  'Trader / Vendor', 'Civil Servant', 'Unemployed', 'Retired', 'Other',
];

type Country = { country_code: string; name: string; phone_prefix: string | null; status: string };

export default function Onboarding() {
  const navigate = useNavigate();
  const [countries, setCountries] = useState<Country[]>([]);
  const [country, setCountry] = useState('CM');
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [occupation, setOccupation] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    d1Request<{ data: Country[] }>('/api/countries').then(({ data }) => {
      setCountries(data || []);
      if (data?.length && !data.some(item => item.country_code === 'CM')) setCountry(data[0].country_code);
    }).catch(error => setErrorMsg(error instanceof Error ? error.message : 'Unable to load supported countries.'));
  }, []);

  const selectedCountry = countries.find(item => item.country_code === country);

  const handleSubmit = async () => {
    setErrorMsg('');
    if (!selectedCountry) return setErrorMsg('Please select a supported country.');
    if (!region.trim()) return setErrorMsg('Please enter your region.');
    if (!city.trim()) return setErrorMsg('Please enter your city.');
    if (!occupation) return setErrorMsg('Please select your occupation.');
    setLoading(true);
    try {
      await d1UpdateProfile({
        country_code: country,
        location_region: region.trim(),
        location_city: city.trim(),
        occupation,
        onboarding_completed: true,
      });
      navigate('/home', { replace: true });
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Unable to save your details.');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-offwhite dark:bg-darkbg flex flex-col">
      <div className="px-6 pt-10 pb-6">
        <h1 className="text-[22px] font-black text-navy dark:text-white">Welcome to CenPaya</h1>
        <p className="text-[12px] text-gray-500 mt-1">We need a few details before you start.</p>
      </div>
      <div className="flex-1 px-6 space-y-3 overflow-y-auto">
        <div className="bg-white dark:bg-darkcard rounded-2xl p-4 shadow-sm">
          <Select label="Country" value={country} onChange={setCountry}
            options={countries.map(item => ({ value: item.country_code, label: item.name }))} placeholder="Choose your country" />
        </div>
        <div className="bg-white dark:bg-darkcard rounded-2xl p-4 shadow-sm">
          <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-2 block">Region / State</label>
          <input value={region} onChange={event => setRegion(event.target.value)} placeholder="Enter your region"
            className="w-full p-3 rounded-xl bg-gray-50 dark:bg-darkbg border border-gray-200 dark:border-darkline text-sm" />
        </div>
        <div className="bg-white dark:bg-darkcard rounded-2xl p-4 shadow-sm">
          <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-2 block">Your city</label>
          <input value={city} onChange={event => setCity(event.target.value)} placeholder="Enter your city"
            className="w-full p-3 rounded-xl bg-gray-50 dark:bg-darkbg border border-gray-200 dark:border-darkline text-sm" />
        </div>
        <div className="bg-white dark:bg-darkcard rounded-2xl p-4 shadow-sm">
          <Select label="Occupation" value={occupation} onChange={setOccupation}
            options={OCCUPATIONS.map(item => ({ value: item, label: item }))} placeholder="Choose your occupation" />
        </div>
        {selectedCountry && (
          <div className="bg-white dark:bg-darkcard rounded-2xl p-4 shadow-sm">
            <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1 mb-2"><Phone size={11} /> Your phone prefix</label>
            <p className="text-[15px] font-bold text-navy dark:text-white">{selectedCountry.phone_prefix || 'Not available'}</p>
          </div>
        )}
        {errorMsg && <div className="bg-red-50 border border-red-200 text-red-600 text-[11px] p-3 rounded-xl">{errorMsg}</div>}
      </div>
      <div className="p-6">
        <button onClick={handleSubmit} disabled={loading || countries.length === 0}
          className="w-full bg-accent text-white font-bold py-3.5 rounded-xl text-[13px] flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer">
          {loading ? 'Saving...' : 'Continue'} {!loading && <ArrowRight size={15} />}
        </button>
      </div>
    </div>
  );
}
