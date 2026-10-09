import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, Link } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    else navigate('/home');
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-offwhite flex items-center justify-center p-4">
      <form onSubmit={handleLogin} className="bg-white p-6 rounded-2xl shadow-sm w-full max-w-sm">
        <h1 className="text-2xl font-bold text-navy mb-6 text-center">Login to CenPaya</h1>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-3 border rounded-xl mb-4 bg-gray-50" required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-3 border rounded-xl mb-6 bg-gray-50" required />
        <button type="submit" disabled={loading} className="w-full bg-navy text-white font-bold py-3 rounded-xl">
          {loading ? 'Logging in...' : 'Login'}
        </button>
        <p className="text-center text-sm text-gray-500 mt-4">New here? <Link to="/signup" className="text-gold font-bold">Create an account</Link></p>
      </form>
    </div>
  );
}
