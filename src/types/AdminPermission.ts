export interface AdminPermission {
  id: string;
  user_id: string;
  permission_key: string;
  granted_by: string;
  granted_at: string;
  revoked_at: string | null;
}