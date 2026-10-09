export type ListingType = "physical" | "service" | "digital";

export interface ListingCategory {
  id: string;
  slug: string;
  display_name: string;
  icon: string | null;
  listing_type: ListingType;
  display_order: number;
  is_active: boolean;
  created_at: string;
  section: string | null;
}