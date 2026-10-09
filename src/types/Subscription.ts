export type SubscriptionPaymentMethod =
  | "cinetpay"
  | "campay"
  | "fapshi"
  | "pawapay"
  | "flutterwave"
  | "wallet";

export interface Subscription {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  payment_method: SubscriptionPaymentMethod | null;
  paid_at: string;
}