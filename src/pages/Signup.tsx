import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Check, X } from 'lucide-react';

export default function Signup() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const navigate = useNavigate();

  const passwordChecks = {
    length: password.length >= 8,
    letter: /[a-zA-Z]/.test(password),
    number: /[0-9]/.test(password),
  };
  const passwordValid = passwordChecks.length && passwordChecks.letter && passwordChecks.number;
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!firstName || !lastName) return setErrorMsg('Please enter your first and last name.');
    if (!passwordValid) return setErrorMsg('Password does not meet requirements.');
    if (!passwordsMatch) return setErrorMsg('Passwords do not match.');
    if (!accepted) return setErrorMsg('Please accept the Terms of Service and Privacy Policy.');

    setLoading(true);

    const cleanEmail = email.trim().toLowerCase();

    // Check if email already exists in public.users
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (existing) {
      setErrorMsg('An account with this email already exists.');
      setLoading(false);
      return;
    }

    // Build a unique username from first + last
    const baseUsername = `${firstName.toLowerCase()}_${lastName.toLowerCase()}`.replace(/\s+/g, '').slice(0, 24);
    const suffix = Math.floor(Math.random() * 9000 + 1000).toString();
    const username = `${baseUsername}_${suffix}`.slice(0, 30);

    const { data: authData, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          username,
          first_name: firstName,
          last_name: lastName,
          country_iso: 'CM',
        },
      },
    });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    if (authData.user) {
      // Record legal acceptance
      await supabase.from('user_legal_acceptances').insert({
        user_id: authData.user.id,
        document_slug: 'terms-of-service',
        version: 'v1.0',
        accepted_at: new Date().toISOString(),
      });

      alert('Account created! Check your email to verify.');
      navigate('/');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-offwhite flex items-start justify-center p-4 pt-8">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-5">
          <h1 className="text-xl font-black text-navy">CenPaya</h1>
          <p className="text-[10px] text-gray-500 mt-1">
            Buy. Sell. Grow. Africa's marketplace.
          </p>
        </div>

        {/* Card */}
        <form onSubmit={handleSignup} className="bg-white p-4 rounded-2xl shadow-sm">
          <h2 className="text-sm font-bold text-navy mb-3">Create your account</h2>

          {/* First + Last Name */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="Samuel"
                className="w-full p-2.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-accent bg-gray-50"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Senviter"
                className="w-full p-2.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-accent bg-gray-50"
                required
              />
            </div>
          </div>

          {/* Email */}
          <div className="mb-3">
            <label className="block text-[10px] font-medium text-gray-600 mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full p-2.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-accent bg-gray-50"
              required
            />
          </div>

          {/* Password */}
          <div className="mb-3">
            <label className="block text-[10px] font-medium text-gray-600 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Create a strong password"
                className="w-full p-2.5 pr-12 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-accent bg-gray-50"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-500 flex items-center gap-1"
              >
                {showPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            {/* Live password checklist */}
            <div className="mt-2 space-y-1">
              <PasswordCheck label="Must contain 8 characters" ok={passwordChecks.length} />
              <PasswordCheck label="Must contain a letter" ok={passwordChecks.letter} />
              <PasswordCheck label="Must contain a number" ok={passwordChecks.number} />
            </div>
          </div>

          {/* Confirm Password */}
          <div className="mb-3">
            <label className="block text-[10px] font-medium text-gray-600 mb-1">Confirm Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                className="w-full p-2.5 pr-10 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-accent bg-gray-50"
                required
              />
              {confirmPassword.length > 0 && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  {passwordsMatch ? (
                    <Check size={14} className="text-green-500" />
                  ) : (
                    <X size={14} className="text-red-500" />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Terms checkbox */}
          <label className="flex items-start gap-2 mb-3 text-[10px] text-gray-600">
            <input
              type="checkbox"
              checked={accepted}
              onChange={e => setAccepted(e.target.checked)}
              className="mt-0.5 accent-accent"
            />
            <span>
              Creating a CenPaya account means you agree to our{' '}
              <Link to="/legal/privacy-policy" className="text-accent underline">
                Privacy Policy
              </Link>{' '}
              and{' '}
              <Link to="/legal/terms-of-service" className="text-accent underline">
                Terms & Conditions
              </Link>
              .
            </span>
          </label>

          {/* Error */}
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-[10px] p-2 rounded-lg mb-3">
              {errorMsg}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !passwordValid || !passwordsMatch || !accepted}
            className="w-full bg-brand text-white font-bold py-2.5 rounded-lg text-xs disabled:opacity-50 active:scale-[0.98] transition-transform"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>

          {/* Footer link */}
          <div className="text-center mt-3 pt-3 border-t border-gray-100">
            <p className="text-[10px] text-gray-500">
              Already have an account?{' '}
              <Link to="/" className="text-accent font-bold">
                Log in
              </Link>
            </p>
          </div>
        </form>

        {/* Legal footer */}
        <p className="text-center text-[9px] text-gray-400 mt-3">
          By signing up you agree to our Terms & Conditions and Privacy Policy.
        </p>
      </div>
    </div>
  );
}

function PasswordCheck({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      {ok ? (
        <div className="w-3 h-3 rounded-full bg-green-100 flex items-center justify-center">
          <Check size={8} className="text-green-600" strokeWidth={3} />
        </div>
      ) : (
        <div className="w-3 h-3 rounded-full border border-gray-300"></div>
      )}
      <span className={`text-[9px] ${ok ? 'text-green-600' : 'text-gray-400'}`}>{label}</span>
    </div>
  );
      }
