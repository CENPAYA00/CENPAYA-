import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Moon, Sun, Languages, Wallet, User, FileText, Shield } from 'lucide-react';
import { useI18n } from '../contexts/i18n';
import { useTheme } from '../contexts/theme';

export default function Settings() {
  const navigate = useNavigate();
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const links = [
    { path: '/legal/terms-of-service', label: 'Terms of Service' },
    { path: '/legal/privacy-policy', label: 'Privacy Policy' },
    { path: '/legal/security-patch-policy', label: 'Security Patch Policy' },
    { path: '/legal/refund-policy', label: 'Refund Policy' },
    { path: '/legal/subscription-terms', label: 'Subscription Terms' },
  ];

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-base font-bold text-navy dark:text-white">{t('settings')}</h1>
      </div>

      {/* Appearance */}
      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm overflow-hidden mb-3">
        <p className="px-3 pt-3 pb-2 text-[9px] uppercase tracking-widest text-gray-400 font-bold">
          {t('appearance')}
        </p>

        <div className="px-3 pb-3 flex gap-2">
          <button
            onClick={() => setTheme('light')}
            className={`flex-1 p-3 rounded-xl border-2 flex flex-col items-center gap-1 ${
              theme === 'light'
                ? 'border-accent bg-accent/5'
                : 'border-gray-200 dark:border-darkline'
            }`}
          >
            <Sun size={18} className={theme === 'light' ? 'text-accent' : 'text-gray-400'} />
            <span className="text-[10px] font-bold text-navy dark:text-white">{t('light_mode')}</span>
          </button>
          <button
            onClick={() => setTheme('dark')}
            className={`flex-1 p-3 rounded-xl border-2 flex flex-col items-center gap-1 ${
              theme === 'dark'
                ? 'border-accent bg-accent/5'
                : 'border-gray-200 dark:border-darkline'
            }`}
          >
            <Moon size={18} className={theme === 'dark' ? 'text-accent' : 'text-gray-400'} />
            <span className="text-[10px] font-bold text-navy dark:text-white">{t('dark_mode')}</span>
          </button>
        </div>
      </div>

      {/* Language */}
      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm overflow-hidden mb-3">
        <p className="px-3 pt-3 pb-2 text-[9px] uppercase tracking-widest text-gray-400 font-bold flex items-center gap-1">
          <Languages size={10} /> {t('language')}
        </p>

        <div className="px-3 pb-3 flex gap-2">
          <button
            onClick={() => setLang('en')}
            className={`flex-1 p-3 rounded-xl border-2 text-[11px] font-bold ${
              lang === 'en'
                ? 'border-accent bg-accent/5 text-accent'
                : 'border-gray-200 dark:border-darkline text-navy dark:text-white'
            }`}
          >
            English
          </button>
          <button
            onClick={() => setLang('fr')}
            className={`flex-1 p-3 rounded-xl border-2 text-[11px] font-bold ${
              lang === 'fr'
                ? 'border-accent bg-accent/5 text-accent'
                : 'border-gray-200 dark:border-darkline text-navy dark:text-white'
            }`}
          >
            Français
          </button>
        </div>
      </div>

      {/* Account */}
      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm overflow-hidden mb-3">
        <p className="px-3 pt-3 pb-2 text-[9px] uppercase tracking-widest text-gray-400 font-bold">
          Account
        </p>
        <button
          onClick={() => navigate('/profile')}
          className="w-full px-3 py-3 border-t border-gray-100 dark:border-darkline flex items-center gap-3 text-left"
        >
          <User size={15} className="text-gray-500" />
          <span className="flex-1 text-[11px] font-bold text-navy dark:text-white">My Profile</span>
          <span className="text-gray-400">→</span>
        </button>
        <button
          onClick={() => navigate('/wallet')}
          className="w-full px-3 py-3 border-t border-gray-100 dark:border-darkline flex items-center gap-3 text-left"
        >
          <Wallet size={15} className="text-gray-500" />
          <span className="flex-1 text-[11px] font-bold text-navy dark:text-white">{t('wallet')} & Payments</span>
          <span className="text-gray-400">→</span>
        </button>
        <button
          onClick={() => navigate('/saved')}
          className="w-full px-3 py-3 border-t border-gray-100 dark:border-darkline flex items-center gap-3 text-left"
        >
          <Shield size={15} className="text-gray-500" />
          <span className="flex-1 text-[11px] font-bold text-navy dark:text-white">{t('saved')}</span>
          <span className="text-gray-400">→</span>
        </button>
      </div>

      {/* Legal */}
      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm overflow-hidden mb-3">
        <p className="px-3 pt-3 pb-2 text-[9px] uppercase tracking-widest text-gray-400 font-bold">
          Legal & Policies
        </p>
        {links.map((link, i) => (
          <button
            key={link.path}
            onClick={() => navigate(link.path)}
            className={`w-full px-3 py-3 flex items-center gap-3 text-left ${
              i > 0 ? 'border-t border-gray-100 dark:border-darkline' : ''
            }`}
          >
            <FileText size={15} className="text-gray-500" />
            <span className="flex-1 text-[11px] font-bold text-navy dark:text-white">{link.label}</span>
            <span className="text-gray-400">→</span>
          </button>
        ))}
      </div>

      <button
        onClick={handleLogout}
        className="w-full bg-red-50 dark:bg-red-900/20 text-red-600 font-bold py-3 rounded-xl text-[11px]"
      >
        {t('logout')}
      </button>
    </div>
  );
      }
