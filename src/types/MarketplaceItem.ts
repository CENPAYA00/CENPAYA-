export interface MarketplaceItem {
  id: string;
  seller_id: string;
  title: string;
  price: number;
  images: string[] | null;
  created_at: string;
  listing_type: string | null;
  category_id: string | null;
}