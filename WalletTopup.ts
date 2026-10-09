export interface WalletTopup {
  id: string;
  user_id: string;
  provider: string;
  transaction_id: string;
  amount: number;
  currency_code: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}