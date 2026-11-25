export type WalletLedgerEntryType =
  | "DEPOSIT_MOMO"
  | "WITHDRAWAL"
  | "ESCROW_HOLD"
  | "ESCROW_PAYOUT"
  | "PREMIUM_SUBSCRIBE"
  | "LISTING_BOOST"
  | "REFERRAL_CREDIT"
  | "REVERSAL"
  | "WALLET_TOPUP";

export interface WalletHistoricalLedgerEntry {
  id: string;
  user_id: string;
  currency_code: string;
  entry_type: WalletLedgerEntryType;
  amount_mutated: number;
  running_balance_snapshot: number;
  associated_reference_id: string | null;
  created_at: string | null;
}