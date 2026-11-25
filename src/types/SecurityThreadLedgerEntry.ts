export type SecurityViolationType =
  | "OTP_BRUTE_FORCE_ATTEMPT"
  | "EXPIRED_TOKEN_SPAM"
  | "VELOCITY_ABUSE";

export type SecuritySeverityLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface SecurityThreatLedgerEntry {
  id: string;
  user_id: string;
  violation_type: SecurityViolationType;
  severity_level: SecuritySeverityLevel;
  offending_channel: string;
  recorded_details: string;
  triggered_at: string | null;
}