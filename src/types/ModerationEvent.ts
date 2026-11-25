export type ModerationAction =
  | "flag"
  | "suspend"
  | "ban"
  | "unban"
  | "lift_suspension"
  | "extend_suspension"
  | "note";

export interface ModerationEvent {
  id: string;
  target_user_id: string;
  actor_id: string;
  actor_role: string;
  action: ModerationAction;
  reason: string;
  evidence_urls: string[] | null;
  suspension_duration_hours: number | null;
  expires_at: string | null;
  previous_state: string | null;
  new_state: string | null;
  ip_address: string | null;
  created_at: string;
}