import { supabase } from '../lib/supabase';
import { WithdrawalMethod } from '../types/PaymentMethod';

export async function getWithdrawalMethods(
  countryIso: string
): Promise<WithdrawalMethod[]> {
  const { data, error } = await supabase
    .from('aggregator_fees')
    .select('*')
    .eq('country_iso', countryIso)
    .eq('action', 'withdrawal')
    .eq('is_active', true)
    .order('provider_name');

  if (error || !data) return [];
  return data as WithdrawalMethod[];
}