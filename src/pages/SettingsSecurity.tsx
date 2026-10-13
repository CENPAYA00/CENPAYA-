import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock, Mail, Phone, Shield, Check, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function SettingsSecurity() {
  const navigate = useNavigate();
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdErr, setPwdErr] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.rpc('get_my_personal_details');
      if (data?.ok) setDetails(data.profile);
      setLoading(false);
    };
    load();
  }, []);

  const changePassword = async () => {
    setPwdErr('');
    setPwdMsg('');
    if (!newPassword || newPassword.length < 8) {
      return setPwdErr('Password must be at least 8 characters.');
    }
    if (newPassword !== confirmPassword) {
      return setPwdErr('Passwords do not match.');
    }
    setPwdBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPwdErr(error.message);
    } else {
      setPwdMsg('Password updated.');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPwdMsg(''), 2500);
    }
    setPwdBusy(false);
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">Password & security</h1>
      </div>

      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-4 mb-3">
        <p className="text-[11px] font-bold text-navy dark:text-white flex items-center gap-1 mb-3">
          <Lock size={13} /> Change password
        </p>
        <input
          type="password"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          placeholder="New password"
          className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-darkline bg-gray-50 dark:bg-darkbg text-[12px] mb-2"
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          placeholder="Confirm password"
          className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-darkline bg-gray-50 dark:bg-darkbg text-[12px] mb-2"
        />
        {pwdErr && <p className="text-red-600 text-[11px] mb-2">{pwdErr}</p>}
        {pwdMsg && <p className="text-green-600 text-[11px] mb-2 flex items-center gap-1"><Check size={11} /> {pwdMsg}</p>}
        <button
          onClick={changePassword}
          disabled={pwdBusy}
          className="w-full bg-accent text-white font-bold py-2.5 rounded-lg text-[12px] disabled:opacity-50"
        >
          {pwdBusy ? 'Updating...' : 'Update password'}
        </button>
      </div>

      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-4 mb-3">
        <p className="text-[11px] font-bold text-navy dark:text-white mb-3">Verification</p>

        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Mail size={14} className="text-gray-500" />
            <div>
              <p className="text-[12px] text-navy dark:text-white">{details?.email}</p>
              <p className="text-[10px] text-gray-500">
                {details?.is_email_verified ? 'Verified' : 'Not verified'}
              </p>
            </div>
          </div>
          {details?.is_email_verified ? (
            <Check size={16} className="text-green-500" />
          ) : (
            <AlertTriangle size={16} className="text-yellow-500" />
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Phone size={14} className="text-gray-500" />
            <div>
              <p className="text-[12px] text-navy dark:text-white">{details?.phone || 'No phone'}</p>
              <p className="text-[10px] text-gray-500">
                {details?.is_phone_verified ? 'Verified' : 'Not verified'}
              </p>
            </div>
          </div>
          {details?.is_phone_verified ? (
            <Check size={16} className="text-green-500" />
          ) : (
            <button
              onClick={() => navigate('/settings/verification')}
              className="text-[10px] font-bold text-accent"
            >
              Verify
            </button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-4">
        <p className="text-[11px] font-bold text-navy dark:text-white flex items-center gap-1 mb-2">
          <Shield size={13} /> Sessions
        </p>
        <button
          onClick={async () => {
            if (window.confirm('Sign out of all devices?')) {
              await supabase.auth.signOut({ scope: 'global' });
              navigate('/');
            }
          }}
          className="w-full bg-red-50 dark:bg-red-900/20 text-red-600 font-bold py-2.5 rounded-lg text-[12px]"
        >
          Sign out of all devices
        </button>
      </div>
    </div>
  );
}
