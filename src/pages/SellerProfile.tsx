import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { PublicProfile } from '../types/PublicProfile';
import { UserPlus, MessageCircle, Star, ShoppingBag, Users } from 'lucide-react';

export default function SellerProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!id) return;

      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);

      // Fetch the public profile
      const { data } = await supabase
        .from('public_profiles')
        .select('*')
        .eq('id', id)
        .single();

      if (data) setProfile(data as PublicProfile);

      // Check if the current user follows this seller
      if (user?.id) {
        const { data: follow } = await supabase
          .from('user_follows')
          .select('id')
          .eq('follower_id', user.id)
          .eq('followed_id', id)
          .maybeSingle();

        setIsFollowing(!!follow);
      }

      setLoading(false);
    };
    load();
  }, [id]);

  const handleFollow = async () => {
    if (!currentUserId || !id) return;
    if (currentUserId === id) return alert("You can't follow yourself.");

    if (isFollowing) {
      await supabase.from('user_follows').delete().eq('follower_id', currentUserId).eq('followed_id', id);
      setIsFollowing(false);
      setProfile(prev => prev ? { ...prev, followers_count: prev.followers_count - 1 } : null);
    } else {
      await supabase.from('user_follows').insert({ follower_id: currentUserId, followed_id: id });
      setIsFollowing(true);
      setProfile(prev => prev ? { ...prev, followers_count: prev.followers_count + 1 } : null);
    }
  };

  if (loading) return <div className="p-4 text-center">Loading profile...</div>;
  if (!profile) return <div className="p-4 text-center">User not found.</div>;

  return (
    <div className="p-4 bg-offwhite min-h-screen pb-20">
      <button onClick={() => navigate(-1)} className="text-navy font-bold mb-4">← Back</button>

      <div className="bg-white p-6 rounded-2xl shadow-sm text-center mb-4">
        <div className="w-24 h-24 bg-navy rounded-full mx-auto mb-3 flex items-center justify-center text-white text-3xl font-bold">
          {profile.username[0].toUpperCase()}
        </div>
        <h1 className="text-2xl font-bold text-navy">@{profile.username}</h1>
        <p className="text-xs text-gray-400 mt-1">
          Member since {new Date(profile.created_at).toLocaleDateString()}
        </p>

        {/* Reputation Badge */}
        <div className="flex justify-center items-center gap-1 mt-2">
          <Star size={16} className="text-gold" />
          <span className="text-sm font-bold text-gold">Reputation: {profile.reputation_score}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white p-3 rounded-xl shadow-sm text-center">
          <Users size={16} className="mx-auto text-navy mb-1" />
          <p className="text-xs text-gray-500">Followers</p>
          <p className="font-bold text-navy">{profile.followers_count}</p>
        </div>
        <div className="bg-white p-3 rounded-xl shadow-sm text-center">
          <ShoppingBag size={16} className="mx-auto text-gold mb-1" />
          <p className="text-xs text-gray-500">Sales</p>
          <p className="font-bold text-navy">{profile.sales_count}</p>
        </div>
        <div className="bg-white p-3 rounded-xl shadow-sm text-center">
          <Star size={16} className="mx-auto text-green-500 mb-1" />
          <p className="text-xs text-gray-500">Rating</p>
          <p className="font-bold text-navy">
            {(Math.min(5, (profile.followers_count * 0.3 + profile.sales_count * 0.7) / 10)).toFixed(1)}
          </p>
        </div>
      </div>

      {/* Actions */}
      {currentUserId !== profile.id && (
        <div className="flex gap-2">
          <button
            onClick={handleFollow}
            className={`flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 ${
              isFollowing ? 'bg-gray-200 text-navy' : 'bg-navy text-white'
            }`}
          >
            <UserPlus size={18} />
            {isFollowing ? 'Following' : 'Follow'}
          </button>
          <button
            onClick={() => navigate('/chat')}
            className="flex-1 bg-gold text-navy py-3 rounded-xl font-bold flex items-center justify-center gap-2"
          >
            <MessageCircle size={18} />
            Chat
          </button>
        </div>
      )}

      {!profile.public_profile && (
        <p className="text-center text-xs text-gray-400 mt-4">
          This user has set their profile to private.
        </p>
      )}
    </div>
  );
}