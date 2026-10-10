import { supabase } from '../lib/supabase';
import { RegionalMarketConfiguration } from '../types/RegionalMarketConfiguration';

export async function getMarketConfig(
  countryIso: string
): Promise<RegionalMarketConfiguration | null> {
  const { data, error } = await supabase
    .from('regional_market_configurations')
    .select('*')
    .eq('country_iso', countryIso)
    .single();

  if (error || !data) return null;
  return data as RegionalMarketConfiguration;
}

export async function isMarketOperational(countryIso: string): Promise<boolean> {
  const config = await getMarketConfig(countryIso);
  return config?.is_operational ?? false;
}
