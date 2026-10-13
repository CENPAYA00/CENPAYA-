import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Check, AlertCircle, Loader, Shield } from 'lucide-react';
import { getCachedUser } from '../lib/cache';

export default function StaffAccept() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'ready' | 'accepting' | 'accepted' | 'error'>('loading');
  const [error, setError] = useState('');
  const [role, setRole] = useState('');

  useEffect(() => {
    (async () => {
      const me = await getCachedUser();
      if (!me) {
        navigate(`/?redirect=${encodeURIComponent(`/staff/accept/${token}`)}`);
        return;
      }
      setStatus('ready');
    })();
  }, [token]);

  const accept = async () => {
    setStatus('accepting');
    setError('');
    const { data, error: err } = await supabase.rpc('accept_staff_invitation', { p_token: token });
    if (err || !data?.ok) {
      setError(err?.message || data?.error || 'Could not accept invitation.');
      setStatus('error');
      return;
    }
    setRole(data.role);
    setStatus('accepted');
    setTimeout(() => navigate('/admin'), 1600);
  };

  return (
    <div className="min-h-screen bg-offwhite dark:bg-darkbg flex flex-col items-center justify-center px-6 text-center">
      {status === 'loading' && (
        <>
          <Loader size={32} className="text-accent animate-spin mb-3" />
          <p className="text-[12px] text-gray-500">Checking invitation...</p>
        </>
      )}

      {status === 'ready' && (
        <>
          <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center mb-3">
            <Shield size={28} className="text-accent" />
          </div>
          <p className="text-[15px] font-bold text-navy dark:text-white">You've been invited</p>
          <p className="text-[11px] text-gray-500 mt-1">
            Accept to join the CenPaya team as a staff member.
          </p>
          <button
            onClick={accept}
            className="mt-5 bg-accent text-white font-bold px-6 py-3 rounded-xl text-[12px]"
          >
            Accept invitation
          </button>
        </>
      )}

      {status === 'accepting' && (
        <>
          <Loader size={32} className="text-accent animate-spin mb-3" />
          <p className="text-[12px] text-gray-500">Accepting...</p>
        </>
      )}

      {status === 'accepted' && (
        <>
          <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center mb-3">
            <Check size={28} className="text-accent" />
          </div>
          <p className="text-[14px] font-bold text-navy dark:text-white">Welcome to the team</p>
          <p className="text-[11px] text-gray-500 mt-1 capitalize">
            Your role: {role.replace('_', ' ')}
          </p>
          <p className="text-[10px] text-gray-400 mt-1">Redirecting to admin...</p>
        </>
      )}

      {status === 'error' && (
        <>
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-3">
            <AlertCircle size={28} className="text-red-500" />
          </div>
          <p className="text-[13px] font-bold text-navy dark:text-white">{error}</p>
          <button
            onClick={() => navigate('/home')}
            className="mt-4 bg-accent text-white text-[11px] font-bold px-4 py-2 rounded-lg"
          >
            Go home
          </button>
        </>
      )}
    </div>
  );
            }
