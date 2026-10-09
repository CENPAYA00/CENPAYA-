import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Settings() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const links = [
    { path: '/legal/terms-of-service', label: 'Terms of Service' },
    { path: '/legal/privacy-policy', label: 'Privacy Policy' },
    { path: '/legal/security-patch-policy', label: 'Security Patch Policy' },
    { path: '/legal/refund-policy', label: 'Refund Policy' },
    { path: '/legal/subscription-terms', label: 'Subscription Terms' },
  ];

  return (
    <div className="p-4 bg-offwhite min-h-screen pb-20">
      <h1 className="text-2xl font-bold text-navy mb-4">Settings</h1>
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
        <div className="p-4 border-b font-bold text-navy">Account</div>
        <div onClick={() => navigate('/profile')} className="p-4 border-b cursor-pointer flex justify-between">
          <span>My Profile</span><span className="text-gray-400">→</span>
        </div>
        <div onClick={() => navigate('/wallet')} className="p-4 cursor-pointer flex justify-between">
          <span>Wallet & Payments</span><span className="text-gray-400">→</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
        <div className="p-4 border-b font-bold text-navy">Legal & Policies</div>
        {links.map(link => (
          <div key={link.path} onClick={() => navigate(link.path)} className="p-4 border-b last:border-b-0 cursor-pointer flex justify-between">
            <span>{link.label}</span><span className="text-gray-400">→</span>
          </div>
        ))}
      </div>

      <button
        onClick={handleLogout}
        className="w-full bg-red-500 text-white font-bold py-3 rounded-xl shadow-sm"
      >
        Log Out
      </button>
    </div>
  );
}