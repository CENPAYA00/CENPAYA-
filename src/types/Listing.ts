import { ListingType } from './ListingCategory';

export type ListingModerationStatus = "pending" | "approved" | "removed";
export type ListingBoostTier = "basic" | "standard" | "premium";

export interface Listing {
  id: string;
  seller_id: string;
  title: string;
  price: number;
  images: string[] | null;
  created_at: string;
  boosted_until: string | null;
  boost_tier: ListingBoostTier | null;
  boost_amount_paid: number | null;
  boost_paid_at: string | null;
  moderation_status: ListingModerationStatus;
  moderation_reason: string | null;
  removed_at: string | null;
  removed_by: string | null;
  search_vector: string | null;
  listing_type: ListingType;
  category_id: string | null;
  delivery_required: boolean;
  estimated_delivery_days: number | null;
  video_url: string | null;
  video_duration_seconds: number | null;
  video_thumb_url: string | null;
}