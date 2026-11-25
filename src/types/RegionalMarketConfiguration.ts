export interface RegionalMarketConfiguration {
  country_iso: string;
  currency_code: string;
  base_marketplace_fee_pct: number;
  premium_subscriber_fee_pct: number;
  withdrawal_fee_pct: number;
  is_operational: boolean;
  updated_at: string | null;
}