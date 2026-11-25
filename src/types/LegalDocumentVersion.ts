export interface LegalDocumentVersion {
  id: string;
  document_id: string;
  version_label: string;
  body_markdown: string;
  body_hash: string;
  effective_from: string;
  effective_until: string | null;
  published_by: string | null;
  created_at: string;
}