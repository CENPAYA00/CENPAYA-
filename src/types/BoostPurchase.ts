export type BoostPurchasePaymentMethod =
  | "wallet"
  | "cinetpay"
  | "free_verified";

export interface BoostPurchase {
  id: string;
  listing_id: string | null;
  seller_id: string;
  tier: string;
  amount: number;
  payment_method: BoostPurchasePaymentMethod | null;
  starts_at: string;
  ends_at: string;
  post_id: string | null;
}