import { useEffect, useRef, useState } from 'react';
import { d1Request } from '../lib/d1Api';
import { Play, Pause } from 'lucide-react';

export const VoiceBubble = ({ src, duration }: { src: string; duration: number }) => {
  const a = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [p, setP] = useState(0);
  const [t, setT] = useState(0);
  
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = a.current; if (!el) return;
    const r = e.currentTarget.getBoundingClientRect(); 
    el.currentTime = ((e.clientX - r.left) / r.width) * (duration || el.duration);
  };
  
  const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
  const BARS = Array.from({ length: 24 }, (_, i) => 8 + ((i * 37 + 11) % 16));

  return (
    <div className="flex items-center gap-3 min-w-[200px]">
      <button onClick={() => { const el = a.current; if (el) void (el.paused ? el.play() : el.pause()); }} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <div className="flex items-center gap-0.5 flex-1 cursor-pointer h-6" onClick={seek}>
        {BARS.map((h, i) => <i key={i} className={`block w-1 rounded-full transition-colors ${i / BARS.length < p ? 'bg-white' : 'bg-white/40'}`} style={{ height: h }} />)}
      </div>
      <small className="text-[10px] opacity-80 min-w-[30px] text-right font-medium">
        {playing || t ? fmt(t) : fmt(duration)}
      </small>
      <audio ref={a} src={src} preload="metadata"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setP(0); setT(0); }}
        onTimeUpdate={(e) => { const el = e.currentTarget; setT(el.currentTime); setP(el.currentTime / (duration || el.duration || 1)); }} />
    </div>
  );
};

export const ChatVideoBubble = ({ videoId, duration, mine, onDeleteForMe, onDeleteForEveryone }: {
  videoId: string; duration?: number; mine: boolean; onDeleteForMe: () => void; onDeleteForEveryone: () => void;
}) => {
  const [src, setSrc] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    d1Request<{ data: { url: string } }>(`/api/chat/videos/${encodeURIComponent(videoId)}/download`)
      .then(result => { if (active) setSrc(result.data.url); })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Video unavailable'); });
    return () => { active = false; };
  }, [videoId]);
  const fmt = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  return (
    <div className="w-[min(68vw,320px)] rounded-xl overflow-hidden bg-black/10" onClick={e => e.stopPropagation()}>
      {src ? <video src={src} controls playsInline preload="metadata" className="w-full max-h-64 bg-black" /> :
        <div className="p-4 text-xs text-current">{error || 'Preparing video…'}</div>}
      <div className="flex flex-wrap items-center gap-2 p-2 text-[10px]">
        <span className="opacity-70">{duration ? fmt(duration) : 'Video'}</span>
        {src && <a href={src} download="cenpaya-chat-video.mp4" target="_blank" rel="noreferrer" className="underline font-semibold">Save to phone</a>}
        <button type="button" onClick={onDeleteForMe} className="underline">Delete for me</button>
        {mine && <button type="button" onClick={onDeleteForEveryone} className="underline text-red-600">Delete for everyone</button>}
      </div>
    </div>
  );
};

export const MarketplaceVideoPlayer = ({ videoId }: { videoId: string }) => {
  const [src, setSrc] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    d1Request<{ data: { url: string } }>(`/api/video-assets/${encodeURIComponent(videoId)}/download`)
      .then(result => { if (active) setSrc(result.data.url); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Video unavailable'); });
    return () => { active = false; };
  }, [videoId]);
  return <div className="rounded-xl overflow-hidden bg-black my-2">
    {src ? <video src={src} controls playsInline preload="metadata" className="w-full max-h-[420px]" /> : <p className="p-3 text-xs text-white">{error || 'Loading video…'}</p>}
  </div>;
};

export const SharedPostCard = ({ post, onOpen }: { post: any, onOpen: () => void }) => (
  <div onClick={onOpen} className="w-56 bg-white dark:bg-darkcard rounded-xl overflow-hidden border border-gray-100 dark:border-darkline shadow-sm cursor-pointer hover:opacity-90 transition-opacity">
    <div className="flex items-center gap-2 p-2.5 bg-gray-50 dark:bg-darkline/50">
      <div className="w-6 h-6 rounded-full bg-brand/20 flex items-center justify-center text-[10px] font-bold text-brand">
        {post.avatar_url ? <img src={post.avatar_url} className="w-full h-full object-cover rounded-full" /> : post.username?.[0]?.toUpperCase()}
      </div>
      <span className="text-[12px] font-bold text-navy dark:text-white truncate">@{post.username}</span>
    </div>
    {post.image_url && (
      <img src={post.image_url.split(',')[0]} alt="" className="w-full h-32 object-cover bg-gray-100" loading="lazy" />
    )}
    <div className="p-3">
      <p className="text-[12px] text-gray-800 dark:text-gray-200 line-clamp-2">{post.content || 'Shared Post'}</p>
      <p className="text-[11px] font-bold text-brand mt-2">View Post</p>
    </div>
  </div>
);
