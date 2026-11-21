import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Check } from 'lucide-react';
import { d1Request, setD1SessionToken } from '../lib/d1Api';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [requested, setRequested] = useState(false);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      await d1Request('/api/auth/password/request', {
        method: 'POST',
        body: JSON.stringify({ identifier: email.trim().toLowerCase() }),
      });
      setRequested(true);
    } catch (error: any) {
      setErrorMsg(error?.message || 'Unable to request a reset code.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (code.length !== 6 || [...code].some(char => char < '0' || char > '9')) return setErrorMsg('Enter the 6-digit code from your email.');
    if (newPassword.length < 12) return setErrorMsg('Your new password must be at least 12 characters.');
    setLoading(true);
    try {
      const result = await d1Request<{ token: string }>('/api/auth/password/reset', {
        method: 'POST',
        body: JSON.stringify({
          identifier: email.trim().toLowerCase(),
          code,
          new_password: newPassword,
        }),
      });
      setD1SessionToken(result.token);
      setSent(true);
      setTimeout(() => navigate('/home', { replace: true }), 900);
    } catch (error: any) {
      setErrorMsg(error?.message || 'The reset code is invalid or expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-offwhite dark:bg-darkbg flex items-start justify-center p-4 pt-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-5">
          <h1 className="text-xl font-black text-navy dark:text-white">CenPaya</h1>
          <p className="text-[10px] text-gray-500 mt-1">Reset your password</p>
        </div>

        <div className="bg-white dark:bg-darkcard p-4 rounded-2xl shadow-sm">
          {sent ? (
            <div className="text-center py-3">
              <div className="w-12 h-12 bg-green-100 rounded-full mx-auto flex items-center justify-center mb-3">
                <Check size={22} className="text-green-600" strokeWidth={3} />
              </div>
              <p className="text-sm font-bold text-navy dark:text-white mb-1">Password updated</p>
              <p className="text-[10px] text-gray-500 mb-4">Your password has been changed. Signing you in…</p>
            </div>
          ) : !requested ? (
            <>
              <p className="text-[10px] text-gray-500 mb-4">
                Enter your account email. If the account is eligible, we will send a verification code.
              </p>
              <form onSubmit={handleRequest}>
                <label className="block text-[10px] font-medium text-gray-600 dark:text-gray-400 mb-1">Email Address</label>
                <div className="relative mb-3">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-3 py-2.5 border border-gray-200 dark:border-darkline rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-accent bg-gray-50 dark:bg-darkbg dark:text-white"
                    required
                  />
                </div>
                {errorMsg && <div className="bg-red-50 border border-red-200 text-red-600 text-[10px] p-2 rounded-lg mb-3">{errorMsg}</div>}
                <button type="submit" disabled={loading} className="w-full bg-brand text-white font-bold py-2.5 rounded-lg text-xs disabled:opacity-50">
                  {loading ? 'Sending…' : 'Send Verification Code'}
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="text-[10px] text-gray-500 mb-4">
                If your account is eligible, a 6-digit code has been sent to <strong>{email}</strong>.
              </p>
              <form onSubmit={handleReset}>
                <label className="block text-[10px] font-medium text-gray-600 dark:text-gray-400 mb-1">Verification Code</label>
                <input
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full text-center tracking-[0.4em] p-3 border border-gray-200 dark:border-darkline rounded-lg text-lg bg-gray-50 dark:bg-darkbg dark:text-white mb-3"
                  required
                />
                <label className="block text-[10px] font-medium text-gray-600 dark:text-gray-400 mb-1">New Password</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="At least 12 characters"
                  className="w-full p-3 border border-gray-200 dark:border-darkline rounded-lg text-xs bg-gray-50 dark:bg-darkbg dark:text-white mb-3"
                  required
                />
                {errorMsg && <div className="bg-red-50 border border-red-200 text-red-600 text-[10px] p-2 rounded-lg mb-3">{errorMsg}</div>}
                <button type="submit" disabled={loading} className="w-full bg-brand text-white font-bold py-2.5 rounded-lg text-xs disabled:opacity-50">
                  {loading ? 'Updating…' : 'Update Password'}
                </button>
                <button type="button" onClick={handleRequest as any} disabled={loading} className="w-full text-accent font-bold text-[10px] mt-3">
                  Send another code
                </button>
              </form>
            </>
          )}
          <div className="text-center mt-3 pt-3 border-t border-gray-100 dark:border-darkline">
            <Link to="/" className="inline-flex items-center gap-1 text-[10px] font-bold text-accent">
              <ArrowLeft size={12} /> Back to login
            </Link>
          </div>
        </div>
        <p className="text-center text-[9px] text-gray-400 mt-3">CenPaya will never ask for your password by email.</p>
      </div>
    </div>
  );
}
