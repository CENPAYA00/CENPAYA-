import { useRef, useState } from 'react';
import { Image as ImageIcon, Send, Mic } from 'lucide-react';

export const RichComposer = ({ onSendText, onPickImages, onVoice }: {
  onSendText: (t: string) => void;
  onPickImages: (f: File[]) => void;
  onVoice: (b: Blob, ms: number) => void;
}) => {
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [ms, setMs] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<any>();
  const t0 = useRef(0);

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      rec.current = new MediaRecorder(stream, { mimeType: mime });
      chunks.current = [];
      rec.current.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.current.start(250);
      t0.current = Date.now(); setMs(0); setRecording(true);
      timer.current = setInterval(() => setMs(Date.now() - t0.current), 200);
    } catch {
      alert('Microphone permission denied.');
    }
  };

  const stopRec = () => {
    const r = rec.current; if (!r) return;
    r.onstop = () => {
      const duration = Date.now() - t0.current;
      const blob = new Blob(chunks.current, { type: r.mimeType });
      setRecording(false); clearInterval(timer.current);
      if (duration > 700) onVoice(blob, duration);
      r.stream.getTracks().forEach(t => t.stop());
    };
    r.stop();
  };

  const submit = () => {
    const t = text.trim(); if (!t) return;
    setText(''); onSendText(t);
  };

  return (
    <div className="flex items-end gap-2 p-3 bg-white dark:bg-darkcard border-t border-gray-100 dark:border-darkline pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
      <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) onPickImages(f); e.target.value = ''; }} />
      
      {recording ? (
        <div className="flex-1 flex items-center gap-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-full px-4 py-3">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[13px] font-bold">{Math.floor(ms / 1000)}s</span>
          <button onClick={() => { rec.current?.stop(); setRecording(false); clearInterval(timer.current); }} className="ml-auto text-[12px] font-bold">Cancel</button>
        </div>
      ) : (
        <>
          <button onClick={() => file.current?.click()} className="w-10 h-10 rounded-full flex items-center justify-center text-gray-500 bg-gray-100 dark:bg-darkline shrink-0">
            <ImageIcon size={20} />
          </button>
          <textarea
            value={text} onChange={e => setText(e.target.value)} rows={1} placeholder="Type a message..."
            className="flex-1 bg-gray-50 dark:bg-darkbg rounded-full px-4 py-3 text-[14px] outline-none resize-none max-h-24 border border-gray-200 dark:border-darkline"
          />
        </>
      )}

      <button
        onClick={() => { if (text.trim()) submit(); else if (recording) stopRec(); else startRec(); }}
        className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-white shadow-sm transition-transform active:scale-95 ${recording ? 'bg-red-500' : 'bg-brand'}`}
      >
        {text.trim() ? <Send size={18} /> : recording ? <Send size={18} /> : <Mic size={18} />}
      </button>
    </div>
  );
};
