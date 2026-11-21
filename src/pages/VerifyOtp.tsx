import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { d1ResendOtp, d1VerifyOtp, setD1Token } from '../lib/d1Api';
import { ArrowLeft, Mail, Loader2, Phone } from 'lucide-react';

export default function VerifyOtp() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const identifier = params.get('identifier') || params.get('email') || '';
  const userId = params.get('user_id') || '';
  const purpose = (params.get('purpose') || 'verify_email') as 'verify_email' | 'verify_phone';
  const isPhone = purpose === 'verify_phone';
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);

  const handleVerify = async () => {
    if (!userId) return setErrorMsg('The verification session is missing. Please sign in again and request a new code.');
    if (code.length !== 6) return setErrorMsg('Enter the 6-digit code');
    setLoading(true); setErrorMsg('');
    try {
      const { token, user } = await d1VerifyOtp(userId, code, purpose);
      setD1Token(token); setSuccess(true);
      window.setTimeout(() => navigate(user.onboarding_completed ? '/home' : '/onboarding', { replace: true }), 800);
    } catch (error) { setErrorMsg(error instanceof Error ? error.message : 'Invalid code'); }
    finally { setLoading(false); }
  };

  const handleResend = async () => {
    if (!identifier) return setErrorMsg('The contact address is missing.');
    setLoading(true); setErrorMsg('');
    try { await d1ResendOtp(identifier, purpose); alert('A new verification code has been requested.'); }
    catch (error) { setErrorMsg(error instanceof Error ? error.message : 'Resend failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-offwhite dark:bg-darkbg flex flex-col p-4 pt-10">
      <button onClick={() => navigate(-1)} className="text-navy dark:text-white mb-6 w-fit"><ArrowLeft size={20} /></button>
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-accent/15 rounded-full mx-auto flex items-center justify-center mb-4 text-accent">{isPhone ? <Phone size={28} /> : <Mail size={28} />}</div>
        <h1 className="text-xl font-black text-navy dark:text-white">Verify your {isPhone ? 'phone' : 'email'}</h1>
        <p className="text-xs text-gray-500 mt-2">We sent a 6-digit code to <br/><strong className="text-navy dark:text-white">{identifier}</strong></p>
      </div>
      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-6 mb-4">
        <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000"
          className="w-full text-center text-3xl font-black tracking-[0.5em] p-4 bg-gray-50 dark:bg-darkbg border border-gray-200 dark:border-darkline rounded-xl text-navy dark:text-white focus:outline-none focus:ring-2 focus:ring-accent" />
        {errorMsg && <p className="text-red-500 text-xs text-center mt-3">{errorMsg}</p>}
        {success && <p className="text-green-500 text-xs text-center mt-3">Verified! Redirecting...</p>}
        <button onClick={handleVerify} disabled={loading || code.length !== 6} className="w-full bg-accent text-white font-bold py-3.5 rounded-xl text-sm mt-4 disabled:opacity-50 flex justify-center">
          {loading ? <Loader2 className="animate-spin" size={18} /> : 'Verify Code'}
        </button>
        <div className="text-center mt-4"><button onClick={handleResend} disabled={loading} className="text-xs font-bold text-accent">Didn't get a code? Resend</button></div>
      </div>
    </div>
  );
}
