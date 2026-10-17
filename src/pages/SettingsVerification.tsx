import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';
import Select from '../components/Select';

export default function SettingsVerification() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [phone, setPhone] = useState('');
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);

  const [countries, setCountries] = useState<any[]>([]);
  const [selectedCountry, setSelectedCountry] = useState('CM');
  const [sendingSms, setSendingSms] = useState(false);

  useEffect(() => {
    const load = async () => {
      const me = await getCachedUser();
      if (!me) { setLoading(false); return; }

      const [userRes, countriesRes] = await Promise.all([
        supabase.from('users').select('email, email_verified, phone, is_phone_verified').eq('id', me.id).single(),
        supabase.from('supported_countries').select('code, name, phone_prefix').eq('is_active', true).order('code')
      ]);

      if (userRes.data) {
        setEmail(userRes.data.email || '');
        setIsEmailVerified(userRes.data.email_verified || false);
        setPhone(userRes.data.phone || '');
        setIsPhoneVerified(userRes.data.is_phone_verified || false);
      }
      setCountries(countriesRes.data || []);
      setLoading(false);
    };
    load();
  }, []);

  const handleSendCode = async () => {
    if (!phone.trim()) return alert('Enter a phone number first.');
    setSendingSms(true);
    const prefix = countries.find(c=>c.code===selectedCountry)?.phone_prefix || '+237';
    
    // Calls your existing send-otp edge function
    const { error } = await supabase.functions.invoke('send-otp', {
      body: { phone: `${prefix}${phone}` }
    });
    
    setSendingSms(false);
    if (error) alert('Failed to send code: ' + error.message);
    else alert('Verification code sent to your phone!');
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand cursor-pointer"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">Verification</h1>
      </div>

      {/* Email Section */}
      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-4 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <Mail size={16} className="text-gray-500" />
          <p className="text-[12px] font-bold text-navy dark:text-white">Email</p>
        </div>
        <p className="text-[11px] text-gray-600 dark:text-gray-300">{email}</p>
        <p className={`text-[10px] font-bold mt-1 ${isEmailVerified ? 'text-green-500' : 'text-yellow-500'}`}>
          {isEmailVerified ? 'Verified' : '⚠ Not verified'}
        </p>
      </div>

      {/* Phone Section */}
      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-4">
        <div className="flex items-center gap-2 mb-2">
          <Phone size={16} className="text-gray-500" />
          <p className="text-[12px] font-bold text-navy dark:text-white">Phone</p>
        </div>
        
        <div className="space-y-2 mb-3">
          <Select
            label="Country Code"
            value={selectedCountry}
            onChange={setSelectedCountry}
            options={countries.map(c => ({
              value: c.code,
              label: `${c.name} (${c.phone_prefix})`
            }))}
          />
          
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
            placeholder="6XX XXX XXX"
            className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
          />
        </div>

        {!isPhoneVerified ? (
          <button
            onClick={handleSendCode}
            disabled={sendingSms || !phone}
            className="w-full bg-accent text-white font-bold py-2.5 rounded-xl text-[12px] disabled:opacity-50"
          >
            {sendingSms ? 'Sending...' : 'Send code'}
          </button>
        ) : (
          <div className="text-center text-green-500 text-[11px] font-bold py-2">
            ✓ Phone verified
          </div>
        )}
      </div>
    </div>
  );
      }
