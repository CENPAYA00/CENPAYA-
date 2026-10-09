export interface PaymentMethod {
  id: string;
  method_name: string;
  display_label: string;
  is_active: boolean | null;
}

export interface WithdrawalMethod {
  provider_name: string;
  country_iso: string;
  payment_method: string;
  action: "withdrawal";
  fee_pct: number;
  fee_fixed: number;
  min_amount: number | null;
  max_amount: number | null;
  is_active: boolean;
  updated_at: string | null;
}