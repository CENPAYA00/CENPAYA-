import { supabase } from '../lib/supabase';

export type PaymentMethodKey = 'mtn_momo' | 'orange_money' | 'airtel_money' | 'moov_money';
export type AggregatorKey = 'fapshi' | 'campay' | 'cinetpay' | 'pawapay';

/**
 * Clean display labels — the ONLY labels the user should ever see.
 * Aggregator names are never shown.
 */
export const METHOD_LABELS: Record<PaymentMethodKey, string> = {
  mtn_momo: 'MTN MoMo',
  orange_money: 'Orange Money',
  airtel_money: 'Airtel Money',
  moov_money: 'Moov Money',
};

export const METHOD_COLORS: Record<PaymentMethodKey, string> = {
  mtn_momo: 'bg-yellow-400',
  orange_money: 'bg-orange-500',
  airtel_money: 'bg-red-500',
  moov_money: 'bg-blue-500',
};

/**
 * Countries where only FAPSHI and CAMPAY are used.
 * Everywhere else in CEMAC: CINETPAY and PAWAPAY.
 */
const CAMEROON: string = 'CM';

export function aggregatorsFor(countryIso: string): AggregatorKey[] {
  if (countryIso === CAMEROON) return ['fapshi', 'campay'];
  return ['cinetpay', 'pawapay'];
}

/**
 * Given a country + chosen method, returns the aggregator to use.
 * Reads from the aggregator_routes table; falls back to the country rules above.
 */
export async function pickAggregator(
  countryIso: string,
  method: PaymentMethodKey
): Promise<AggregatorKey | null> {
  const { data, error } = await supabase
    .from('aggregator_routes')
    .select('aggregator, priority')
    .eq('country_iso', countryIso)
    .eq('payment_method', method)
    .eq('is_active', true)
    .order('priority', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    const fallback = aggregatorsFor(countryIso);
    return fallback[0] ?? null;
  }
  return data.aggregator as AggregatorKey;
}

/**
 * Fetch the clean list of methods available for a country + action.
 * No aggregator names ever appear in the returned shape.
 */
export type CleanMethod = {
  payment_method: PaymentMethodKey;
  label: string;
  color: string;
  fee_pct: number;
  fee_fixed: number;
  min_amount: number | null;
  max_amount: number | null;
};

export async function getMethodsForCountry(
  countryIso: string,
  action: 'topup' | 'withdrawal'
): Promise<CleanMethod[]> {
  const { data, error } = await supabase
    .from('payment_method_options')
    .select('*')
    .eq('country_iso', countryIso)
    .eq('action', action);

  if (error || !data) return [];

  // De-duplicate: one row per payment_method (some countries have several)
  const byMethod: Record<string, CleanMethod> = {};
  for (const row of data as any[]) {
    const key = row.payment_method as PaymentMethodKey;
    if (!METHOD_LABELS[key]) continue;
    if (!byMethod[key]) {
      byMethod[key] = {
        payment_method: key,
        label: METHOD_LABELS[key],
        color: METHOD_COLORS[key],
        fee_pct: Number(row.fee_pct ?? 0),
        fee_fixed: Number(row.fee_fixed ?? 0),
        min_amount: row.min_amount ?? null,
        max_amount: row.max_amount ?? null,
      };
    }
  }

  return Object.values(byMethod);
}

export function computeFee(method: CleanMethod, amount: number) {
  const fee = (amount * (method.fee_pct / 100)) + method.fee_fixed;
  return { fee: Math.round(fee * 100) / 100, total: Math.round((amount + fee) * 100) / 100 };
                         }
