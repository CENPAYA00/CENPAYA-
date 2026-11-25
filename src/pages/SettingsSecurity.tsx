import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock, Mail, Phone, Shield, Check, AlertTriangle } from 'lucide-react';
import { d1Logout, d1Me } from '../lib/d1Api';

export default function SettingsSecurity() {
  const navigate = useNavigate();
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    d1Me().then(({ user }) => setDetails(user))
      .catch(() => navigate('/login', { replace: true }))
      .finally(() => setLoading(false));
  }, [navigate]);

  const signOutThisDevice = async () => {
    if (!window.confirm('Sign out of this device?')) return;
    await d1Logout();
    navigate('/login', { replace: true });
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">Password & security</h1>
      </div>
      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-4 mb-3">
        <p className="text-[11px] font-bold text-navy dark:text-white flex items-center gap-1 mb-2"><Lock size={13} /> Change password</p>
        <p className="text-[11px] text-gray-500 mb-3">CenPaya sends a one-time reset code to your verified email or phone. You can then choose a new password.</p>
        <button onClick={() => navigate('/forgot-password')} className="w-full bg-accent text-white font-bold py-2.5 rounded-lg text-[12px]">Request password reset code</button>
      </div>
      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-4 mb-3">
        <p className="text-[11px] font-bold text-navy dark:text-white mb-3">Verification</p>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2"><Mail size={14} className="text-gray-500" /><div>
            <p className="text-[12px] text-navy dark:text-white">{details?.email || 'No email'}</p>
            <p className="text-[10px] text-gray-500">{details?.email_verified ? 'Verified' : 'Not verified'}</p>
          </div></div>
          {details?.email_verified ? <Check size={16} className="text-green-500" /> : <AlertTriangle size={16} className="text-yellow-500" />}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><Phone size={14} className="text-gray-500" /><div>
            <p className="text-[12px] text-navy dark:text-white">{details?.phone || 'No phone'}</p>
            <p className="text-[10px] text-gray-500">{details?.phone_verified ? 'Verified' : 'Not verified'}</p>
          </div></div>
          {details?.phone_verified ? <Check size={16} className="text-green-500" /> : <button onClick={() => navigate('/settings/verification')} className="text-[10px] font-bold text-accent">Verify</button>}
        </div>
      </div>
      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-4">
        <p className="text-[11px] font-bold text-navy dark:text-white flex items-center gap-1 mb-2"><Shield size={13} /> Sessions</p>
        <p className="text-[10px] text-gray-500 mb-3">Sign out this device. Other active sessions are managed by the account security service.</p>
        <button onClick={signOutThisDevice} className="w-full bg-red-50 dark:bg-red-900/20 text-red-600 font-bold py-2.5 rounded-lg text-[12px]">Sign out this device</button>
      </div>
    </div>
  );
}
