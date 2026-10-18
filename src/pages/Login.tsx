import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, Link } from 'react-router-dom';

// Claude's exact premium design CSS
const CSS = `
.cpa{--bg:#eef2f0;--ink:#12261c;--mute:#5b6b63;--line:#e1e8e4;--g:#12935a;--gd:#0a3d2b;
min-height:100vh;background:var(--bg);color:var(--ink);font:15px/1.45 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;
padding:20px 16px;display:flex;flex-direction:column;align-items:center;box-sizing:border-box}
.cpa *{box-sizing:border-box;margin:0}
.cpa-wrap{width:100%;max-width:440px}
.cpa-brand{text-align:center;margin:18px 0 22px}
.cpa-brand h1{font-size:32px;letter-spacing:-.5px;color:var(--ink)}.cpa-brand p{color:var(--mute);margin-top:6px}
.cpa-card{background:#fff;border-radius:24px;padding:26px 28px;box-shadow:0 2px 12px #0a3d2b14}
.cpa-card h2{font-size:21px;margin-bottom:18px}
.cpa-f{margin-bottom:16px;flex:1;min-width:0}.cpa-f label{display:block;font-weight:500;color:#3e4f47;margin-bottom:8px;font-size:15px}
.cpa-in{width:100%;padding:15px 16px;border-radius:14px;border:1.5px solid var(--line);background:#f8faf9;font:inherit;color:var(--ink);outline:none}
.cpa-in:focus{border-color:var(--g);background:#fff}.cpa-in::placeholder{color:#8a9892}
.cpa-pw{position:relative}.cpa-pw .cpa-in{padding-right:70px}
.cpa-eye{position:absolute;right:14px;top:50%;transform:translateY(-50%);background:none;border:0;font:700 14px inherit;color:#44544c;cursor:pointer}
.cpa-forgot{display:block;text-align:right;font-weight:700;margin:-4px 0 16px;color:var(--ink);background:none;border:0;font-size:15px;margin-left:auto;cursor:pointer}
.cpa-btn{width:100%;padding:16px;border:0;border-radius:14px;background:var(--g);color:#fff;font:700 16px inherit;cursor:pointer}
.cpa-btn:disabled{background:#86cbab;cursor:not-allowed}
.cpa-sw{text-align:center;margin-top:20px;padding-top:18px;border-top:1px solid var(--line);color:var(--mute)}
.cpa-sw button{background:none;border:0;font:700 15px inherit;color:#33433b;cursor:pointer}
.cpa-legal{text-align:center;color:var(--mute);font-size:14px;margin-top:18px}.cpa-legal a{color:var(--mute);text-decoration:underline}
.cpa-err{background:#fdecec;color:#b42318;border-radius:12px;padding:10px 12px;margin-bottom:14px;font-size:14px}
`;

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
        .select('role, onboarding_completed')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.role === 'owner' || profile?.role === 'super_admin') {
        navigate('/admin');
      } else if (profile?.role === 'support_agent') {
        navigate('/staff');
      } else if (!profile?.onboarding_completed) {
        navigate('/onboarding');
      } else {
        navigate('/home');
      }
    }
    setLoading(false);
  };

  return (
    <div className="cpa">
      <style>{CSS}</style>
      <div className="cpa-wrap">
        <div className="cpa-brand">
          <h1>CenPaya</h1>
          <p>Buy. Sell. Grow. Africa's marketplace.</p>
        </div>

        <form onSubmit={handleLogin} className="cpa-card">
          <h2>Welcome back</h2>

          {errorMsg && <div className="cpa-err">{errorMsg}</div>}

          <div className="cpa-f">
            <label>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="cpa-in"
              required
            />
          </div>

          <div className="cpa-f">
            <label>Password</label>
            <div className="cpa-pw">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
                className="cpa-in"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="cpa-eye"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <Link to="/forgot-password" className="cpa-forgot">
            Forgot password?
          </Link>

          <button
            type="submit"
            disabled={loading}
            className="cpa-btn"
          >
            {loading ? 'Logging in...' : 'Log In'}
          </button>

          <div className="cpa-sw">
            New to CenPaya?{' '}
            <Link to="/signup">Create an account</Link>
          </div>
        </form>

        <p className="cpa-legal">
          By logging in you agree to our{' '}
          <Link to="/legal/terms-of-service">Terms</Link>{' '}
          and{' '}
          <Link to="/legal/privacy-policy">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
      }
