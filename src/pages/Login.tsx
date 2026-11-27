import React, { useState } from 'react';
import { d1Login, d1Request } from '../lib/d1Api';
import { useNavigate, Link } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      const { user } = await d1Login(email.trim(), password);
      if (user.role === 'owner' || user.role === 'super_admin') navigate('/admin');
      else if (user.role === 'support_agent' || user.role === 'staff_member') navigate('/staff');
      else {
        let staffWorkspace = false;
        try {
          const workspace = await d1Request<{ data: { role: string } }>('/api/staff/profile');
          staffWorkspace = workspace.data?.role === 'staff_member';
        } catch { /* Ordinary members do not have a staff workspace. */ }
        if (staffWorkspace) navigate('/staff');
        else if (!user.onboarding_completed) navigate('/onboarding');
        else navigate('/home');
      }
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Unable to log in.');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-[100dvh] bg-offwhite dark:bg-darkbg flex items-start justify-center p-4 pt-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-black text-navy dark:text-white">CenPaya</h1>
          <p className="text-sm text-gray-500 mt-1">
            Buy. Sell. Grow. Africa's marketplace.
          </p>
        </div>

        <form onSubmit={handleLogin} className="bg-white dark:bg-darkcard p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-darkline">
          <h2 className="text-lg font-bold text-navy dark:text-white mb-4">Welcome back</h2>

          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Email or Phone Number</label>
            <input
              type="text"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email address or phone number"
              autoComplete="username" inputMode="email"
              className="w-full p-3 border border-gray-200 dark:border-darkline rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-gray-50 dark:bg-darkbg text-navy dark:text-white"
              required
            />
          </div>

          <div className="mb-2">
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
                className="w-full p-3 pr-16 border border-gray-200 dark:border-darkline rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-gray-50 dark:bg-darkbg text-navy dark:text-white"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-500 cursor-pointer"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div className="flex justify-end mb-5">
            <Link to="/forgot-password" className="text-xs font-bold text-accent">Forgot password?</Link>
          </div>

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm p-3 rounded-xl mb-4">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand text-white font-bold py-3.5 rounded-xl text-sm disabled:opacity-50 active:scale-[0.98] transition-transform"
          >
            {loading ? 'Logging in...' : 'Log In'}
          </button>

          <div className="text-center mt-5 pt-5 border-t border-gray-100 dark:border-darkline">
            <p className="text-sm text-gray-500">
              New to CenPaya?{' '}
              <Link to="/signup" className="text-accent font-bold">Create an account</Link>
            </p>
          </div>
        </form>

        <p className="text-center text-xs text-gray-400 mt-4 leading-relaxed">
          By logging in you agree to our{' '}
          <Link to="/legal/terms-of-service" className="underline">Terms</Link>{' '}
          and{' '}
          <Link to="/legal/privacy-policy" className="underline">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
              }
