import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { UserRow } from '../types/UserProfile';

export default function Profile() {
  const [user, setUser] = useState<UserRow | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();
      if (data) setUser(data as UserRow);
      setLoading(false);
    };
    fetchUser();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  if (loading) return <div className="p-4 text-center">Loading profile...</div>;
  if (!user) return <div className="p-4 text-center">Please log in.</div>;

  return (
    <div className="p-4 bg-offwhite min-h-screen pb-20">
      {/* Profile Header */}
      <div className="bg-white p-6 rounded-2xl shadow-sm text-center mb-4">
        <div className="w-20 h-20 bg-navy rounded-full mx-auto mb-3 flex items-center justify-center text-white text-2xl font-bold">
          {user.username[0].toUpperCase()}
        </div>
        <h1 className="text-2xl font-bold text-navy">@{user.username}</h1>
        <p className="text-gray-500">{user.email}</p>
        {user.is_subscribed && (
          <span className="bg-gold text-navy text-xs font-bold px-2 py-1 rounded-full mt-2 inline-block">
            Premium Member
          </span>
        )}
        {user.moderation_state === 'suspended' && (
          <div className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full mt-2 inline-block">
            Suspended: {user.banned_reason || 'Under review'}
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white p-3 rounded-xl shadow-sm text-center">
          <p className="text-xs text-gray-500">Followers</p>
          <p className="font-bold text-navy text-lg">{user.followers_count}</p>
        </div>
        <div className="bg-white p-3 rounded-xl shadow-sm text-center">
          <p className="text-xs text-gray-500">Sales</p>
          <p className="font-bold text-navy text-lg">{user.sales_count}</p>
        </div>
        <div className="bg-white p-3 rounded-xl shadow-sm text-center">
          <p className="text-xs text-gray-500">Reputation</p>
          <p className="font-bold text-navy text-lg">{user.reputation_score}</p>
        </div>
      </div>

      {/* Role-Based Admin Access */}
      {(user.role === 'super_admin' || user.role === 'owner' || user.role === 'support_agent') && (
        <div className="bg-navy text-white p-4 rounded-2xl shadow-sm mb-4">
          <p className="font-bold mb-2">Staff Access</p>
          {user.role === 'support_agent' && (
            <button
              onClick={() => navigate('/support')}
              className="w-full bg-gold text-navy font-bold py-2 rounded-xl text-sm"
            >
              Open Support Hub
            </button>
          )}
          {(user.role === 'super_admin' || user.role === 'owner') && (
            <button
              onClick={() => navigate('/admin')}
              className="w-full bg-gold text-navy font-bold py-2 rounded-xl text-sm"
            >
              Open Admin Command Center
            </button>
          )}
        </div>
      )}

      {/* Actions */}
      <button
        onClick={() => navigate('/settings')}
        className="w-full bg-white text-navy font-bold py-3 rounded-xl mb-3 shadow-sm"
      >
        Settings
      </button>
      <button
        onClick={handleLogout}
        className="w-full bg-red-500 text-white font-bold py-3 rounded-xl shadow-sm"
      >
        Log Out
      </button>
    </div>
  );
}