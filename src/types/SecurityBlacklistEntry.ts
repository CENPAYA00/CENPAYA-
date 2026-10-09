export type SecurityBlacklistType =
  | "IP_ADDRESS"
  | "DEVICE_FINGERPRINT"
  | "PHONE_PREFIX";

export interface SecurityBlacklistEntry {
  id: string;
  type: SecurityBlacklistType;
  value: string;
  reason: string;
  blacklisted_by: string | null;
  created_at: string | null;
}