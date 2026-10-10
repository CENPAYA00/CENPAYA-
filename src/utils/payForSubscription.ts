import { supabase } from '../lib/supabase';

export type SubscriptionProvider =
  | 'cinetpay'
  | 'campay'
  | 'fapshi'
  | 'pawapay'
  | 'flutterwave'
  | 'wallet';

export async function payForSubscription(
  userId: string,
  provider: SubscriptionProvider,
  amount: number
): Promise<{ success: boolean; paymentUrl?: string; error?: string }> {
  try {
    if (provider === 'wallet') {
      const { data: wallet } = await supabase
        .from('wallets')
        .select('available_funds')
        .eq('user_id', userId)
        .single();

      if (!wallet || wallet.available_funds < amount) {
        return { success: false, error: 'Insufficient wallet balance' };
      }

      await supabase
        .from('wallets')
        .update({ available_funds: wallet.available_funds - amount })
        .eq('user_id', userId);

      await supabase.rpc('mark_user_subscribed', {
        p_user_id: userId,
        p_payment_method: 'wallet',
      });

      return { success: true };
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not logged in' };

    const { data, error } = await supabase.functions.invoke('initiate-payment', {
      body: {
        subscription: true,
        user_id: userId,
        provider: provider.toUpperCase(),
        amount: amount,
      },
    });

    if (error) return { success: false, error: error.message };
    if (!data?.payment_url) return { success: false, error: 'No payment URL returned' };

    return { success: true, paymentUrl: data.payment_url };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
