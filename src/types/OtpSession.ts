export interface OtpSession {
  user_id: string;
  phone: string;
  termii_pin_id: string;
  created_at: string;
  request_ip: string | null;
  attempts_count: number;
  is_verified: boolean;
  expires_at: string;
  verified_at: string | null;
}