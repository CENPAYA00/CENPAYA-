export interface UserActivityMetric {
  id: string;
  user_id: string;
  action_name: string;
  ip_address: string | null;
  device_fingerprint: string | null;
  created_at: string | null;
}