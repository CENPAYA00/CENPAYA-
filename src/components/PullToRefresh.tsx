import { useEffect, useRef, useState, ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

export default function PullToRefresh({
  onRefresh,
  children,
}: { onRefresh: () => Promise<void> | void; children: ReactNode }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const THRESHOLD = 70;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY <= 0) startY.current = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0 && window.scrollY <= 0) {
        setPull(Math.min(dy * 0.5, 110));
      }
    };
    const onTouchEnd = async () => {
      if (pull >= THRESHOLD) {
        setRefreshing(true);
        setPull(THRESHOLD);
        try { await onRefresh(); } finally {
          setTimeout(() => { setRefreshing(false); setPull(0); startY.current = null; }, 400);
        }
      } else {
        setPull(0);
      }
      startY.current = null;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [pull, onRefresh]);

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex items-center justify-center overflow-hidden transition-all"
        style={{ height: pull }}
      >
        <RefreshCw
          size={20}
          className={`text-accent ${refreshing ? 'animate-spin' : ''}`}
          style={{ transform: refreshing ? undefined : `rotate(${pull * 3}deg)` }}
        />
      </div>
      {children}
    </div>
  );
      }
