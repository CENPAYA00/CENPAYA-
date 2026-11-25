export type ProfileTheme = "light" | "dark" | "system";
export type AllowDmFrom = "everyone" | "subscribers_only" | "nobody";
export type TwoFactorMethod = "sms" | "email" | "totp";

export interface UserPreferences {
  user_id: string;
  language_code: string;
  timezone: string;
  theme: ProfileTheme;
  currency_display: string;
  notify_email: boolean;
  notify_sms: boolean;
  notify_push: boolean;
  notify_marketing: boolean;
  notify_order_updates: boolean;
  notify_price_drops: boolean;
  default_country_iso: string | null;
  show_online_status: boolean;
  allow_dm_from: AllowDmFrom;
  public_profile: boolean;
  show_phone_to_buyers: boolean;
  allow_search_indexing: boolean;
  two_factor_enabled: boolean;
  two_factor_method: TwoFactorMethod | null;
  created_at: string;
  updated_at: string;
}