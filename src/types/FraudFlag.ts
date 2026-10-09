export interface FraudFlag {
  id: string;
  user_id: string | null;
  reason: string;
  flagged_at: string;
  resolved: boolean;
  risk_score: number | null;
}