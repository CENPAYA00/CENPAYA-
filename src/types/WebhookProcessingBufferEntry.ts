export type WebhookProcessingStatus =
  | "pending"
  | "processed"
  | "failed"
  | "duplicate";

export interface WebhookProcessingBufferEntry {
  id: string;
  external_event_id: string;
  source: string;
  payload: unknown;
  received_at: string;
  processed_at: string | null;
  status: WebhookProcessingStatus;
}