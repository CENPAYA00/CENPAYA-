import { supabaseWorkerRequest } from '../lib/supabaseWorkerApi';

export type MobileMoneyMethod = 'mtn' | 'orange' | 'airtel' | 'moov' | 'wallet';
export type SubscriptionOption = {
  provider: 'FAPSHI' | 'CAMPAY';
  payment_method: 'MTN_MOMO' | 'ORANGE_MONEY' | 'AIRTEL_MONEY' | 'MOOV_MONEY';
  gross_amount: number;
  gateway_fee: number;
  priority: number;
};

export const METHOD_LABELS: Record<MobileMoneyMethod, string> = {
  mtn: 'MTN Mobile Money',
  orange: 'Orange Money',
  airtel: 'Airtel Money',
  moov: 'Moov Money',
  wallet: 'Pay from Wallet',
};

const PAYMENT_METHOD: Record<Exclude<MobileMoneyMethod, 'wallet'>, SubscriptionOption['payment_method']> = {
  mtn: 'MTN_MOMO',
  orange: 'ORANGE_MONEY',
  airtel: 'AIRTEL_MONEY',
  moov: 'MOOV_MONEY',
};

export async function payForSubscription(
  method: MobileMoneyMethod,
  phone: string,
  idempotencyKey: string,
): Promise<{ success: boolean; paymentUrl?: string; pending?: boolean; paymentId?: string; error?: string }> {
  try {
    if (method === 'wallet') {
      const result = await supabaseWorkerRequest<{ data: { ok?: boolean; event?: string; expires_at?: string } }>('/api/v1/subscriptions', {
        method: 'POST',
        body: JSON.stringify({ method: 'wallet', idempotency_key: idempotencyKey }),
      });
      return { success: result.data?.ok === true };
    }

    const optionsResponse = await supabaseWorkerRequest<{ data: { options: SubscriptionOption[] } }>('/api/v1/subscriptions/options');
    const paymentMethod = PAYMENT_METHOD[method];
    const option = (optionsResponse.data?.options || []).find(item => item.payment_method === paymentMethod);
    if (!option) return { success: false, error: 'This mobile money option is not currently configured for your country.' };
    if (!phone.trim()) return { success: false, error: 'Add a mobile money phone number to your profile before continuing.' };

    const result = await supabaseWorkerRequest<{ data: { payment_id: string; status: string; payment_url?: string | null } }>('/api/v1/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        method,
        provider: option.provider,
        payment_method: paymentMethod,
        phone,
        idempotency_key: idempotencyKey,
      }),
    });
    return {
      success: true,
      paymentUrl: result.data?.payment_url || undefined,
      pending: result.data?.status !== 'succeeded',
      paymentId: result.data?.payment_id,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Subscription payment failed.';
    if (/insufficient_wallet_balance|insufficient funds/i.test(message)) return { success: false, error: 'Your wallet balance is too low. Top up before subscribing.' };
    if (/idempotency_conflict/i.test(message)) return { success: false, error: 'This payment request was already submitted. Check its status before retrying.' };
    if (/payment_provider_rejected_request/i.test(message)) return { success: false, error: 'The payment provider rejected the request. Check your phone number and try again.' };
    if (/payment_initiation_uncertain_contact_support/i.test(message)) return { success: false, error: 'Payment initiation is uncertain. Check your payment status before retrying to avoid a duplicate charge.' };
    if (/subscription_payment_method_unavailable/i.test(message)) return { success: false, error: 'This mobile money option is not configured for your country.' };
    return { success: false, error: message };
  }
}
