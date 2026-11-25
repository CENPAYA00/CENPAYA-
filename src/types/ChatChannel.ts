export type ChatChannelType = "P2P_MARKETPLACE" | "STAFF_SUPPORT";

export interface ChatChannel {
  id: string;
  channel_type: ChatChannelType;
  associated_order_id: string | null;
  associated_ticket_id: string | null;
  created_at: string | null;
}