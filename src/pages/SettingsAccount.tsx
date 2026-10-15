import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, UserX, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';
import { useI18n } from '../contexts/i18n';

export default function SettingsAccount() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  const deactivate = async () => {
    if (!window.confirm('Deactivate your account? Your profile will be hidden until you log in again.')) return;
    setBusy(true);
    const me = await getCachedUser();
    if (!me) { setBusy(false); return; }
    const { error } = await supabase.from('users').update({ is_deactivated: true }).eq('id', me.id);
    setBusy(false);
    if (error) { alert(error.message); return; }
    await supabase.auth.signOut();
    navigate('/');
  };

  const deleteAccount = async () => {
    const sure = window.prompt(
      'This will permanently delete your account. Type DELETE to confirm.'
    );
    if (sure !== 'DELETE') return;
    setBusy(true);
    const me = await getCachedUser();
    if (!me) { setBusy(false); return; }
    const { error } = await supabase.rpc('delete_my_account');
    setBusy(false);
    if (error) { alert(error.message); return; }
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand cursor-pointer"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">Account management</h1>
      </div>

      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-3 mb-3">
        <button
          onClick={deactivate}
          disabled={busy}
          className="w-full text-left p-3 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 font-bold text-[12px] flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <UserX size={14} /> Deactivate account
        </button>
        <p className="text-[10px] text-gray-500 mt-1 px-3">
          Temporarily hide your profile. Log in again to reactivate.
        </p>
      </div>

      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-3">
        <button
          onClick={deleteAccount}
          disabled={busy}
          className="w-full text-left p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 font-bold text-[12px] flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <Trash2 size={14} /> Delete account permanently
        </button>
        <p className="text-[10px] text-gray-500 mt-1 px-3">
          This action is irreversible. All your data will be permanently removed.
        </p>
      </div>
    </div>
  );
      }
