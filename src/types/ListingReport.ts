export type ListingReportStatus =
  | "open"
  | "reviewing"
  | "resolved"
  | "dismissed";

export interface ListingReport {
  id: string;
  listing_id: string;
  reporter_id: string;
  reason: string;
  details: string | null;
  status: ListingReportStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}