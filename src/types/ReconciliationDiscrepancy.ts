export type ReconciliationDiscrepancyCategory =
  | "amount_mismatch"
  | "status_mismatch"
  | "missing_internal"
  | "missing_gateway";

export interface ReconciliationDiscrepancy {
  id: string;
  batch_id: string;
  category: ReconciliationDiscrepancyCategory;
  operator_reference: string | null;
  internal_amount: number | null;
  gateway_amount: number | null;
  notes: string | null;
  created_at: string;
}