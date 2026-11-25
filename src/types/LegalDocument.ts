export interface LegalDocument {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  is_required: boolean;
  display_order: number;
  created_at: string;
}