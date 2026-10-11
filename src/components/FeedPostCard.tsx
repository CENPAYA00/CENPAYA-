import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Heart,
  MessageCircle,
  Share2,
  Globe,
  Users,
  MoreHorizontal,
  X,
} from 'lucide-react';

// ---------- Background registry ----------
// Solid + gradient backgrounds.
// `bgClass` is the Tailwind class applied to the container.
// `textClass` is the Tailwind class applied to the text.
type Background = {
  id: string;
  label: string;
  bgClass: string;
  textClass: string;
  image?: string;
};

const BACKGROUNDS: Background[] = [
  // Solids
  { id: 'default',  label: 'White',           bgClass: 'bg-white',         textClass: 'text-gray-900' },
  { id: 'pink',     label: 'Vibrant Pink',    bgClass: 'bg-[#E40046]',     textClass: 'text-white'    },
  { id: 'charcoal', label: 'Deep Black',      bgClass: 'bg-[#1C1E21]',     textClass: 'text-white'    },
  { id: 'blue',     label: 'Classic Blue',    bgClass: 'bg-[#1877F2]',     textClass: 'text-white'    },
  { id: 'maroon',   label: 'Maroon',          bgClass: 'bg-[#6B1426]',     textClass: 'text-white'    },

  // Gradients — direction encoded in the Tailwind class
  {
    id: 'purple-magenta',
    label: 'Purple to Magenta',
    bgClass: 'bg-gradient-to-br from-[#7F00FF] to-[#E100FF]', // 135°
    textClass: 'text-white',
  },
  {
    id: 'sunset',
    label: 'Sunset Pink to Yellow',
    bgClass: 'bg-gradient-to-tr from-[#FF416C] to-[#FF4B2B]', // 45°
    textClass: 'text-white',
  },
  {
    id: 'cyan-blue',
    label: 'Cyan to Blue',
    bgClass: 'bg-gradient-to-b from-[#00B4DB] to-[#0083B0]',  // 180°
    textClass: 'text-white',
  },

  // Graphical themes — image stretched across container
  {
    id: 'space-nebula',
    label: 'Space Nebula',
    bgClass: 'bg-cover bg-center',
    textClass: 'text-white',
    image: '/themes/space-nebula.jpg',
  },
  {
    id: 'aurora',
    label: 'Aurora',
    bgClass: 'bg-cover bg-center',
    textClass: 'text-white',
    image: '/themes/aurora.jpg',
  },
];

function getBackground(id: string | null | undefined): Background {
  if (!id) return BACKGROUNDS[0];
  return BACKGROUNDS.find((b) => b.id === id) || BACKGROUNDS[0];
}

