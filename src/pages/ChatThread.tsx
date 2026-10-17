/* src/pages/ChatThread.tsx */
import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Send, Mic, Play, Pause, Trash2, MoreVertical,
  Clock, Palette, Phone,
} from 'lucide-react';
import SharedPostCard from '../components/SharedPostCard';
import ReadReceipt from '../components/ReadReceipt';
import ChatMenus from '../components/ChatMenus';
import { resolveTheme } from '../lib/chatThemes';
import { useChatThread, type ChatMessage } from '../hooks/useChatThread';

export default function ChatThread() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const thread = useChatThread(id);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const theme = resolveTheme(thread.themeKey as any);
  const sharedPreviews: Record<string, unknown> = {};

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread.messages]);

  if (thread.loading) {
    return <div className="p-4 text-center text-xs">Loading...</div>;
  }

  return (
    <div
      className={`flex flex-col h-[calc(100dvh-120px)] overflow-hidden fixed inset-x-0 top-[57px] bottom-[60px] ${theme.bg} ${theme.bgDark}`}
    >
      <header className="bg-gradient-to-r from-brand to-brand-dark text-white px-3 py-3 flex items-center gap-2 shrink-0 shadow-md z-20">
        <button onClick={() => navigate('/chat')} className="cursor-pointer">
          <ArrowLeft size={18} />
        </button>
        <div className="w-8 h-8 bg-white/15 rounded-full flex items-center justify-center text-xs font-bold">
          {thread.otherUser?.username?.[0]?.toUpperCase() || 'U'}
        </div>
        <div className="flex-1">
          <p className="text-[12px] font-bold">
            @{thread.otherUser?.username || 'Chat'}
          </p>
          {thread.disappearing && (
            <p className="text-[9px] opacity-80 flex items-center gap-1">
              <Clock size={9} /> disappears after {thread.disappearing / 3600}h
            </p>
          )}
        </div>

        {thread.voiceCallsEnabled && (
          <button
            onClick={() => alert('Voice calling coming soon')}
            className="mr-2 cursor-pointer"
          >
            <Phone size={18} />
          </button>
        )}

        <button
          onClick={() => thread.setShowThemePicker(true)}
          className="mr-2 cursor-pointer"
        >
          <Palette size={18} />
        </button>
        <button
          onClick={() => thread.setShowChatMenu(true)}
          className="cursor-pointer"
        >
          <MoreVertical size={18} />
        </button>
      </header>

      <main
        className="flex-1 overflow-y-auto p-3 pb-4"
        style={{ overscrollBehavior: 'contain' }}
      >
        {thread.hasOlder && (
          <div className="flex justify-center mb-3">
            <button
              onClick={thread.loadOlder}
              disabled={thread.loadingOlder}
              className="text-[10px] font-bold text-gray-500 bg-gray-100 dark:bg-white/10 px-3 py-1.5 rounded-full disabled:opacity-50"
            >
              {thread.loadingOlder ? 'Loading…' : 'Load older messages'}
            </button>
          </div>
        )}
        {thread.messages.length === 0 && (
          <p className="text-center text-[10px] text-gray-400 mt-6">
            Say hi to @{thread.otherUser?.username}
          </p>
        )}
        {thread.messages.map((m: ChatMessage) => {
          const mine = m.sender_id === thread.userId;
          const isVoice = m.message_type === 'voice_note';
          const isShared = m.message_type === 'shared_post';
          const isPending = String(m.id).startsWith('temp-');
          const isFailed = m.status === 'failed';

          return (
            <div
              key={m.id}
              className={`mb-2 flex ${mine ? 'justify-end' : 'justify-start'}`}
            >
              <div
                onClick={() => !isPending && thread.setActionMessage(m)}
                className={`max-w-[75%] rounded-2xl text-xs ${isPending ? 'opacity-70' : 'cursor-pointer'} ${
                  mine
                    ? `${theme.bubbleMine} chat-bubble-mine`
                    : `${theme.bubbleTheirs} ${theme.bubbleTheirsDark} shadow-sm chat-bubble-theirs`
                } ${isShared ? 'p-1.5' : 'px-3 py-2'}`}
              >
                {m.is_forwarded && (
                  <p
                    className={`text-[9px] italic mb-1 ${
                      mine ? 'text-white/70' : 'text-gray-400'
                    }`}
                  >
                    ↪ Forwarded
                  </p>
                )}
                {isVoice ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      thread.togglePlay(m);
                    }}
                    className="flex items-center gap-2 min-w-[140px] cursor-pointer"
                  >
                    {thread.playingId === m.id ? (
                      <Pause size={14} />
                    ) : (
                      <Play size={14} />
                    )}
                    <div className="flex items-center gap-0.5">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <span
                          key={i}
                          className="wave-bar w-0.5 h-3 bg-current opacity-80"
                          style={{ animationDelay: `${i * 0.1}s` }}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] opacity-80">
                      {m.media_duration_seconds || m.voice_duration_seconds || 0}s
                    </span>
                    {isPending && (
                      <span className="w-2 h-2 rounded-full border border-current border-t-transparent animate-spin ml-1" />
                    )}
                  </button>
                ) : isShared ? (
                  <SharedPostCard
                    postId={m.shared_post_id ?? ''}
                    preview={
                      (sharedPreviews[m.shared_post_id ?? ''] as any) || null
                    }
                  />
                ) : (
                  m.body
                )}
                {mine && !isShared && (
                  <div className="flex justify-end mt-0.5">
                    {isFailed ? (
                      <span
                        className="text-[8px] text-red-300"
                        title={m.error || 'Failed'}
                      >
                        Failed to send
                      </span>
                    ) : isPending ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-white/50 animate-pulse" />
                    ) : (
                      <ReadReceipt
                        delivered={!!m.delivered_at}
                        read={!!m.read_at}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </main>

      {thread.isRecording && (
        <div className="bg-red-500 text-white px-3 py-2 flex items-center gap-3 shrink-0">
          <button onClick={thread.cancelRecording} className="cursor-pointer">
            <Trash2 size={16} />
          </button>
          <div className="flex-1 flex items-center gap-2">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <span className="text-xs font-bold">Recording...</span>
          </div>
          <button
            onClick={thread.sendRecording}
            className="bg-white text-red-500 rounded-full w-9 h-9 flex items-center justify-center cursor-pointer"
          >
            <Send size={14} />
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          thread.handleSend();
        }}
        className="bg-white dark:bg-darkcard border-t border-gray-100 dark:border-darkline p-2 flex gap-2 shrink-0 z-20 relative"
      >
        <input
          value={thread.input}
          onChange={(e) => thread.setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 p-2.5 bg-gray-50 dark:bg-darkbg border border-gray-200 dark:border-darkline rounded-full text-xs"
        />
        {thread.input.trim() ? (
          <button
            type="submit"
            data-silent
            className="text-white rounded-full w-10 h-10 flex items-center justify-center cursor-pointer"
            style={{ background: theme.accent }}
          >
            <Send size={14} />
          </button>
        ) : (
          <button
            type="button"
            data-silent
            onPointerDown={(e) => {
              e.preventDefault();
              thread.startRecording();
            }}
            onPointerUp={(e) => {
              e.preventDefault();
              thread.sendRecording();
            }}
            onPointerCancel={() => {
              thread.cancelRecording();
            }}
            className="text-white rounded-full w-10 h-10 flex items-center justify-center cursor-pointer"
            style={{ background: theme.accent }}
          >
            <Mic size={14} />
          </button>
        )}
      </form>

      <ChatMenus
        showChatMenu={thread.showChatMenu}
        setShowChatMenu={thread.setShowChatMenu}
        showThemePicker={thread.showThemePicker}
        setShowThemePicker={thread.setShowThemePicker}
        actionMessage={thread.actionMessage}
        setActionMessage={thread.setActionMessage}
        showForward={thread.showForward}
        setShowForward={thread.setShowForward}
        showReport={thread.showReport}
        setShowReport={thread.setShowReport}
        forwardTargets={thread.forwardTargets}
        otherUser={thread.otherUser}
        disappearing={thread.disappearing}
        themeKey={thread.themeKey as any}
        applyTheme={thread.applyTheme as any}
        setDisappearingSeconds={thread.setDisappearingSeconds}
        blockUser={thread.blockUser}
        deleteConversation={thread.deleteConversation}
        openForward={thread.openForward}
        deleteMsg={thread.deleteMsg}
        doForward={thread.doForward}
      />
    </div>
  );
            }
