export type OrderEscrowStatus =
  | "hold"
  | "released"
  | "auto_refunded_48h"
  | "auto_released_48h"
  | "buyer_cancelled"
  | "seller_rejected"
  | "agent_voided"
  | "disputed";

export interface Order {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  amount: number;
  fee_pct: number;
  escrow_status: OrderEscrowStatus;
  escrow_created_at: string;
  seller_confirmed_delivered: boolean;
  seller_confirmed_delivered_at: string | null;
  photo_proof_url: string | null;
  photo_proof_hash: string | null;
  buyer_confirmed_received: boolean;
  buyer_confirmed_received_at: string | null;
  buyer_reviewed_proof: boolean;
  auto_release_deadline_at: string | null;
  dispute_hold: boolean;
  currency_code: string | null;
  fee_fixed: number;
}