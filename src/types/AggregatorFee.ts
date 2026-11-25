export type AggregatorFeeAction = "topup" | "withdrawal";

export interface AggregatorFee {
  id: string;
  provider_name: string;
  country_iso: string;
  payment_method: string;
  action: AggregatorFeeAction;
  fee_pct: number;
  fee_fixed: number;
  min_amount: number | null;
  max_amount: number | null;
  is_active: boolean;
  updated_at: string | null;
}

export type AggregatorFeeInsert = Pick<
  AggregatorFee,
  "provider_name" | "country_iso" | "payment_method" | "action"
> &
  Partial<
    Pick<
      AggregatorFee,
      "id" | "fee_pct" | "fee_fixed" | "min_amount" | "max_amount" | "is_active" | "updated_at"
    >
  >;

export type AggregatorFeeUpdate = Partial<AggregatorFeeInsert>;