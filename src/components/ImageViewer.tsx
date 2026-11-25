import { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

type Props = {
  images: string[];
  startIndex?: number;
  onClose: () => void;
};

export default function ImageViewer({ images, startIndex = 0, onClose }: Props) {
  const [idx, setIdx] = useState(startIndex);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIdx(i => Math.min(i + 1, images.length - 1));
      if (e.key === 'ArrowLeft')  setIdx(i => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [images.length, onClose]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) {
      if (dx < 0) setIdx(i => Math.min(i + 1, images.length - 1));
      else        setIdx(i => Math.max(i - 1, 0));
    }
    touchStartX.current = null;
  };

  if (images.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[300] bg-black flex flex-col"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between p-3 text-white">
        <button onClick={onClose} className="w-10 h-10 flex items-center justify-center">
          <X size={22} />
        </button>
        {images.length > 1 && (
          <p className="text-[12px] font-bold">{idx + 1} / {images.length}</p>
        )}
        <div className="w-10" />
      </div>

      {/* Image */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        <img
          src={images[idx]}
          alt=""
          className="max-w-full max-h-full object-contain"
        />

        {images.length > 1 && idx > 0 && (
          <button
            onClick={() => setIdx(i => i - 1)}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 rounded-full flex items-center justify-center text-white"
          >
            <ChevronLeft size={22} />
          </button>
        )}
        {images.length > 1 && idx < images.length - 1 && (
          <button
            onClick={() => setIdx(i => i + 1)}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 rounded-full flex items-center justify-center text-white"
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>

      {/* Dots */}
      {images.length > 1 && (
        <div className="flex justify-center gap-1.5 py-4">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={`w-1.5 h-1.5 rounded-full ${
                i === idx ? 'bg-white' : 'bg-white/40'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
    }
