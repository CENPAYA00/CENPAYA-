import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Check, X } from 'lucide-react';
import { useI18n } from '../contexts/i18n';
import DobPicker from '../components/DobPicker';

const CSS = `
.cpa{--bg:#eef2f0;--ink:#12261c;--mute:#5b6b63;--line:#e1e8e4;--g:#12935a;--gd:#0a3d2b;
min-height:100vh;background:var(--bg);color:var(--ink);font:15px/1.45 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;
padding:20px 16px;display:flex;flex-direction:column;align-items:center;box-sizing:border-box}
.cpa *{box-sizing:border-box;margin:0}
.cpa-wrap{width:100%;max-width:440px}
.cpa-lang{display:flex;justify-content:flex-end;margin-bottom:12px}
.cpa-lang select{background:#fff;border:1px solid var(--line);border-radius:22px;padding:11px 18px;font:700 14px inherit;color:var(--ink);box-shadow:0 1px 4px #0a3d2b14}
.cpa-brand{text-align:center;margin:18px 0 22px}
.cpa-brand h1{font-size:32px;letter-spacing:-.5px;color:var(--ink)}.cpa-brand p{color:var(--mute);margin-top:6px}
.cpa-card{background:#fff;border-radius:24px;padding:26px 28px;box-shadow:0 2px 12px #0a3d2b14}
.cpa-card h2{font-size:21px;margin-bottom:18px}
.cpa-f{margin-bottom:16px;flex:1;min-width:0}.cpa-f label{display:block;font-weight:500;color:#3e4f47;margin-bottom:8px;font-size:15px}
.cpa-row{display:flex;gap:14px}
.cpa-in{width:100%;padding:15px 16px;border-radius:14px;border:1.5px solid var(--line);background:#f8faf9;font:inherit;color:var(--ink);outline:none}
.cpa-in:focus{border-color:var(--g);background:#fff}.cpa-in::placeholder{color:#8a9892}
.cpa-pw{position:relative}.cpa-pw .cpa-in{padding-right:70px}
.cpa-eye{position:absolute;right:14px;top:50%;transform:translateY(-50%);background:none;border:0;color:#44544c;cursor:pointer}
.cpa-btn{width:100%;padding:16px;border:0;border-radius:14px;background:var(--g);color:#fff;font:700 16px inherit;cursor:pointer}
.cpa-btn:disabled{background:#86cbab;cursor:not-allowed}
.cpa-sw{text-align:center;margin-top:20px;padding-top:18px;border-top:1px solid var(--line);color:var(--mute)}
.cpa-sw button{background:none;border:0;font:700 15px inherit;color:#33433b;cursor:pointer}
.cpa-legal{text-align:center;color:var(--mute);font-size:14px;margin-top:18px}
.cpa-rules{list-style:none;padding:0;margin:-4px 0 16px;display:grid;gap:6px;color:var(--mute);font-size:14px}
.cpa-rules li{display:flex;align-items:center;gap:10px}
.cpa-rules i{width:20px;height:20px;border-radius:50%;border:2px solid #d3dbd7;display:grid;place-items:center;font-size:11px;color:#fff;font-style:normal}
.cpa-rules li.ok{color:var(--g)}.cpa-rules li.ok i{background:var(--g);border-color:var(--g)}
.cpa-chk{display:flex;gap:14px;align-items:flex-start;margin:4px 0 18px;color:#3e4f47}
.cpa-chk input{width:30px;height:30px;accent-color:var(--g);flex:none;margin-top:2px}.cpa-chk a{color:#3e4f47;text-decoration:underline}
.cpa-err{background:#fdecec;color:#b42318;border-radius:12px;padding:10px 12px;margin-bottom:14px;font-size:14px}
`;

