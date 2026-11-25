import { useEffect } from 'react';
import { MessageCircle } from 'lucide-react';

export interface ToastData { cid: string; title: string; text: string }

export const MessageToast = ({ toast, onOpen, onDismiss }: { toast: ToastData | null, onOpen: (cid: string) => void, onDismiss: () => void }) => {
  useEffect(() => { 
    if (!toast) return; 
    const t = setTimeout(onDismiss, 4500); 
    return () => clearTimeout(t); 
  }, [toast, onDismiss]);
  
  if (!toast) return null;

  return (
    <div 
      className="fixed top-[calc(env(safe-area-inset-top,0px)+16px)] left-4 right-4 z-[2000] max-w-[460px] mx-auto bg-white dark:bg-darkcard border border-gray-100 dark:border-darkline rounded-2xl p-3 flex items-center gap-3 shadow-[0_8px_30px_rgba(6,40,28,0.28)] animate-slide-up cursor-pointer"
      onClick={() => { onOpen(toast.cid); onDismiss(); }}
    >
      <div className="w-10 h-10 rounded-xl bg-[#12935a] text-white flex items-center justify-center shrink-0">
        <MessageCircle size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p data-no-translate className="text-[14px] font-bold text-navy dark:text-white truncate">{toast.title}</p>
        <p data-no-translate className="text-[13px] text-mute truncate">{toast.text}</p>
      </div>
    </div>
  );
};
