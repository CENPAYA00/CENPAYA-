import { useState } from 'react';
import { UserPlus, Check } from 'lucide-react';
import { d1Request } from '../lib/d1Api';

export default function PostFollowButton({ authorId, initialFollowing, onFollowToggle }: { authorId: string; initialFollowing: boolean; onFollowToggle?: (isFollowing: boolean) => void }) {
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    if (busy || !authorId) return;
    setBusy(true);
    const next = !following;
    try {
      await d1Request('/api/profiles/' + encodeURIComponent(authorId) + '/follow', { method: next ? 'POST' : 'DELETE' });
      setFollowing(next);
      onFollowToggle?.(next);
    } catch (error: any) { alert(error.message || 'Could not update follow'); }
    finally { setBusy(false); }
  };
  return following
    ? <button onClick={toggle} disabled={busy} className="text-[10px] font-bold text-gray-500 bg-gray-100 dark:bg-darkline px-3 py-1.5 rounded-lg flex items-center gap-1 disabled:opacity-50"><Check size={11} /> Following</button>
    : <button onClick={toggle} disabled={busy} className="text-[10px] font-bold text-accent bg-accent/10 px-3 py-1.5 rounded-lg flex items-center gap-1 disabled:opacity-50"><UserPlus size={11} /> Follow</button>;
}
