import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from('users').select('id, username, email, role, is_subscribed, banned').limit(50);
      if (data) setUsers(data);
    };
    fetch();
  }, []);

  const changeRole = async (id: string, role: string) => {
    await supabase.rpc('admin_assign_role', { p_target_user_id: id, p_new_role: role });
    setUsers(users.map(u => u.id === id ? { ...u, role } : u));
  };

  const grantMembership = async (id: string) => {
    await supabase.rpc('admin_grant_membership', { p_target_user_id: id, p_reason: 'Super Admin Grant' });
    alert('Membership granted!');
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-navy mb-4">👥 User Management</h2>
      <input
        placeholder="Search users..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full p-3 border rounded-xl mb-4 bg-white"
      />
      {users.filter(u => u.username.includes(search)).map(u => (
        <div key={u.id} className="bg-white p-4 rounded-xl shadow-sm mb-2">
          <p className="font-bold text-navy">@{u.username}</p>
          <p className="text-xs text-gray-500 mb-2">{u.email} | Role: {u.role}</p>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => grantMembership(u.id)} className="bg-gold text-navy text-xs font-bold px-3 py-1 rounded-lg">Grant Premium</button>
            {u.role === 'user' && <button onClick={() => changeRole(u.id, 'support_agent')} className="bg-navy text-white text-xs font-bold px-3 py-1 rounded-lg">Make Agent</button>}
            {u.role !== 'user' && <button onClick={() => changeRole(u.id, 'user')} className="bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-lg">Remove Staff</button>}
          </div>
        </div>
      ))}
    </div>
  );
}
