/* src/hooks/useVoiceRecorder.js */
import { useCallback, useEffect, useRef, useState } from 'react';

export function useVoiceRecorder() {
  const [state, setState] = useState('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const resolveRef = useRef(null);
  const cancelledRef = useRef(false); // ADDED

  const cleanup = useCallback(() => {
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setSeconds(0);
  }, []);

  const start = useCallback(async () => {
    // CHANGED: idempotent — mobile fires mousedown + touchstart back to back.
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      return true;
    }

    setError(null);
    cancelledRef.current = false; // ADDED

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone not supported on this device.');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mime = pickMimeType();

      const options = {
        audioBitsPerSecond: 16000,
        ...(mime ? { mimeType: mime } : {})
      };

      const rec = new MediaRecorder(stream, options);
      mediaRecorderRef.current = rec;
      chunksRef.current = [];

      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        if (!cancelledRef.current) {
          resolveRef.current?.(blob);
        } else {
          resolveRef.current?.(null); // CHANGED: cancel always resolves with null
        }
        resolveRef.current = null;
        cleanup();
        setState('idle');
      };

      // CHANGED: timeslice 1000ms so an interrupted recording still has data
      rec.start(1000);
      setState('recording');
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds(s => s + 1), 1000);
      return true;
    } catch (e) {
      setError(e?.message || 'Could not access microphone.');
      return false;
    }
  }, [cleanup]);

  const stop = useCallback(() => {
    return new Promise((resolve) => {
      const rec = mediaRecorderRef.current;
      if (!rec || rec.state === 'inactive') { resolve(null); return; }
      resolveRef.current = resolve;
      rec.stop();
    });
  }, []);

  // CHANGED: flag-based cancel — single cleanup path, no double onstop
  const cancel = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      cancelledRef.current = true;
      rec.stop(); // onstop will resolve(null) and cleanup
    } else {
      cleanup();
      setState('idle');
    }
  }, [cleanup]);

  useEffect(() => () => cleanup(), [cleanup]);

  return { state, seconds, error, start, stop, cancel };
}

function pickMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  if (typeof MediaRecorder === 'undefined') return null;
  for (const t of candidates) {
    try { if (MediaRecorder.isTypeSupported(t)) return t; } catch { /* ignore */ }
  }
  return null;
}
