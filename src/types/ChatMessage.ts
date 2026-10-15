export type ChatMessageType = 'text' | 'voice_note' | 'shared_post' | 'image' | 'system';

export interface ChatMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  body: string | null;
  message_type: ChatMessageType;
  media_url: string | null;
  media_duration_seconds: number | null;
  voice_note_url: string | null;
  voice_duration_seconds: number | null;
  shared_post_id: string | null;
  is_forwarded: boolean;
  read_at: string | null;
  delivered_at: string | null;
  created_at: string;
}
