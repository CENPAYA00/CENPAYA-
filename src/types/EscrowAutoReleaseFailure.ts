export interface EscrowAutoReleaseFailure {
  id: string;
  order_id: string;
  attempted_status: string;
  error_message: string;
  occurred_at: string;
}