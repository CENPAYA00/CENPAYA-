import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { d1Request } from '../lib/d1Api';
import { Users, Check, AlertCircle, Loader } from 'lucide-react';
import { getCachedUser } from '../lib/cache';

export default function JoinGroupByLink() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'joining' | 'joined' | 'error'>('loading');
  const [error, setError] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      const me = await getCachedUser();
      if (!me) {
        navigate(`/?redirect=${encodeURIComponent(`/groups/join/${code}`)}`);
        return;
      }

      setStatus('joining');
      const result = await d1Request<{ id: string }>('/api/groups/join', { method: 'POST', body: JSON.stringify({ invite_code: code }) });
      setGroupId(result.id);
      setStatus('joined');
      setTimeout(() => navigate(`/groups/${data.group_id}`), 1200);
    };
    run();
  }, [code]);

  return (
    <div className="min-h-screen bg-offwhite dark:bg-darkbg flex flex-col items-center justify-center px-6 text-center">
      {status === 'loading' && (
        <>
          <Loader size={32} className="text-accent animate-spin mb-3" />
          <p className="text-[12px] text-gray-500">Checking invitation...</p>
        </>
      )}
      {status === 'joining' && (
        <>
          <Users size={32} className="text-accent mb-3" />
          <p className="text-[12px] text-navy dark:text-white font-bold">Joining group...</p>
        </>
      )}
      {status === 'joined' && (
        <>
          <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center mb-3">
            <Check size={28} className="text-accent" />
          </div>
          <p className="text-[13px] font-bold text-navy dark:text-white">You joined the group</p>
          <p className="text-[10px] text-gray-500 mt-1">Redirecting...</p>
        </>
      )}
      {status === 'error' && (
        <>
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-3">
            <AlertCircle size={28} className="text-red-500" />
          </div>
          <p className="text-[13px] font-bold text-navy dark:text-white">{error}</p>
          <button onClick={() => navigate('/groups')} className="mt-4 bg-accent text-white text-[11px] font-bold px-4 py-2 rounded-lg">
            Go to My Groups
          </button>
        </>
      )}
    </div>
  );
}