export default function Signup() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [gender, setGender] = useState('');
  const [dob, setDob] = useState('');
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const navigate = useNavigate();
  const { t, lang, setLang } = useI18n();

  const passwordChecks = {
    length: password.length >= 8,
    letter: /[a-zA-Z]/.test(password),
    number: /[0-9]/.test(password),
  };
  const passwordValid = passwordChecks.length && passwordChecks.letter && passwordChecks.number;
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const calculateAge = (dobStr: string): number | null => {
    if (!dobStr) return null;
    const birth = new Date(dobStr);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!firstName || !lastName) return setErrorMsg('Please enter your first and last name.');
    if (!passwordValid) return setErrorMsg('Password does not meet requirements.');
    if (!passwordsMatch) return setErrorMsg('Passwords do not match.');
    if (!gender) return setErrorMsg('Please select your gender.');
    if (!dob) return setErrorMsg('Please select your date of birth.');

    const age = calculateAge(dob);
    if (age === null || age < 13) return setErrorMsg(t('must_be_13'));
    if (age > 120) return setErrorMsg('Please enter a valid date of birth.');
    if (!accepted) return setErrorMsg('Please accept the Terms of Service and Privacy Policy.');

    setLoading(true);
    const cleanEmail = email.trim().toLowerCase();

    const { data: existing } = await supabase.from('users').select('id').eq('email', cleanEmail).maybeSingle();

    if (existing) {
      setErrorMsg('An account with this email already exists. Please log in instead.');
      setLoading(false);
      return;
    }

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
          gender,
          date_of_birth: dob,
          country_iso: 'CM',
          preferred_lang: lang,
        },
      },
    });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    if (authData.user) {
      await supabase.from('users').update({ gender, date_of_birth: dob, preferred_lang: lang }).eq('id', authData.user.id);

      await supabase.from('user_legal_acceptances').insert({
        user_id: authData.user.id,
        document_slug: 'terms-of-service',
        version: 'v1.0',
        accepted_at: new Date().toISOString(),
      });

      await supabase.functions.invoke('send-otp', { body: { email: cleanEmail } });

      navigate(`/verify-otp?email=${encodeURIComponent(cleanEmail)}`);
    }
    setLoading(false);
  };

  return (
    <div className="cpa">
      <style>{CSS}</style>
      <div className="cpa-wrap">
        
        {/* Language Toggle (Styled like Claude's) */}
        <div className="cpa-lang">
          <div className="inline-flex bg-white rounded-full shadow-sm p-1 border border-gray-200">
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`px-4 py-1.5 text-sm font-bold rounded-full transition-colors cursor-pointer ${
                lang === 'en' ? 'bg-[#12935a] text-white' : 'text-gray-500'
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLang('fr')}
              className={`px-4 py-1.5 text-sm font-bold rounded-full transition-colors cursor-pointer ${
                lang === 'fr' ? 'bg-[#12935a] text-white' : 'text-gray-500'
              }`}
            >
              FR
            </button>
          </div>
        </div>

        <div className="cpa-brand">
          <h1>CenPaya</h1>
          <p>Buy. Sell. Grow. Africa's marketplace.</p>
        </div>

        <form onSubmit={handleSignup} className="cpa-card">
          <h2>{t('create_your_account')}</h2>

          {errorMsg && <div className="cpa-err">{errorMsg}</div>}

          <div className="cpa-row">
            <div className="cpa-f">
              <label>{t('first_name')}</label>
              <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Samuel" className="cpa-in" required />
            </div>
            <div className="cpa-f">
              <label>{t('last_name')}</label>
              <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Senviter" className="cpa-in" required />
            </div>
          </div>

          <div className="cpa-f">
            <label>{t('email_address')}</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="cpa-in" required />
          </div>

          <div className="cpa-row">
            <div className="cpa-f">
              <label>{t('gender')}</label>
              <select value={gender} onChange={e => setGender(e.target.value)} className="cpa-in" required>
                <option value="">{t('select')}</option>
                <option value="male">{t('male')}</option>
                <option value="female">{t('female')}</option>
                <option value="other">{t('other')}</option>
                <option value="prefer_not_to_say">{t('prefer_not_to_say')}</option>
              </select>
            </div>
            <div className="cpa-f">
              <label>{t('date_of_birth')}</label>
              <button type="button" onClick={() => setShowDobPicker(v => !v)} className="cpa-in text-left" style={{ color: dob ? 'var(--ink)' : 'var(--mute)' }}>
                {dob || 'DD/MM/YYYY'}
              </button>
            </div>
          </div>

          {showDobPicker && (
            <div className="mb-4">
              <DobPicker value={dob} onChange={setDob} onConfirm={() => setShowDobPicker(false)} />
            </div>
          )}

          <div className="cpa-f">
            <label>{t('password')}</label>
            <div className="cpa-pw">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="cpa-in"
                required
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="cpa-eye">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Password Rules matching Claude's UI */}
          <ul className="cpa-rules">
            <li className={passwordChecks.length ? 'ok' : ''}><i>{passwordChecks.length ? '✓' : ''}</i>{t('password_must_8')}</li>
            <li className={passwordChecks.letter ? 'ok' : ''}><i>{passwordChecks.letter ? '✓' : ''}</i>{t('password_must_letter')}</li>
            <li className={passwordChecks.number ? 'ok' : ''}><i>{passwordChecks.number ? '✓' : ''}</i>{t('password_must_number')}</li>
          </ul>

          <div className="cpa-f">
            <label>{t('confirm_password')}</label>
            <div className="cpa-pw">
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="cpa-in"
                required
              />
              {confirmPassword.length > 0 && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  {passwordsMatch ? <Check size={18} className="text-[#12935a]" /> : <X size={18} className="text-red-500" />}
                </div>
              )}
            </div>
          </div>

          <label className="cpa-chk">
            <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} />
            <span>
              {t('i_agree_to')}{' '}
              <Link to="/legal/privacy-policy">{t('privacy_policy')}</Link>{' '}
              &{' '}
              <Link to="/legal/terms-of-service">{t('terms_and_conditions')}</Link>.
            </span>
          </label>

          <button type="submit" disabled={loading || !passwordValid || !passwordsMatch || !accepted || !gender || !dob} className="cpa-btn">
            {loading ? t('creating_account') : t('create_account')}
          </button>

          <div className="cpa-sw">
            {t('already_have_account')}{' '}
            <Link to="/">{t('login')}</Link>
          </div>
        </form>

        <p className="cpa-legal">{t('by_signing_up')}</p>
      </div>
    </div>
  );
    }
