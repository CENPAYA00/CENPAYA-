import { supabase } from '../lib/supabase';
import { AggregatorFee } from '../types/AggregatorFee';

export async function getAggregatorFee(
  providerName: string,
  countryIso: string,
  paymentMethod: string,
  action: 'topup' | 'withdrawal',
  amount: number
): Promise<{ fee: number; total: number; rule: AggregatorFee | null }> {
  const { data, error } = await supabase
    .from('aggregator_fees')
    .select('*')
    .eq('provider_name', providerName)
    .eq('country_iso', countryIso)
    .eq('payment_method', paymentMethod)
    .eq('action', action)
    .eq('is_active', true)
    .single();

  if (error || !data) return { fee: 0, total: amount, rule: null };

  const rule = data as AggregatorFee;
  const fee = (amount * (rule.fee_pct / 100)) + rule.fee_fixed;

  return {
    fee: Math.round(fee * 100) / 100,
    total: amount + fee,
    rule,
  };
}