function backgroundStyle(bg: Background): React.CSSProperties {
  if (!bg.image) return {};
  return {
    backgroundImage: `url(${bg.image})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };
}

// ---------- Types ----------
type Props = {
  post: {
    id: string;
    user_id: string;
    username: string;
    avatar_url?: string | null;
    content: string | null;
    image_url: string | null;
    bg_color: string | null;
    post_type: string;
    created_at: string;
    likes_count: number;
    comments_count: number;
    shares_count?: number;
  };
  currentUserId?: string | null;
  isLiked: boolean;
  onLike: (postId: string) => void;
  onComment: (postId: string) => void;
  onShare: (postId: string) => void;
};

// ---------- Main component ----------
export default function FeedPostCard({
  post,
  currentUserId,
  isLiked,
  onLike,
  onComment,
  onShare,
}: Props) {
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  // ---------- Background post rendering ----------
  if (post.post_type === 'colored' && post.bg_color && !post.image_url) {
    const bg = getBackground(post.bg_color);
    return (
      <div className="bg-white rounded-2xl shadow-sm mb-3 overflow-hidden">
        <Header
          post={post}
          onClose={() => setHidden(true)}
          onProfile={() => navigate(`/seller/${post.user_id}`)}
        />
        <div
          onClick={() => navigate(`/post/${post.id}`)}
          style={backgroundStyle(bg)}
          className={`cursor-pointer ${bg.bgClass} py-12 px-6 flex items-center justify-center min-h-[200px]`}
        >
          <p
            className={`text-lg font-bold ${bg.textClass} text-center whitespace-pre-wrap leading-relaxed max-w-md`}
          >
            {post.content}
          </p>
        </div>
        <ActionBar
          post={post}
          isLiked={isLiked}
          onLike={() => onLike(post.id)}
          onComment={() => onComment(post.id)}
          onShare={() => onShare(post.id)}
        />
      </div>
    );
  }

  // ---------- Multimedia / text post rendering ----------
  const images = post.image_url
    ? post.image_url.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  return (
    <div className="bg-white rounded-2xl shadow-sm mb-3 overflow-hidden">
      <Header
        post={post}
        onClose={() => setHidden(true)}
        onProfile={() => navigate(`/seller/${post.user_id}`)}
      />

      {post.content && (
        <p className="px-3 pb-3 text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">
          {post.content}
        </p>
      )}

      {images.length > 0 && (
        <ImageGrid
          images={images}
          onClickImage={() => navigate(`/post/${post.id}`)}
        />
      )}

      <MetricsRow
        likes={post.likes_count}
        comments={post.comments_count}
        shares={post.shares_count || 0}
      />

      <ActionBar
        post={post}
        isLiked={isLiked}
        onLike={() => onLike(post.id)}
        onComment={() => onComment(post.id)}
        onShare={() => onShare(post.id)}
      />
    </div>
  );
}

/* ---------------- Sub-components ---------------- */

function Header({
  post,
  onClose,
  onProfile,
}: {
  post: Props['post'];
  onClose: () => void;
  onProfile: () => void;
}) {
  return (
    <div className="p-3 flex items-center gap-2">
      <button
        onClick={onProfile}
        className="flex items-center gap-2 flex-1 text-left"
      >
        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700">
          {post.avatar_url ? (
            <img
              src={post.avatar_url}
              alt=""
              className="w-9 h-9 rounded-full object-cover"
            />
          ) : (
            post.username?.[0]?.toUpperCase() || 'U'
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-navy truncate">
            @{post.username}
          </p>
          <div className="flex items-center gap-1 text-[9px] text-gray-500">
            <Globe size={9} />
            <span>{new Date(post.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </button>
      <button
        onClick={onClose}
        aria-label="Hide post"
        className="w-7 h-7 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100"
      >
        <X size={14} />
      </button>
      <button
        aria-label="More options"
        className="w-7 h-7 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100"
      >
        <MoreHorizontal size={14} />
      </button>
    </div>
  );
}

function ImageGrid({
  images,
  onClickImage,
}: {
  images: string[];
  onClickImage: () => void;
}) {
  const count = images.length;
  const gridClass =
    count === 1
      ? 'grid-cols-1'
      : count === 2
      ? 'grid-cols-2'
      : count === 3
      ? 'grid-cols-3'
      : 'grid-cols-2';

  return (
    <div className={`grid gap-0.5 ${gridClass}`}>
      {images.slice(0, 4).map((src, i) => (
        <button
          key={i}
          onClick={onClickImage}
          className="relative aspect-square overflow-hidden bg-gray-100"
        >
          <img src={src} alt="" className="w-full h-full object-cover" />
          {i === 3 && count > 4 && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-lg font-bold">
              +{count - 4}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

function MetricsRow({
  likes,
  comments,
  shares,
}: {
  likes: number;
  comments: number;
  shares: number;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2 text-[10px] text-gray-500">
      <div className="flex items-center gap-3">
        {likes > 0 && <span>❤️ {likes}</span>}
        {comments > 0 && <span>💬 {comments}</span>}
      </div>
      {shares > 0 && <span>{shares} shares</span>}
    </div>
  );
}

function ActionBar({
  post,
  isLiked,
  onLike,
  onComment,
  onShare,
}: {
  post: Props['post'];
  isLiked: boolean;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
}) {
  return (
    <div className="border-t border-gray-100 grid grid-cols-3">
      <button
        onClick={onLike}
        className="flex items-center justify-center gap-1 py-2 text-[10px] font-bold text-gray-600 hover:bg-gray-50 active:scale-[0.98]"
      >
        <Heart
          size={14}
          className={isLiked ? 'fill-red-500 text-red-500' : ''}
        />
        Like
      </button>
      <button
        onClick={onComment}
        className="flex items-center justify-center gap-1 py-2 text-[10px] font-bold text-gray-600 hover:bg-gray-50 active:scale-[0.98]"
      >
        <MessageCircle size={14} /> Comment
      </button>
      <button
        onClick={onShare}
        className="flex items-center justify-center gap-1 py-2 text-[10px] font-bold text-gray-600 hover:bg-gray-50 active:scale-[0.98]"
      >
        <Share2 size={14} /> Share
      </button>
    </div>
  );
                       }
