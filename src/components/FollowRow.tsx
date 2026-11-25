import { useNavigate } from 'react-router-dom';
import FollowButton from './FollowButton';

type Props = {
  user: {
    id: string;
    username: string;
    avatar_url?: string | null;
    is_followed_by_me?: boolean;
    mutual_count?: number;
  };
  onFollowChanged?: (nowFollowing: boolean) => void;
  rightSlot?: React.ReactNode;
};

export default function FollowRow({ user, onFollowChanged, rightSlot }: Props) {
  const navigate = useNavigate();

  return (
    <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-2 p-3 flex items-center gap-3">
      <button onClick={() => navigate(`/seller/${user.id}`)} className="shrink-0">
        <div className="w-11 h-11 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold text-base overflow-hidden">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="w-11 h-11 object-cover" />
          ) : (
            user.username?.[0]?.toUpperCase() || 'U'
          )}
        </div>
      </button>

      <button
        onClick={() => navigate(`/seller/${user.id}`)}
        className="flex-1 min-w-0 text-left"
      >
        <p className="text-[12px] font-bold text-navy dark:text-white truncate">
          @{user.username}
        </p>
        {user.mutual_count !== undefined && user.mutual_count > 0 && (
          <p className="text-[10px] text-gray-500 truncate">
            {user.mutual_count} mutual
          </p>
        )}
      </button>

      {rightSlot ?? (
        <FollowButton
          targetId={user.id}
          initialFollowing={!!user.is_followed_by_me}
          onChanged={onFollowChanged}
          size="sm"
        />
      )}
    </div>
  );
}
