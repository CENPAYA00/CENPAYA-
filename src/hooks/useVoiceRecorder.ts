/* src/hooks/useVoiceRecorder.ts */
import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderState = 'idle' | 'recording' | 'stopped';

export function useVoiceRecorder() {
  const [state, setState] = useState<RecorderState>('idle');
  const [seconds, setSeconds] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const resolveRef = useRef<((blob: Blob | null) => void) | null>(null);
  const cancelledRef = useRef<boolean>(false); // ADDED

  const cleanup = useCallback((): void => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setSeconds(0);
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      return true;
    }

    setError(null);
    cancelledRef.current = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone not supported on this device.');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mime = pickMimeType();

      const options: MediaRecorderOptions = {
        audioBitsPerSecond: 16000,
        ...(mime ? { mimeType: mime } : {}),
      };

      const rec = new MediaRecorder(stream, options);
      mediaRecorderRef.current = rec;
      chunksRef.current = [];

      rec.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        if (!cancelledRef.current) {
          resolveRef.current?.(blob);
        } else {
          resolveRef.current?.(null);
        }
        resolveRef.current = null;
        cleanup();
        setState('idle');
      };

      rec.start(1000);
      setState('recording');
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not access microphone.';
      setError(msg);
      return false;
    }
  }, [cleanup]);

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise<Blob | null>((resolve) => {
      const rec = mediaRecorderRef.current;
      if (!rec || rec.state === 'inactive') {
        resolve(null);
        return;
      }
      resolveRef.current = resolve;
      rec.stop();
    });
  }, []);

  const cancel = useCallback((): void => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      cancelledRef.current = true;
      rec.stop();
    } else {
      cleanup();
      setState('idle');
    }
  }, [cleanup]);

  useEffect(() => () => cleanup(), [cleanup]);

  return { state, seconds, error, start, stop, cancel };
}

function pickMimeType(): string | null {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  if (typeof MediaRecorder === 'undefined') return null;
  for (const t of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      /* ignore */
    }
  }
  return null;
    }
