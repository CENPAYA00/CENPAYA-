import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import FollowRow from '../components/FollowRow';

export default function ProfileFollowers() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!id) { setLoading(false); return; }
      const { data } = await supabase.rpc('get_followers', { p_user_id: id, p_limit: 200 });
      setUsers(Array.isArray(data) ? data : []);
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">Followers</h1>
        <span className="text-[10px] text-gray-400 ml-auto">{users.length}</span>
      </div>

      {users.length === 0 && (
        <p className="text-center text-[10px] text-gray-400 py-6">No followers yet</p>
      )}

      {users.map(u => <FollowRow key={u.id} user={u} />)}
    </div>
  );
}
