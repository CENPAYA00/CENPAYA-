import { supabaseWorkerRequest } from '../lib/supabaseWorkerApi';

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
    const provider = method === 'wallet' ? 'wallet' : pickProvider(country, method);
    if (!provider) return { success: false, error: 'No configured payment provider supports this method in your country.' };
    const result = await supabaseWorkerRequest<{ data?: { payment_url?: string } }>('/api/v1/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ method, provider, amount, country }),
    });
    return { success: true, paymentUrl: result.data?.payment_url };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Subscription payment failed.';
    if (/subscription_payment_requires_atomic_worker_migration/i.test(message)) return { success: false, error: 'Subscription payments are temporarily unavailable until the secure atomic settlement migration is complete.' };
    return { success: false, error: message };
  }
}
