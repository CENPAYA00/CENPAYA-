import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, Check } from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: 'https://cenpaya.pages.dev/reset-password',
    });

    if (error) {
      setErrorMsg(error.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-offwhite flex items-start justify-center p-4 pt-10">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-5">
          <h1 className="text-xl font-black text-navy">CenPaya</h1>
          <p className="text-[10px] text-gray-500 mt-1">Reset your password</p>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-sm">
          {sent ? (
            // Success state
            <div className="text-center py-3">
              <div className="w-12 h-12 bg-green-100 rounded-full mx-auto flex items-center justify-center mb-3">
                <Check size={22} className="text-green-600" strokeWidth={3} />
              </div>
              <p className="text-sm font-bold text-navy mb-1">Check your email</p>
              <p className="text-[10px] text-gray-500 mb-4">
                We sent a password reset link to <strong>{email}</strong>.
                It may take up to a minute to arrive.
              </p>
              <p className="text-[10px] text-gray-400 mb-3">
                Don't see it? Check your spam folder.
              </p>
              <Link
                to="/"
                className="inline-flex items-center gap-1 text-[10px] font-bold text-accent"
              >
                <ArrowLeft size={12} /> Back to login
              </Link>
            </div>
          ) : (
            // Form state
            <>
              <p className="text-[10px] text-gray-500 mb-4">
                Enter the email you used to sign up. We will send you a link to reset your password.
              </p>

              <form onSubmit={handleSubmit}>
                <label className="block text-[10px] font-medium text-gray-600 mb-1">
                  Email Address
                </label>
                <div className="relative mb-3">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-accent bg-gray-50"
                    required
                  />
                </div>

                {errorMsg && (
                  <div className="bg-red-50 border border-red-200 text-red-600 text-[10px] p-2 rounded-lg mb-3">
                    {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-brand text-white font-bold py-2.5 rounded-lg text-xs disabled:opacity-50 active:scale-[0.98] transition-transform"
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>

              <div className="text-center mt-3 pt-3 border-t border-gray-100">
                <Link
                  to="/"
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-accent"
                >
                  <ArrowLeft size={12} /> Back to login
                </Link>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-[9px] text-gray-400 mt-3">
          CenPaya will never ask for your password by email.
        </p>
      </div>
    </div>
  );
}
