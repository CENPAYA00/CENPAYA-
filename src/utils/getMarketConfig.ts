import { d1Request } from '../lib/d1Api';
import { RegionalMarketConfiguration } from '../types/RegionalMarketConfiguration';

export async function getMarketConfig(countryIso: string): Promise<RegionalMarketConfiguration | null> {
  try {
    const result = await d1Request<{ data: RegionalMarketConfiguration }>(`/api/market/config?country=${encodeURIComponent(countryIso)}`);
    return result.data || null;
  } catch { return null; }
}

export async function isMarketOperational(countryIso: string): Promise<boolean> {
  const config = await getMarketConfig(countryIso);
  return config?.is_operational ?? false;
}
