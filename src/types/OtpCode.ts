export interface OtpCode {
  id: string;
  destination: string;
  channel: string;
  provider: string;
  purpose: string;
  code_hash: string;
  attempts: number;
  max_attempts: number;
  expires_at: string;
  verified_at: string | null;
  created_at: string;
}