import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, Link } from 'react-router-dom';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accepted) return alert('You must accept the Terms of Service and Privacy Policy.');
    setLoading(true);

    const { data: authData, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { username, country_iso: 'CM' } }
    });

    if (error) alert(error.message);
    else if (authData.user) {
      // Record acceptance in the database (for audit purposes)
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
    <div className="min-h-screen bg-offwhite flex items-center justify-center p-4">
      <form onSubmit={handleSignup} className="bg-white p-6 rounded-2xl shadow-sm w-full max-w-sm">
        <h1 className="text-2xl font-bold text-navy mb-6 text-center">Join CenPaya</h1>
        <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full p-3 border rounded-xl mb-4 bg-gray-50" required />
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-3 border rounded-xl mb-4 bg-gray-50" required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-3 border rounded-xl mb-4 bg-gray-50" required />

        <label className="flex items-start gap-2 mb-4 text-sm text-gray-600">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1" />
          <span>
            I agree to the <Link to="/legal/terms-of-service" className="text-gold underline">Terms of Service</Link> and <Link to="/legal/privacy-policy" className="text-gold underline">Privacy Policy</Link>.
          </span>
        </label>

        <button type="submit" disabled={loading || !accepted} className="w-full bg-navy text-white font-bold py-3 rounded-xl disabled:opacity-50">
          {loading ? 'Creating account...' : 'Sign Up'}
        </button>
        <p className="text-center text-sm text-gray-500 mt-4">Already have an account? <Link to="/" className="text-gold font-bold">Login</Link></p>
      </form>
    </div>
  );
}