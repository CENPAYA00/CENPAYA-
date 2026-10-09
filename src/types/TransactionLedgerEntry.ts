export type LedgerFlowDirection = "CASH_IN" | "CASH_OUT";
export type TransactionStatus = "pending" | "completed" | "failed" | "expired";

export interface TransactionalLedgerEntry {
  id: string;
  user_id: string;
  gateway_id: string | null;
  payment_method_id: string | null;
  flow_direction: LedgerFlowDirection;
  operator_reference: string;
  user_phone_number: string;
  gross_amount: number;
  system_fee_cut: number;
  net_amount: number;
  currency_code: string;
  status: TransactionStatus;
  reversed_at: string | null;
  reversal_reason: string | null;
  reversal_reference: string | null;
  created_at: string | null;
  updated_at: string | null;
}