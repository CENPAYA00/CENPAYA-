import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone } from 'lucide-react';
import { d1Me, d1Request, d1ResendOtp, d1UpdateProfile } from '../lib/d1Api';
import Select from '../components/Select';

type Country = { country_code: string; name: string; phone_prefix: string | null; status: string };

export default function SettingsVerification() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [phone, setPhone] = useState('');
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [countries, setCountries] = useState<Country[]>([]);
  const [selectedCountry, setSelectedCountry] = useState('CM');
  const [sendingSms, setSendingSms] = useState(false);

  useEffect(() => {
    Promise.all([d1Me(), d1Request<{ data: Country[] }>('/api/countries')])
      .then(([me, countryResult]) => {
        setEmail(me.user.email || '');
        setIsEmailVerified(!!me.user.email_verified);
        setPhone(me.user.phone || '');
        setIsPhoneVerified(!!me.user.phone_verified);
        const available = countryResult.data || [];
        setCountries(available);
        if (me.user.country_code) setSelectedCountry(me.user.country_code);
        else if (available.length && !available.some(c => c.country_code === 'CM')) setSelectedCountry(available[0].country_code);
      })
      .catch(() => navigate('/login', { replace: true }))
      .finally(() => setLoading(false));
  }, [navigate]);

  const handleSendCode = async () => {
    if (!phone.trim()) return alert('Enter a phone number first.');
    const prefix = countries.find(c => c.country_code === selectedCountry)?.phone_prefix || '';
    const fullPhone = phone.trim().startsWith('+') ? phone.trim() : `${prefix}${phone.trim().replace(/^0+/, '')}`;
    setSendingSms(true);
    try {
      await d1UpdateProfile({ phone: fullPhone, country_code: selectedCountry });
      const { user } = await d1Me();
      await d1ResendOtp(fullPhone, 'verify_phone');
      navigate(`/verify-otp?identifier=${encodeURIComponent(fullPhone)}&user_id=${encodeURIComponent(user.id)}&purpose=verify_phone`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not send verification code.');
    } finally { setSendingSms(false); }
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand cursor-pointer"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">Verification</h1>
      </div>
      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-4 mb-3">
        <div className="flex items-center gap-2 mb-2"><Mail size={16} className="text-gray-500" /><p className="text-[12px] font-bold text-navy dark:text-white">Email</p></div>
        <p className="text-[11px] text-gray-600 dark:text-gray-300">{email}</p>
        <p className={`text-[10px] font-bold mt-1 ${isEmailVerified ? 'text-green-500' : 'text-yellow-500'}`}>{isEmailVerified ? 'Verified' : 'Not verified'}</p>
      </div>
      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-4">
        <div className="flex items-center gap-2 mb-2"><Phone size={16} className="text-gray-500" /><p className="text-[12px] font-bold text-navy dark:text-white">Phone</p></div>
        <div className="space-y-2 mb-3">
          <Select label="Country Code" value={selectedCountry} onChange={setSelectedCountry}
            options={countries.map(c => ({ value: c.country_code, label: `${c.name} (${c.phone_prefix || ''})` }))} />
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="6XX XXX XXX"
            className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs" />
        </div>
        {!isPhoneVerified ? (
          <button onClick={handleSendCode} disabled={sendingSms || !phone.trim() || countries.length === 0}
            className="w-full bg-accent text-white font-bold py-2.5 rounded-xl text-[12px] disabled:opacity-50">
            {sendingSms ? 'Sending...' : 'Send code'}
          </button>
        ) : <div className="text-center text-green-500 text-[11px] font-bold py-2">Phone verified</div>}
      </div>
    </div>
  );
}
