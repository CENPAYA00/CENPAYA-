export interface ChatMessageStreamRow {
  id: string;
  channel_id: string;
  sender_id: string;
  body_text: string;
  media_attachment_url: string | null;
  delivered_at: string | null;
  voice_note_duration_seconds: number | null;
}