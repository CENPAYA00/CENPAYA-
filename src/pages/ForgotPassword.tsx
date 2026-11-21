import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, Check } from 'lucide-react';
import { d1RequestPasswordReset, d1ResetPassword, setD1Token } from '../lib/d1Api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault(); setErrorMsg(''); setLoading(true);
    try { await d1RequestPasswordReset(email.trim().toLowerCase()); setSent(true); }
    catch (error) { setErrorMsg(error instanceof Error ? error.message : 'Unable to request a reset code.'); }
    finally { setLoading(false); }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault(); setErrorMsg('');
    if (password.length < 12) return setErrorMsg('Use at least 12 characters for your new password.');
    if (password !== confirmPassword) return setErrorMsg('The passwords do not match.');
    setLoading(true);
    try {
      const { token } = await d1ResetPassword(email.trim().toLowerCase(), code.trim(), password);
      setD1Token(token); setComplete(true);
    } catch (error) { setErrorMsg(error instanceof Error ? error.message : 'Unable to reset password.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-offwhite flex items-start justify-center p-4 pt-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-5"><h1 className="text-xl font-black text-navy">CenPaya</h1><p className="text-[10px] text-gray-500 mt-1">Reset your password</p></div>
        <div className="bg-white p-4 rounded-2xl shadow-sm">
          {complete ? (
            <div className="text-center py-3">
              <div className="w-12 h-12 bg-green-100 rounded-full mx-auto flex items-center justify-center mb-3"><Check size={22} className="text-green-600" strokeWidth={3} /></div>
              <p className="text-sm font-bold text-navy mb-1">Password updated</p>
              <p className="text-[10px] text-gray-500 mb-4">Your password has been changed successfully.</p>
              <Link to="/home" className="inline-flex items-center gap-1 text-[10px] font-bold text-accent">Continue to CenPaya</Link>
            </div>
          ) : !sent ? (
            <>
              <p className="text-[10px] text-gray-500 mb-4">Enter your account email or phone number. We will send a password reset code to your verified contact.</p>
              <form onSubmit={handleRequest}>
                <label className="block text-[10px] font-medium text-gray-600 mb-1">Email or Phone Number</label>
                <div className="relative mb-3"><Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email or phone" className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-accent bg-gray-50" required />
                </div>
                {errorMsg && <div className="bg-red-50 border border-red-200 text-red-600 text-[10px] p-2 rounded-lg mb-3">{errorMsg}</div>}
                <button type="submit" disabled={loading} className="w-full bg-brand text-white font-bold py-2.5 rounded-lg text-xs disabled:opacity-50">{loading ? 'Sending...' : 'Send Reset Code'}</button>
              </form>
            </>
          ) : (
            <form onSubmit={handleReset}>
              <p className="text-[10px] text-gray-500 mb-4">Enter the 6-digit code sent to your verified contact and choose a new password.</p>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">Verification Code</label>
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} className="w-full p-2.5 border border-gray-200 rounded-lg text-xs mb-3" required />
              <label className="block text-[10px] font-medium text-gray-600 mb-1">New Password</label>
              <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg text-xs mb-3" required />
              <label className="block text-[10px] font-medium text-gray-600 mb-1">Confirm New Password</label>
              <input type="password" autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg text-xs mb-3" required />
              {errorMsg && <div className="bg-red-50 border border-red-200 text-red-600 text-[10px] p-2 rounded-lg mb-3">{errorMsg}</div>}
              <button type="submit" disabled={loading || code.length !== 6} className="w-full bg-brand text-white font-bold py-2.5 rounded-lg text-xs disabled:opacity-50">{loading ? 'Updating...' : 'Reset Password'}</button>
            </form>
          )}
          {!complete && <div className="text-center mt-3 pt-3 border-t border-gray-100"><Link to="/" className="inline-flex items-center gap-1 text-[10px] font-bold text-accent"><ArrowLeft size={12} /> Back to login</Link></div>}
        </div>
        <p className="text-center text-[9px] text-gray-400 mt-3">CenPaya will never ask for your password by email.</p>
      </div>
    </div>
  );
}
