export interface UserWithdrawal {
  id: string;
  user_id: string;
  requested_amount: number;
  fee_charged: number;
  net_disbursement: number;
  status: string;
  created_at: string | null;
}