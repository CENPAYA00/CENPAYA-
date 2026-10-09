export type SystemWithdrawalStatus = "pending" | "completed" | "failed";

export interface SystemWithdrawal {
  id: string;
  admin_id: string;
  amount: number;
  destination_gateway: string;
  status: SystemWithdrawalStatus;
  created_at: string | null;
}