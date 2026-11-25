export type SystemProviderType =
  | "PAYMENT_GATEWAY"
  | "SMS_SERVICE"
  | "EMAIL_SERVICE"
  | "VIDEO_HOST"
  | "VOICE_CALL";

export interface SystemProvider {
  id: string;
  provider_name: string;
  provider_type: SystemProviderType;
  is_active: boolean | null;
  updated_at: string | null;
  display_name: string | null;
  supported_countries: string[] | null;
  priority: number;
}