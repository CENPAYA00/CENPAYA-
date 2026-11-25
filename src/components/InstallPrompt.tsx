import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Don't show if user already dismissed it
    if (localStorage.getItem('cenpaya_install_dismissed') === 'true') {
      setDismissed(true);
      return;
    }

    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Also show the banner if the app is already installed
    window.addEventListener('appinstalled', () => {
      setShow(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) {
      // Fallback for browsers that don't fire the event
      alert(
        'To install CenPaya:\n\n' +
        '1. Tap the browser menu (⋮)\n' +
        '2. Tap "Install app" or "Add to Home Screen"'
      );
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShow(false);
    }
    setDeferredPrompt(null);
  };

  const dismiss = () => {
    setShow(false);
    localStorage.setItem('cenpaya_install_dismissed', 'true');
  };

  if (!show || dismissed) return null;

  return (
    <div className="bg-accent/10 border border-accent/30 p-2.5 mx-3 my-2 rounded-xl flex items-center gap-2 animate-fade-in">
      <Download size={16} className="text-accent shrink-0" />
      <div className="flex-1">
        <p className="text-[10px] font-bold text-navy">Install CenPaya</p>
        <p className="text-[9px] text-gray-600">Get the app on your home screen</p>
      </div>
      <button
        onClick={install}
        className="bg-accent text-white text-[9px] font-bold px-2.5 py-1.5 rounded-lg active:scale-95"
      >
        Install
      </button>
      <button onClick={dismiss} className="text-gray-400">
        <X size={12} />
      </button>
    </div>
  );
}
