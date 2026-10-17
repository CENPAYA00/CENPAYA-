import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Check, X } from 'lucide-react';
import { useI18n } from '../contexts/i18n';
import DobPicker from '../components/DobPicker';

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

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (existing) {
      setErrorMsg('An account with this email already exists. Please log in instead.');
      setLoading(false);
      return;
    }

    const baseUsername = `${firstName.toLowerCase()}_${lastName.toLowerCase()}`
      .replace(/\s+/g, '')
      .slice(0, 24);
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
      await supabase
        .from('users')
        .update({ gender, date_of_birth: dob, preferred_lang: lang })
        .eq('id', authData.user.id);

      await supabase.from('user_legal_acceptances').insert({
        user_id: authData.user.id,
        document_slug: 'terms-of-service',
        version: 'v1.0',
        accepted_at: new Date().toISOString(),
      });

      // Trigger OTP email
      await supabase.functions.invoke('send-otp', {
        body: { email: cleanEmail }
      });

      // Redirect to verification screen
      navigate(`/verify-otp?email=${encodeURIComponent(cleanEmail)}`);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-offwhite dark:bg-darkbg flex items-start justify-center p-4 pt-6">
      <div className="w-full max-w-sm">
        <div className="flex justify-end mb-3">
          <div className="inline-flex bg-white dark:bg-darkcard rounded-full shadow-sm p-0.5 border border-gray-200 dark:border-darkline">
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-full transition-colors cursor-pointer ${
                lang === 'en' ? 'bg-accent text-white' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLang('fr')}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-full transition-colors cursor-pointer ${
                lang === 'fr' ? 'bg-accent text-white' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              FR
            </button>
          </div>
        </div>

        <div className="text-center mb-5">
          <h1 className="text-xl font-black text-navy dark:text-white">CenPaya</h1>
          <p className="text-[10px] text-gray-500 mt-1">
            Buy. Sell. Grow. Africa's marketplace.
          </p>
        </div>

        <form onSubmit={handleSignup} className="bg-white dark:bg-darkcard p-4 rounded-2xl shadow-sm">
          <h2 className="text-sm font-bold text-navy dark:text-white mb-3">{t('create_your_account')}</h2>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="block text-[10px] font-medium text-gray-600 dark:text-gray-400 mb-1">{t('first_name')}</label>
              <input
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="Samuel"
                className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-accent bg-gray-50 dark:bg-darkbg"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-600 dark:text-gray-400 mb-1">{t('last_name')}</label>
              <input
                type="text"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Senviter"
                className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-accent bg-gray-50 dark:bg-darkbg"
                required
              />
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-[10px] font-medium text-gray-600 dark:text-gray-400 mb-1">{t('email_address')}</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-accent bg-gray-50 dark:bg-darkbg"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="block text-[10px] font-medium text-gray-600 dark:text-gray-400 mb-1">{t('gender')}</label>
              <select
                value={gender}
                onChange={e => setGender(e.target.value)}
                className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-accent bg-gray-50 dark:bg-darkbg"
                required
              >
                <option value="">{t('select')}</option>
                <option value="male">{t('male')}</option>
                <option value="female">{t('female')}</option>
                <option value="other">{t('other')}</option>
                <option value="prefer_not_to_say">{t('prefer_not_to_say')}</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-600 dark:text-gray-400 mb-1">{t('date_of_birth')}</label>
              <button
                type="button"
                onClick={() => setShowDobPicker(v => !v)}
                className={`w-full p-2.5 border rounded-lg text-xs text-left cursor-pointer bg-gray-50 dark:bg-darkbg ${
                  dob ? 'text-navy dark:text-white border-gray-200 dark:border-darkline'
                      : 'text-gray-400 border-gray-200 dark:border-darkline'
                }`}
              >
                {dob || 'DD/MM/YYYY'}
              </button>
            </div>
          </div>

          {showDobPicker && (
            <div className="mb-3">
              <DobPicker
                value={dob}
                onChange={setDob}
                onConfirm={() => setShowDobPicker(false)}
              />
            </div>
          )}

          <div className="mb-3">
            <label className="block text-[10px] font-medium text-gray-600 dark:text-gray-400 mb-1">{t('password')}</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full p-2.5 pr-12 border border-gray-200 dark:border-darkline rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-accent bg-gray-50 dark:bg-darkbg"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 cursor-pointer"
              >
                {showPassword ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>

            <div className="mt-2 space-y-1">
              <PasswordCheck label={t('password_must_8')} ok={passwordChecks.length} />
              <PasswordCheck label={t('password_must_letter')} ok={passwordChecks.letter} />
              <PasswordCheck label={t('password_must_number')} ok={passwordChecks.number} />
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-[10px] font-medium text-gray-600 dark:text-gray-400 mb-1">{t('confirm_password')}</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full p-2.5 pr-10 border border-gray-200 dark:border-darkline rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-accent bg-gray-50 dark:bg-darkbg"
                required
              />
              {confirmPassword.length > 0 && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  {passwordsMatch ? <Check size={14} className="text-green-500" /> : <X size={14} className="text-red-500" />}
                </div>
              )}
            </div>
          </div>

          <label className="flex items-start gap-2 mb-3 text-[10px] text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={accepted}
              onChange={e => setAccepted(e.target.checked)}
              className="mt-0.5 accent-accent"
            />
            <span>
              {t('i_agree_to')}{' '}
              <Link to="/legal/privacy-policy" className="text-accent underline">{t('privacy_policy')}</Link>{' '}
              {'&'}{' '}
              <Link to="/legal/terms-of-service" className="text-accent underline">{t('terms_and_conditions')}</Link>.
            </span>
          </label>

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-[10px] p-2 rounded-lg mb-3">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !passwordValid || !passwordsMatch || !accepted || !gender || !dob}
            className="w-full bg-brand text-white font-bold py-2.5 rounded-lg text-xs disabled:opacity-50 active:scale-[0.98] transition-transform cursor-pointer"
          >
            {loading ? t('creating_account') : t('create_account')}
          </button>

          <div className="text-center mt-3 pt-3 border-t border-gray-100 dark:border-darkline">
            <p className="text-[10px] text-gray-500">
              {t('already_have_account')}{' '}
              <Link to="/" className="text-accent font-bold">{t('login')}</Link>
            </p>
          </div>
        </form>

        <p className="text-center text-[9px] text-gray-400 mt-3">
          {t('by_signing_up')}
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
