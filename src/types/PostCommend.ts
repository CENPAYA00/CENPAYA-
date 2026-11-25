export type PostCommentModerationStatus =
  | "pending"
  | "approved"
  | "removed";

export interface PostComment {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  moderation_status: PostCommentModerationStatus;
}