import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { WalletRow } from '../types/Wallet';

export default function Wallet() {
  const [wallet, setWallet] = useState<WalletRow | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchWallet = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .single();
      if (data) setWallet(data as WalletRow);
      setLoading(false);
    };
    fetchWallet();
  }, []);

  if (loading) return <div className="p-4 text-center">Loading wallet...</div>;
  if (!wallet) return <div className="p-4 text-center">No wallet found.</div>;

  return (
    <div className="p-4 bg-offwhite min-h-screen pb-20">
      <h1 className="text-2xl font-bold text-navy mb-4">Wallet</h1>

      <div className="flex gap-4 mb-4">
        <div className="bg-white p-4 rounded-2xl shadow-sm flex-1">
          <p className="text-sm text-gray-500 font-medium">FUNDS</p>
          <p className="text-2xl font-bold text-navy mt-1">
            {wallet.available_funds.toLocaleString()} XAF
          </p>
        </div>
        <div className="bg-gold p-4 rounded-2xl shadow-sm flex-1">
          <p className="text-sm text-navy font-medium">REFERRALS</p>
          <p className="text-2xl font-bold text-navy mt-1">
            {wallet.referral_earnings_available.toLocaleString()} XAF
          </p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl shadow-sm mb-3">
        <p className="text-sm text-gray-500 mb-1">Referral Pending Lock</p>
        <p className="font-bold text-navy">{wallet.referral_pending_lock.toLocaleString()} XAF</p>
        <p className="text-xs text-gray-400 mt-1">Unlocks when both you and your referee subscribe.</p>
      </div>

      <div className="bg-white p-4 rounded-2xl shadow-sm mb-4">
        <p className="text-sm text-gray-500 mb-1">Referral Received Locked</p>
        <p className="font-bold text-navy">{wallet.referral_received_locked.toLocaleString()} XAF</p>
        <p className="text-xs text-gray-400 mt-1">Waiting for one party to subscribe.</p>
      </div>

      <button
        onClick={() => navigate('/wallet/topup')}
        className="w-full bg-navy text-white font-bold py-3 rounded-xl mb-3"
      >
        Top Up
      </button>
      <button
        onClick={() => navigate('/withdraw')}
        className="w-full bg-white text-navy border border-navy font-bold py-3 rounded-xl"
      >
        Withdraw
      </button>
    </div>
  );
}