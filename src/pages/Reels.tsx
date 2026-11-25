import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Play, Volume2, VolumeX, RefreshCw } from 'lucide-react';
import { d1Request, getD1ApiUrl } from '../lib/d1Api';

type Reel = {
  video_id: string;
  post_id: string;
  content?: string;
  username?: string;
  display_name?: string;
  avatar_url?: string | null;
  duration_seconds?: number | null;
  playlist_url: string;
  thumbnail_url?: string | null;
};

declare global {
  interface Window { Hls?: any; }
}

export default function Reels() {
  const [items, setItems] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(true);
  const [searchParams] = useSearchParams();
  const selectedVideo = searchParams.get('video');
  const [hlsReady, setHlsReady] = useState(false);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const hlsRefs = useRef<Record<string, any>>({});
  const trackedSeconds = useRef<Record<string, number>>({});

  useEffect(() => {
    let alive = true;
    d1Request<{ data: Reel[] }>('/api/reels?limit=20')
      .then(result => {
        if (!alive) return;
        const next = Array.isArray(result.data) ? result.data : [];
        next.sort((a, b) => a.video_id === selectedVideo ? -1 : b.video_id === selectedVideo ? 1 : 0);
        setItems(next);
      })
      .catch((e: any) => { if (alive) setError(e.message || 'Videos are temporarily unavailable.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [selectedVideo]);

  useEffect(() => {
    if (window.Hls) { setHlsReady(true); return; }
    const existing = document.querySelector<HTMLScriptElement>('script[data-cenpaya-hls]');
    if (existing) {
      existing.addEventListener('load', () => setHlsReady(true), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js';
    script.async = true;
    script.dataset.cenpayaHls = 'true';
    script.onload = () => setHlsReady(true);
    script.onerror = () => setError('The video player could not be loaded. Try opening this page again.');
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!hlsReady) return;
    for (const item of items) {
      const video = videoRefs.current[item.video_id];
      if (!video || !item.playlist_url) continue;
      const src = getD1ApiUrl(item.playlist_url);
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
      } else if (window.Hls?.isSupported()) {
        const hls = new window.Hls({ enableWorker: true, lowLatencyMode: false, maxBufferLength: 30 });
        hls.loadSource(src);
        hls.attachMedia(video);
        hlsRefs.current[item.video_id] = hls;
      }
    }
    return () => {
      Object.values(hlsRefs.current).forEach(instance => instance?.destroy?.());
      hlsRefs.current = {};
    };
  }, [items, hlsReady]);

  const track = async (item: Reel, eventType: string, watchMs = 0, completed = false) => {
    try {
      await d1Request('/api/feed/events', {
        method: 'POST',
        body: JSON.stringify({ post_id: item.post_id, event_type: eventType, watch_ms: watchMs, completed, source: 'videos' }),
      });
    } catch { /* Analytics must never interrupt playback. */ }
  };

  const onTimeUpdate = (item: Reel, currentTime: number) => {
    const previous = trackedSeconds.current[item.video_id] || 0;
    if (currentTime - previous >= 10) {
      trackedSeconds.current[item.video_id] = currentTime;
      void track(item, 'video_watch', Math.min(300000, Math.round((currentTime - previous) * 1000)));
    }
  };

  const onEnded = (item: Reel) => {
    const video = videoRefs.current[item.video_id];
    void track(item, 'video_complete', Math.min(300000, Math.round((video?.duration || 0) * 1000)), true);
  };

  return (
    <div className="min-h-[calc(100dvh-64px)] bg-[#07110d] text-white pb-20">
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-[#07110d]/95 backdrop-blur border-b border-white/10">
        <div className="flex items-center gap-2">
          <button onClick={() => window.history.back()} aria-label="Go back" className="w-9 h-9 rounded-full bg-white/10 grid place-items-center"><ArrowLeft size={18} /></button>
          <div><h1 className="text-base font-extrabold">Cenpaya Videos</h1><p className="text-[10px] text-white/60">A feed shaped by what you enjoy</p></div>
        </div>
        <button onClick={() => { setLoading(true); setError(''); d1Request<{data:Reel[]}>('/api/reels?limit=20').then(r=>setItems(r.data||[])).catch((e:any)=>setError(e.message||'Could not refresh videos')).finally(()=>setLoading(false)); }} className="w-9 h-9 rounded-full bg-white/10 grid place-items-center" aria-label="Refresh videos"><RefreshCw size={16}/></button>
      </header>

      {loading && <div className="p-6 text-center text-sm text-white/60">Loading videos…</div>}
      {!loading && error && <div className="mx-4 mt-4 p-4 rounded-2xl bg-white/10 text-sm">{error}</div>}
      {!loading && !error && items.length === 0 && <div className="p-8 text-center"><Play size={28} className="mx-auto mb-3 text-white/50"/><h2 className="font-bold">No videos yet</h2><p className="text-xs text-white/60 mt-1">Videos published by the Cenpaya community will appear here.</p></div>}

      <div className="max-w-xl mx-auto">
        {items.map(item => (
          <article key={item.video_id} className="relative min-h-[72dvh] border-b border-white/10 flex flex-col justify-center bg-black">
            <video
              ref={node => { videoRefs.current[item.video_id] = node; }}
              className="w-full max-h-[78dvh] object-contain bg-black"
              controls
              playsInline
              preload="metadata"
              muted={muted}
              poster={item.thumbnail_url || undefined}
              onTimeUpdate={event => onTimeUpdate(item, event.currentTarget.currentTime)}
              onEnded={() => onEnded(item)}
              onPlay={() => { void track(item, 'impression'); }}
              onPause={() => { const video = videoRefs.current[item.video_id]; if (video && video.currentTime > 0) void track(item, 'video_watch', Math.min(300000, Math.round(video.currentTime * 1000))); }}
            />
            <div className="px-4 py-3 bg-gradient-to-t from-black to-transparent">
              <p className="font-bold text-sm">@{item.username || item.display_name || 'Cenpaya creator'}</p>
              {item.content && <p className="text-sm text-white/85 mt-1 whitespace-pre-wrap">{item.content}</p>}
            </div>
            <button onClick={() => setMuted(v => !v)} className="absolute right-4 top-4 w-10 h-10 rounded-full bg-black/60 grid place-items-center" aria-label={muted ? 'Unmute videos' : 'Mute videos'}>
              {muted ? <VolumeX size={18}/> : <Volume2 size={18}/>}
            </button>
          </article>
        ))}
      </div>
      <p className="text-center text-[10px] text-white/40 py-4">Playback and recommendations improve as you watch, save and interact.</p>
    </div>
  );
}
