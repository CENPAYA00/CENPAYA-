import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ChatMessageStreamRow } from '../types/ChatMessage';

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessageStreamRow[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load messages for the current channel (defaulting to the first active channel)
  useEffect(() => {
    const loadChat = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);

      // Find the first channel this user is a part of (temporary: use the most recent)
      const { data: channels } = await supabase
        .from('chat_channels')
        .select('id')
        .limit(1);

      if (channels && channels.length > 0) {
        setChannelId(channels[0].id);
      }
      setLoading(false);
    };
    loadChat();
  }, []);

  // Fetch messages for the current channel
  useEffect(() => {
    if (!channelId) return;

    const fetchMessages = async () => {
      const { data } = await supabase
        .from('chat_messages_stream')
        .select('*')
        .eq('channel_id', channelId)
        .order('delivered_at', { ascending: true });
      if (data) setMessages(data as ChatMessageStreamRow[]);
    };
    fetchMessages();

    // Subscribe to real-time updates
    const subscription = supabase
      .channel(`chat_${channelId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages_stream',
        filter: `channel_id=eq.${channelId}`,
      }, (payload) => {
        setMessages((prev) => [...prev, payload.new as ChatMessageStreamRow]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [channelId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send a message
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !channelId || !userId) return;

    const { error } = await supabase
      .from('chat_messages_stream')
      .insert({
        channel_id: channelId,
        sender_id: userId,
        body_text: newMessage,
      });

    if (error) alert(error.message);
    setNewMessage('');
  };

  if (loading) return <div className="p-4 text-center">Loading chat...</div>;

  return (
    <div className="flex flex-col h-screen bg-offwhite">
      <div className="p-4 bg-navy text-white">
        <h1 className="text-lg font-bold">Order Chat</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`mb-3 max-w-[80%] ${
              msg.sender_id === userId ? 'ml-auto' : 'mr-auto'
            }`}
          >
            <div
              className={`p-3 rounded-2xl ${
                msg.sender_id === userId
                  ? 'bg-navy text-white rounded-br-sm'
                  : 'bg-white text-navy shadow-sm rounded-bl-sm'
              }`}
            >
              {msg.media_attachment_url && (
                <img
                  src={msg.media_attachment_url}
                  alt=""
                  className="rounded-lg mb-2 max-h-48"
                />
              )}
              <p className="text-sm">{msg.body_text}</p>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {msg.delivered_at
                ? new Date(msg.delivered_at).toLocaleTimeString()
                : 'Sending...'}
            </p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="p-3 bg-white border-t flex gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 p-3 border rounded-xl bg-gray-50"
        />
        <button
          type="submit"
          className="bg-navy text-white font-bold px-5 rounded-xl"
        >
          Send
        </button>
      </form>
    </div>
  );
}