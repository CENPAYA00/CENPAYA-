export type ReconciliationGatewayName =
  | "CINETPAY"
  | "PAYSTACK"
  | "FLUTTERWAVE";

export type ReconciliationStatus =
  | "unreconciled"
  | "matched_verified"
  | "discrepancy_alert";

export interface GatewayReconciliationBatch {
  id: string;
  gateway_name: ReconciliationGatewayName;
  batch_reference: string;
  batch_date: string | null;
  total_gross_volume: number;
  total_fees_charged_by_gateway: number;
  net_settlement_disbursed: number;
  currency_code: string;
  reconciliation_status: ReconciliationStatus;
  matched_count: number | null;
  mismatched_count: number | null;
  unmatched_internal: number | null;
  unmatched_gateway: number | null;
  discrepancy_total: number | null;
  processed_at: string | null;
}