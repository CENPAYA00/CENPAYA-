export type OrderDisputeStatus = "open" | "under_review" | "resolved";

export type OrderDisputeOutcome =
  | "buyer_wins"
  | "seller_wins"
  | "split"
  | "withdrawn";

export interface OrderDispute {
  id: string;
  order_id: string;
  raised_by: string;
  reason: string;
  status: OrderDisputeStatus;
  evidence_deadline_at: string | null;
  sla_respond_by: string | null;
  sla_resolve_by: string | null;
  escalated_to: string | null;
  escalated_at: string | null;
  outcome: OrderDisputeOutcome | null;
  outcome_amount: number | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string | null;
}