import { useNavigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';

type Props = {
  postId: string;
  preview: {
    id: string;
    content: string | null;
    image_url: string | null;
    username: string;
    created_at: string;
  } | null;
};

export default function SharedPostCard({ postId, preview }: Props) {
  const navigate = useNavigate();

  if (!preview) {
    return (
      <button
        onClick={() => navigate(`/post/${postId}`)}
        className="text-left text-[10px] underline opacity-80"
      >
        View Post
      </button>
    );
  }

  return (
    <button
      onClick={() => navigate(`/post/${postId}`)}
      className="block text-left w-64 bg-white/10 rounded-lg overflow-hidden border border-white/20"
    >
      <div className="px-2 py-1 flex items-center gap-1 text-[9px] opacity-80">
        <span className="font-bold">@{preview.username}</span>
      </div>
      {preview.image_url && (
        <img
          src={preview.image_url.split(',')[0]}
          alt=""
          className="w-full h-28 object-cover"
        />
      )}
      {preview.content && (
        <p className="px-2 py-1.5 text-[10px] line-clamp-3 whitespace-pre-wrap">
          {preview.content.slice(0, 140)}
        </p>
      )}
      <div className="px-2 py-1 flex items-center gap-1 text-[9px] border-t border-white/20 opacity-80">
        <ExternalLink size={10} /> View Post
      </div>
    </button>
  );
}
