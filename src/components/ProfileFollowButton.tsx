import { useState } from 'react';
import { UserPlus, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function PostFollowButton({ 
  authorId, 
  initialFollowing,
  onFollowToggle
}: { 
  authorId: string; 
  initialFollowing: boolean;
  onFollowToggle?: (isFollowing: boolean) => void;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setBusy(false); return; }
      
      if (following) {
        await supabase.from('user_follows').delete().eq('follower_id', user.id).eq('followed_id', authorId);
        setFollowing(false);
        if (onFollowToggle) onFollowToggle(false);
      } else {
        await supabase.from('user_follows').insert({ follower_id: user.id, followed_id: authorId });
        setFollowing(true);
        if (onFollowToggle) onFollowToggle(true);
      }
    } catch (e) {
      console.error(e);
    }
    setBusy(false);
  };

  if (following) {
    return (
      <button 
        onClick={toggle} 
        disabled={busy}
        className="text-[10px] font-bold text-gray-500 bg-gray-100 dark:bg-darkline px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer disabled:opacity-50"
      >
        <Check size={11} /> Following
      </button>
    );
  }

  return (
    <button 
      onClick={toggle} 
      disabled={busy}
      className="text-[10px] font-bold text-accent bg-accent/10 px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer disabled:opacity-50"
    >
      <UserPlus size={11} /> Follow
    </button>
  );
}
