import { supabase } from '../lib/supabase';
import { PaymentMethod } from '../types/PaymentMethod';

export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  const { data, error } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('is_active', true)
    .order('display_label');

  if (error || !data) return [];
  return data as PaymentMethod[];
}