import { supabase } from '../lib/supabase';

export type MobileMoneyMethod = 'mtn' | 'orange' | 'airtel' | 'moov' | 'wallet';

export type SubscriptionProvider = 'campay' | 'fapshi' | 'cinetpay' | 'pawapay' | 'wallet';

// Method labels for UI display
export const METHOD_LABELS: Record<MobileMoneyMethod, string> = {
  mtn: 'MTN Mobile Money',
  orange: 'Orange Money',
  airtel: 'Airtel Money',
  moov: 'Moov Money',
  wallet: 'Pay from Wallet',
};

// Provider priority per country (first match wins)
const PROVIDER_PRIORITY: Record<string, SubscriptionProvider[]> = {
  CM: ['fapshi', 'campay', 'cinetpay', 'pawapay'],
  GA: ['cinetpay', 'pawapay'],
  CG: ['cinetpay', 'pawapay'],
  TD: ['cinetpay', 'pawapay'],
  CF: ['cinetpay', 'pawapay'],
  GQ: ['cinetpay', 'pawapay'],
};

// Which method each provider supports
const PROVIDER_METHODS: Record<SubscriptionProvider, MobileMoneyMethod[]> = {
  fapshi: ['mtn', 'orange'],
  campay: ['mtn', 'orange'],
  cinetpay: ['mtn', 'orange', 'airtel', 'moov'],
  pawapay: ['mtn', 'orange', 'airtel', 'moov'],
  wallet: ['wallet'],
};

/**
 * Given a country and a mobile money method, returns the best aggregator to route through.
 * Returns null if no aggregator supports that combination.
 */
export function pickProvider(country: string, method: MobileMoneyMethod): SubscriptionProvider | null {
  if (method === 'wallet') return 'wallet';

  const providers = PROVIDER_PRIORITY[country] || PROVIDER_PRIORITY.CM;
  for (const p of providers) {
    if (PROVIDER_METHODS[p].includes(method)) return p;
  }
  return null;
}

/**
 * Returns the list of mobile money methods available in a country.
 */
export function availableMethods(country: string): MobileMoneyMethod[] {
  const providers = PROVIDER_PRIORITY[country] || PROVIDER_PRIORITY.CM;
  const set = new Set<MobileMoneyMethod>();
  for (const p of providers) {
    for (const m of PROVIDER_METHODS[p]) set.add(m);
  }
  // Wallet is always available
  set.add('wallet');
  return Array.from(set);
}

export async function payForSubscription(
  userId: string,
  method: MobileMoneyMethod,
  amount: number,
  country: string = 'CM'
): Promise<{ success: boolean; paymentUrl?: string; error?: string }> {
  try {
    // Wallet payment: deduct locally
    if (method === 'wallet') {
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

    // External payment: pick aggregator
    const provider = pickProvider(country, method);
    if (!provider) {
      return { success: false, error: 'No provider supports this method in your country.' };
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not logged in' };

    const { data, error } = await supabase.functions.invoke('initiate-payment', {
      body: {
        subscription: true,
        user_id: userId,
        provider: provider.toUpperCase(),
        mobile_money_method: method.toUpperCase(),
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
