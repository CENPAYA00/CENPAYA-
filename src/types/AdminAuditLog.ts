export interface AdminAuditLog {
  id: string;
  actor_id: string;
  action: string;
  target_user_id: string | null;
  target_table: string | null;
  target_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}