import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Moon, Sun, Languages, Lock, User, Eye, Tag,
  Ban, Shield, FileText, Bell, Search, ChevronRight, LogOut, Flag,
  Activity, UserX
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useI18n } from '../contexts/i18n';
import { useTheme } from '../contexts/theme';
import SoundToggle from '../components/SoundToggle';

export default function Settings() {
  const navigate = useNavigate();
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const [search, setSearch] = useState('');

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const sections = [
    {
      label: 'Your Account',
      items: [
        { icon: <User size={16} />, label: 'Personal details', sub: 'Name, phone, location, occupation', path: '/settings/personal' },
        { icon: <Lock size={16} />, label: 'Password & security', sub: 'Change password, sessions', path: '/settings/security' },
        { icon: <Shield size={16} />, label: 'Verification', sub: 'Email and phone verification', path: '/settings/verification' },
        { icon: <Activity size={16} />, label: 'Activity log', sub: 'Your recent actions', path: '/activity' },
        { icon: <UserX size={16} />, label: 'Account management', sub: 'Deactivate or delete account', path: '/settings/account' },
      ],
    },
    {
      label: 'Audience and Visibility',
      items: [
        { icon: <Lock size={16} />, label: 'Profile locking', sub: 'Public or followers only', path: '/settings/privacy' },
        { icon: <Eye size={16} />, label: 'Profile details', sub: 'Who can see your info', path: '/settings/details' },
        { icon: <Tag size={16} />, label: 'Profile and tagging', sub: 'Who can tag you', path: '/settings/tagging' },
        { icon: <Ban size={16} />, label: 'Blocking', sub: 'Manage blocked users', path: '/settings/blocking' },
      ],
    },
    {
      label: 'Support & Safety',
      items: [
        { icon: <Flag size={16} />, label: 'Report an account', sub: 'Report a user by username', path: '/settings/report' },
        { icon: <Bell size={16} />, label: 'Notifications', sub: 'Push, email, SMS', path: '/settings/notifications' },
      ],
    },
    {
      label: 'Legal & Policies',
      items: [
        { icon: <FileText size={16} />, label: 'Terms of Service', sub: null, path: '/legal/terms-of-service' },
        { icon: <FileText size={16} />, label: 'Privacy Policy', sub: null, path: '/legal/privacy-policy' },
        { icon: <Shield size={16} />, label: 'Security Policy', sub: null, path: '/legal/security-patch-policy' },
        { icon: <FileText size={16} />, label: 'Refund Policy', sub: null, path: '/legal/refund-policy' },
        { icon: <FileText size={16} />, label: 'Subscription Terms', sub: null, path: '/legal/subscription-terms' },
      ],
    },
  ];

  const filtered = sections.map(s => ({
    ...s,
    items: s.items.filter(i =>
      !search.trim() ||
      i.label.toLowerCase().includes(search.toLowerCase()) ||
      (i.sub?.toLowerCase() || '').includes(search.toLowerCase())
    ),
  })).filter(s => s.items.length > 0);

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand cursor-pointer">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-base font-bold text-navy dark:text-white">Settings & privacy</h1>
      </div>

      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search settings"
          className="w-full pl-9 pr-3 py-2.5 border border-gray-200 dark:border-darkline rounded-xl bg-white dark:bg-darkcard text-xs focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm overflow-hidden mb-3">
        <p className="px-3 pt-3 pb-2 text-[9px] uppercase tracking-widest text-gray-400 font-bold">Appearance</p>
        <div className="px-3 pb-3 flex gap-2">
          <button
            onClick={() => setTheme('light')}
            className={`flex-1 p-3 rounded-xl border-2 flex flex-col items-center gap-1 cursor-pointer ${
              theme === 'light' ? 'border-accent bg-accent/5' : 'border-gray-200 dark:border-darkline'
            }`}
          >
            <Sun size={18} className={theme === 'light' ? 'text-accent' : 'text-gray-400'} />
            <span className="text-[10px] font-bold text-navy dark:text-white">Light</span>
          </button>
          <button
            onClick={() => setTheme('dark')}
            className={`flex-1 p-3 rounded-xl border-2 flex flex-col items-center gap-1 cursor-pointer ${
              theme === 'dark' ? 'border-accent bg-accent/5' : 'border-gray-200 dark:border-darkline'
            }`}
          >
            <Moon size={18} className={theme === 'dark' ? 'text-accent' : 'text-gray-400'} />
            <span className="text-[10px] font-bold text-navy dark:text-white">Dark</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm overflow-hidden mb-3">
        <p className="px-3 pt-3 pb-2 text-[9px] uppercase tracking-widest text-gray-400 font-bold flex items-center gap-1">
          <Languages size={10} /> Language
        </p>
        <div className="px-3 pb-3 flex gap-2">
          <button
            onClick={() => setLang('en')}
            className={`flex-1 p-3 rounded-xl border-2 text-[11px] font-bold cursor-pointer ${
              lang === 'en' ? 'border-accent bg-accent/5 text-accent' : 'border-gray-200 dark:border-darkline text-navy dark:text-white'
            }`}
          >
            English
          </button>
          <button
            onClick={() => setLang('fr')}
            className={`flex-1 p-3 rounded-xl border-2 text-[11px] font-bold cursor-pointer ${
              lang === 'fr' ? 'border-accent bg-accent/5 text-accent' : 'border-gray-200 dark:border-darkline text-navy dark:text-white'
            }`}
          >
            Français
          </button>
        </div>
      </div>

      <SoundToggle />

      {filtered.map(section => (
        <div key={section.label} className="bg-white dark:bg-darkcard rounded-2xl shadow-sm overflow-hidden mb-3">
          <p className="px-3 pt-3 pb-1 text-[9px] uppercase tracking-widest text-gray-400 font-bold">
            {section.label}
          </p>
          {section.items.map((item, i) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full px-3 py-3 flex items-center gap-3 text-left cursor-pointer ${
                i > 0 ? 'border-t border-gray-100 dark:border-darkline' : ''
              }`}
            >
              <span className="text-gray-500 dark:text-gray-400 shrink-0">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-navy dark:text-white">{item.label}</p>
                {item.sub && (
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{item.sub}</p>
                )}
              </div>
              <ChevronRight size={14} className="text-gray-400 shrink-0" />
            </button>
          ))}
        </div>
      ))}

      <button
        onClick={handleLogout}
        className="w-full bg-red-50 dark:bg-red-900/20 text-red-600 font-bold py-3 rounded-xl text-[12px] flex items-center justify-center gap-2 cursor-pointer"
      >
        <LogOut size={14} /> {t('logout')}
      </button>
    </div>
  );
                          }
