import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, Check, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';

export default function SettingsVerification() {
  const navigate = useNavigate();
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'idle' | 'sent' | 'verified'>('idle');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.rpc('get_my_personal_details');
      if (data?.ok) {
        setDetails(data.profile);
        if (data.profile?.phone) setPhone(data.profile.phone);
        if (data.profile?.is_phone_verified) setStep('verified');
      }
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = async (isResend: boolean) => {
    setErr(''); setMsg('');
    if (!phone || phone.trim().length < 8) return setErr('Enter a valid phone number.');

    setBusy(true);
    const fn = isResend ? 'resend-otp' : 'send-otp';
    const body = isResend ? {} : { phone: phone.trim() };
    const { data, error } = await supabase.functions.invoke(fn, { body });

    if (error || !data?.ok) {
      setErr(error?.message || data?.error || 'Could not send code.');
    } else {
      setMsg(isResend ? 'New code sent.' : 'Code sent.');
      setStep('sent');
      setCooldown(60);
    }
    setBusy(false);
  };

  const verifyCode = async () => {
    setErr(''); setMsg('');
    if (!code || code.trim().length !== 6) return setErr('Enter the 6-digit code.');

    setBusy(true);
    const { data, error } = await supabase.functions.invoke('verify-otp', {
      body: { code: code.trim() },
    });
    if (error || !data?.ok) {
      setErr(error?.message || data?.error || 'Wrong code.');
    } else {
      setStep('verified');
      setMsg('Phone verified.');
    }
    setBusy(false);
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">Verification</h1>
      </div>

      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-4 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <Mail size={14} className="text-gray-500" />
          <p className="text-[12px] font-bold text-navy dark:text-white">Email</p>
        </div>
        <p className="text-[11px] text-gray-500">{details?.email}</p>
        <div className="mt-2 flex items-center gap-1">
          {details?.is_email_verified ? (
            <><Check size={13} className="text-green-500" /> <span className="text-[10px] text-green-600">Verified</span></>
          ) : (
            <><AlertCircle size={13} className="text-yellow-500" /> <span className="text-[10px] text-yellow-600">Not verified</span></>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <Phone size={14} className="text-gray-500" />
          <p className="text-[12px] font-bold text-navy dark:text-white">Phone</p>
        </div>

        {step === 'verified' ? (
          <div className="flex items-center gap-1">
            <Check size={14} className="text-green-500" />
            <span className="text-[12px] text-green-600">{phone} verified</span>
          </div>
        ) : (
          <>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+237 6XX XXX XXX"
              disabled={step === 'sent'}
              className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-darkline bg-gray-50 dark:bg-darkbg text-[12px] mb-2 disabled:opacity-60"
            />

            {step === 'sent' && (
              <input
                type="tel"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="6-digit code"
                className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-darkline bg-gray-50 dark:bg-darkbg text-[14px] font-bold tracking-widest text-center mb-2"
              />
            )}

            {err && <p className="text-red-600 text-[11px] mb-2">{err}</p>}
            {msg && <p className="text-green-600 text-[11px] mb-2">{msg}</p>}

            {step === 'idle' && (
              <button
                onClick={() => sendCode(false)}
                disabled={busy}
                className="w-full bg-accent text-white font-bold py-2.5 rounded-lg text-[12px] disabled:opacity-50"
              >
                {busy ? 'Sending...' : 'Send code'}
              </button>
            )}

            {step === 'sent' && (
              <div className="flex gap-2">
                <button
                  onClick={() => sendCode(true)}
                  disabled={cooldown > 0 || busy}
                  className="flex-1 border border-gray-200 dark:border-darkline text-navy dark:text-white font-bold py-2.5 rounded-lg text-[11px] disabled:opacity-50"
                >
                  {cooldown > 0 ? `Resend (${cooldown}s)` : 'Resend'}
                </button>
                <button
                  onClick={verifyCode}
                  disabled={busy}
                  className="flex-1 bg-accent text-white font-bold py-2.5 rounded-lg text-[11px] disabled:opacity-50"
                >
                  {busy ? 'Verifying...' : 'Verify'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
