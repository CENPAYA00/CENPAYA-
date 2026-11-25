export type BanAppealStatus =
  | "open"
  | "under_review"
  | "accepted"
  | "rejected";

export interface BanAppeal {
  id: string;
  user_id: string;
  moderation_event_id: string | null;
  appeal_text: string;
  evidence_urls: string[] | null;
  status: BanAppealStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}