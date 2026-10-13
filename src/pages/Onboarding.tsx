import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowRight, MapPin, Calendar } from 'lucide-react';
import { getCachedUser } from '../lib/cache';

const COUNTRIES = [
  { code: 'CM', name: 'Cameroon' },
  { code: 'GA', name: 'Gabon' },
  { code: 'CG', name: 'Congo' },
  { code: 'TD', name: 'Chad' },
  { code: 'CF', name: 'Central African Republic' },
  { code: 'GQ', name: 'Equatorial Guinea' },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [dob, setDob] = useState('');
  const [country, setCountry] = useState('CM');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async () => {
    setErrorMsg('');
    if (!dob) return setErrorMsg('Please enter your date of birth.');
    if (!city.trim() || city.trim().length < 2) return setErrorMsg('Please enter your city.');

    setLoading(true);
    const me = await getCachedUser();
    if (!me) { setLoading(false); return setErrorMsg('Not logged in.'); }

    const { data, error } = await supabase.rpc('complete_onboarding', {
      p_date_of_birth: dob,
      p_country_iso: country,
      p_location_city: city.trim(),
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

      <div className="flex-1 px-6 space-y-3">
        <div className="bg-white dark:bg-darkcard rounded-2xl p-4 shadow-sm">
          <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1 mb-2">
            <Calendar size={11} /> Date of birth
          </label>
          <input
            type="date"
            value={dob}
            onChange={e => setDob(e.target.value)}
            max={new Date(Date.now() - 13 * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10)}
            className="w-full p-3 rounded-xl border border-gray-200 dark:border-darkline bg-gray-50 dark:bg-darkbg text-[13px]"
          />
          <p className="text-[9px] text-gray-400 mt-1">You must be at least 13 years old.</p>
        </div>

        <div className="bg-white dark:bg-darkcard rounded-2xl p-4 shadow-sm">
          <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2 block">
            Country
          </label>
          <select
            value={country}
            onChange={e => setCountry(e.target.value)}
            className="w-full p-3 rounded-xl border border-gray-200 dark:border-darkline bg-gray-50 dark:bg-darkbg text-[13px]"
          >
            {COUNTRIES.map(c => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="bg-white dark:bg-darkcard rounded-2xl p-4 shadow-sm">
          <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1 mb-2">
            <MapPin size={11} /> Your city
          </label>
          <input
            value={city}
            onChange={e => setCity(e.target.value)}
            placeholder="e.g. Yaoundé"
            className="w-full p-3 rounded-xl border border-gray-200 dark:border-darkline bg-gray-50 dark:bg-darkbg text-[13px]"
          />
        </div>

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
          className="w-full bg-accent text-white font-bold py-3.5 rounded-xl text-[13px] flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Continue'}
          {!loading && <ArrowRight size={15} />}
        </button>
      </div>
    </div>
  );
    }
