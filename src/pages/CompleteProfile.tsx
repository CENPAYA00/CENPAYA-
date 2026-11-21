import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { d1Request } from '../lib/d1Api';
import { notify } from '../lib/notify';

export default function CompleteProfile() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    d1Request<{ user: any }>('/api/me').then(({ user: currentUser }) => {
      setUser(currentUser);
      setPhone(currentUser.phone || '');
      setUsername(currentUser.username || '');
    }).catch(() => navigate('/login', { replace: true }));
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    try {
      await d1Request('/api/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          phone: phone.trim(),
          onboarding_completed: true,
        }),
      });
    } catch (error) {
      notify.fromError(error);
      setLoading(false);
      return;
    }

    // 2. Send them to the Home screen
    notify.success('Profile completed! Welcome to CenPaya.');
    navigate('/home', { replace: true });
  };

  return (
    <div className="min-h-[100dvh] bg-offwhite dark:bg-darkbg flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-darkcard rounded-2xl shadow-sm p-6 border border-gray-100 dark:border-darkline">
        <h1 className="text-[22px] font-bold text-navy dark:text-white mb-2">Complete your profile</h1>
        <p className="text-[13px] text-mute mb-6">Welcome to CenPaya! Please choose a username and add your phone number to finish setting up your account.</p>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-[13px] font-bold text-gray-700 dark:text-gray-300 mb-1.5">Username</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. samuel_senvite"
              className="w-full p-3 bg-gray-50 dark:bg-darkbg border border-gray-200 dark:border-darkline rounded-xl text-[15px] outline-none focus:border-[#12935a]"
            />
          </div>

          <div className="mb-6">
            <label className="block text-[13px] font-bold text-gray-700 dark:text-gray-300 mb-1.5">Phone Number</label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+237 6XX XXX XXX"
              className="w-full p-3 bg-gray-50 dark:bg-darkbg border border-gray-200 dark:border-darkline rounded-xl text-[15px] outline-none focus:border-[#12935a]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#12935a] text-white font-bold py-3.5 rounded-xl text-[15px] disabled:opacity-50 active:scale-[0.98] transition-transform"
          >
            {loading ? 'Saving...' : 'Finish Setup'}
          </button>
        </form>
      </div>
    </div>
  );
            }
