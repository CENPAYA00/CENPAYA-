import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Shield, Lock, Check, AlertCircle } from 'lucide-react';

export default function AdminSecurity() {
  const [hasPassword, setHasPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('admin_has_password');
      setHasPassword(!!data?.has_password);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setErr(''); setMsg('');
    if (newPass.length < 8) return setErr('Password must be at least 8 characters.');
    if (newPass !== confirm) return setErr('Passwords do not match.');

    setBusy(true);
    const { data, error } = await supabase.rpc('admin_set_password', {
      p_new_password: newPass,
      p_current_password: hasPassword ? current : null,
    });
    if (error || !data?.ok) {
      setErr(error?.message || data?.error || 'Could not save password.');
      setBusy(false);
      return;
    }
    setMsg(hasPassword ? 'Admin password updated.' : 'Admin password created.');
    setHasPassword(true);
    setCurrent(''); setNewPass(''); setConfirm('');
    setTimeout(() => setMsg(''), 2500);
    setBusy(false);
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Shield size={20} className="text-accent" />
        <div>
          <h2 className="text-2xl font-bold text-navy dark:text-white">Admin Access</h2>
          <p className="text-[11px] text-gray-500">Second factor required before entering /admin.</p>
        </div>
      </div>

      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3 mb-3 flex items-start gap-2">
        <AlertCircle size={14} className="text-yellow-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-[11px] font-bold text-yellow-800 dark:text-yellow-200">
            This password is separate from your login.
          </p>
          <p className="text-[10px] text-yellow-700 dark:text-yellow-300 mt-0.5">
            Even if someone gets into your account, they can't open the admin panel without this password.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-4">
        <p className="text-[12px] font-bold text-navy dark:text-white mb-3">
          {hasPassword ? 'Change admin password' : 'Create admin password'}
        </p>

        {hasPassword && (
          <div className="mb-3">
            <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">
              Current admin password
            </label>
            <input
              type="password"
              value={current}
              onChange={e => setCurrent(e.target.value)}
              placeholder="••••••••"
              className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
            />
          </div>
        )}

        <div className="mb-3">
          <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">
            New password
          </label>
          <input
            type="password"
            value={newPass}
            onChange={e => setNewPass(e.target.value)}
            placeholder="At least 8 characters"
            className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
          />
        </div>

        <div className="mb-3">
          <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">
            Confirm new password
          </label>
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Repeat password"
            className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
          />
        </div>

        {err && <p className="text-[11px] text-red-600 mb-2">{err}</p>}
        {msg && <p className="text-[11px] text-green-600 mb-2 flex items-center gap-1"><Check size={11} /> {msg}</p>}

        <button
          onClick={save}
          disabled={busy || newPass.length < 8 || newPass !== confirm}
          className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[12px] disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Lock size={13} /> {busy ? 'Saving...' : hasPassword ? 'Update password' : 'Create password'}
        </button>
      </div>
    </div>
  );
    }
