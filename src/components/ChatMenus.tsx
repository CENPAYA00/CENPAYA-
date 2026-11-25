import { X, Trash2, Forward, Clock, Flag, Ban, Check } from 'lucide-react';
import ChatThemePicker from './ChatThemePicker';
import ReportSheet from './ReportSheet';
import { ChatThemeKey } from '../lib/chatThemes';

type Props = {
  showChatMenu: boolean;
  setShowChatMenu: (v: boolean) => void;
  showThemePicker: boolean;
  setShowThemePicker: (v: boolean) => void;
  actionMessage: any;
  setActionMessage: (v: any) => void;
  showForward: any;
  setShowForward: (v: any) => void;
  showReport: boolean;
  setShowReport: (v: boolean) => void;
  forwardTargets: any[];
  otherUser: any;
  disappearing: number | null;
  themeKey: ChatThemeKey;
  applyTheme: (k: ChatThemeKey) => void;
  setDisappearingSeconds: (s: number | null) => void;
  blockUser: () => void;
  deleteConversation: () => void;
  openForward: () => void;
  deleteMsg: () => void;
  doForward: (channelId: string) => void;
};

export default function ChatMenus({
  showChatMenu, setShowChatMenu,
  showThemePicker, setShowThemePicker,
  actionMessage, setActionMessage,
  showForward, setShowForward,
  showReport, setShowReport,
  forwardTargets, otherUser, disappearing, themeKey,
  applyTheme, setDisappearingSeconds, blockUser, deleteConversation,
  openForward, deleteMsg, doForward,
}: Props) {
  return (
    <>
      {/* Chat menu */}
      {showChatMenu && (
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={() => setShowChatMenu(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-2xl animate-slide-up">
            <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between">
              <p className="text-[13px] font-bold text-navy dark:text-white">Chat options</p>
              <button onClick={() => setShowChatMenu(false)} className="cursor-pointer"><X size={18} /></button>
            </div>
            <div className="p-3 space-y-2">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Disappearing messages</p>
              <div className="grid grid-cols-2 gap-2 mb-2">
                {[
                  { v: 86400, l: '24 hours' },
                  { v: 604800, l: '7 days' },
                  { v: 7776000, l: '90 days' },
                  { v: null, l: 'Off' },
                ].map(({ v, l }) => (
                  <button key={l} onClick={() => setDisappearingSeconds(v)}
                    className={`p-2.5 rounded-lg text-[11px] font-bold flex items-center gap-2 cursor-pointer ${
                      disappearing === v ? 'bg-accent/15 text-accent' : 'bg-gray-50 dark:bg-darkbg'
                    }`}>
                    <Clock size={12} /> {l}
                  </button>
                ))}
              </div>

              <button onClick={blockUser} className="w-full text-left p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 font-bold text-[12px] flex items-center gap-2 cursor-pointer">
                <Ban size={14} /> Block @{otherUser?.username}
              </button>
              <button onClick={() => { setShowChatMenu(false); setShowReport(true); }} className="w-full text-left p-3 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 font-bold text-[12px] flex items-center gap-2 cursor-pointer">
                <Flag size={14} /> Report user
              </button>
              <button onClick={deleteConversation} className="w-full text-left p-3 rounded-xl bg-gray-50 dark:bg-darkbg text-navy dark:text-white font-bold text-[12px] flex items-center gap-2 cursor-pointer">
                <Trash2 size={14} /> Delete conversation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message actions */}
      {actionMessage && (
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={() => setActionMessage(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-2xl animate-slide-up">
            <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between">
              <p className="text-[13px] font-bold text-navy dark:text-white">Message</p>
              <button onClick={() => setActionMessage(null)} className="cursor-pointer"><X size={18} /></button>
            </div>
            <div className="p-3 space-y-2">
              <button onClick={openForward} className="w-full text-left p-3 rounded-xl bg-gray-50 dark:bg-darkbg text-navy dark:text-white font-bold text-[12px] flex items-center gap-2 cursor-pointer">
                <Forward size={14} /> Forward
              </button>
              <button onClick={deleteMsg} className="w-full text-left p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 font-bold text-[12px] flex items-center gap-2 cursor-pointer">
                <Trash2 size={14} /> Delete message
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Forward picker */}
      {showForward && (
        <div className="fixed inset-0 z-[210] bg-black/50 flex items-end" onClick={() => setShowForward(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-2xl max-h-[70vh] overflow-y-auto animate-slide-up">
            <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between">
              <p className="text-[13px] font-bold text-navy dark:text-white">Forward to...</p>
              <button onClick={() => setShowForward(null)} className="cursor-pointer"><X size={18} /></button>
            </div>
            {forwardTargets.length === 0 && (
              <p className="p-6 text-center text-[10px] text-gray-500">No other chats to forward to.</p>
            )}
            {forwardTargets.map(t => (
              <button key={t.channel_id} onClick={() => doForward(t.channel_id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 border-b border-gray-100 dark:border-darkline last:border-b-0 cursor-pointer">
                <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold">
                  {t.username?.[0]?.toUpperCase()}
                </div>
                <span className="flex-1 text-left text-[12px] font-bold text-navy dark:text-white">@{t.username}</span>
                <Check size={14} className="text-gray-300" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Theme picker */}
      {showThemePicker && (
        <ChatThemePicker
          value={themeKey}
          onChange={applyTheme}
          onClose={() => setShowThemePicker(false)}
        />
      )}

      {/* Report sheet */}
      {showReport && otherUser && (
        <ReportSheet
          targetType="user"
          targetId={otherUser.id}
          onClose={() => setShowReport(false)}
        />
      )}
    </>
  );
                }
