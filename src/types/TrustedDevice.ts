export interface TrustedDevice {
  id: string;
  user_id: string;
  device_fingerprint: string;
  last_seen_at: string;
  trusted_at: string;
}