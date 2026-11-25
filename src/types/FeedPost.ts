export interface FeedPost {
  id: string;
  user_id: string;
  content: string;
  post_type: string | null;
  image_url: string | null;
  video_url: string | null;
  likes_count: number;
  comments_count: number;
  boost_tier: string | null;
  boosted_until: string | null;
  created_at: string;
}