export type DataExportRequestStatus =
  | "pending"
  | "processing"
  | "ready"
  | "expired"
  | "failed";

export interface DataExportRequest {
  id: string;
  user_id: string;
  status: DataExportRequestStatus;
  download_url: string | null;
  expires_at: string | null;
  requested_at: string;
  completed_at: string | null;
}