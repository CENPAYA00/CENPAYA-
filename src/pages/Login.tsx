import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
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

    const { data: { user }, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    if (user) {
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.role === 'owner' || profile?.role === 'super_admin') {
        navigate('/admin');
      } else if (profile?.role === 'support_agent') {
        navigate('/support');
      } else {
        navigate('/home');
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-offwhite flex items-start justify-center p-4 pt-10">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-5">
          <h1 className="text-xl font-black text-navy">CenPaya</h1>
          <p className="text-[10px] text-gray-500 mt-1">
            Buy. Sell. Grow. Africa's marketplace.
          </p>
        </div>

        {/* Card */}
        <form onSubmit={handleLogin} className="bg-white p-4 rounded-2xl shadow-sm">
          <h2 className="text-sm font-bold text-navy mb-3">Welcome back</h2>

          {/* Email */}
          <div className="mb-3">
            <label className="block text-[10px] font-medium text-gray-600 mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full p-2.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-accent bg-gray-50"
              required
            />
          </div>

          {/* Password */}
          <div className="mb-2">
            <label className="block text-[10px] font-medium text-gray-600 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
                className="w-full p-2.5 pr-12 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-accent bg-gray-50"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-500"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* Forgot password */}
          <div className="flex justify-end mb-3">
            <Link to="/forgot-password" className="text-[10px] font-bold text-accent">
              Forgot password?
            </Link>
          </div>

          {/* Error */}
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-[10px] p-2 rounded-lg mb-3">
              {errorMsg}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand text-white font-bold py-2.5 rounded-lg text-xs disabled:opacity-50 active:scale-[0.98] transition-transform"
          >
            {loading ? 'Logging in...' : 'Log In'}
          </button>

          {/* Signup link */}
          <div className="text-center mt-3 pt-3 border-t border-gray-100">
            <p className="text-[10px] text-gray-500">
              New to CenPaya?{' '}
              <Link to="/signup" className="text-accent font-bold">
                Create an account
              </Link>
            </p>
          </div>
        </form>

        {/* Legal footer */}
        <p className="text-center text-[9px] text-gray-400 mt-3">
          By logging in you agree to our{' '}
          <Link to="/legal/terms-of-service" className="underline">
            Terms
          </Link>{' '}
          and{' '}
          <Link to="/legal/privacy-policy" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
            }
