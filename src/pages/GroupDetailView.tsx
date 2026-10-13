import { ArrowLeft, Crown, Megaphone, Copy, Check, Share2, Shield, X, Send, Mic, Play, Pause, Image as ImageIcon, Trash2, Reply, AtSign, BellOff, BarChart3 } from 'lucide-react';
import DocumentCard from '../components/DocumentCard';
import { GroupDetailExtras } from './GroupDetailExtras';

export default function GroupDetailView({ state, setters, actions, refs, flags }: any) {
  const { id, data, g, tab, copied, messages, polls, input, me, sending, replyTo, mentions, showMentions, mentionResults, playingId, isRecording, actionMessage, showPoll, reportMessage, memberAction, showMenu } = state;
  const { setTab, setReplyTo, setShowMentions, setActionMessage } = setters;
  const { copyCode, shareCode, togglePlay, vote, pickMention, sendText, handleInputChange, sendImage, startRecording, sendRecording, cancelRecording, navigate, leave, loadMessages } = actions;
  const { bottomRef, fileRef, inputRef } = refs;
  const { isStaff, isMuted, canPost } = flags;

  return (
    <div className="pb-24">
      <div className="flex items-center gap-2 px-3 py-2 sticky top-0 z-20 bg-white dark:bg-darkcard border-b border-gray-100 dark:border-darkline">
        <button onClick={() => navigate('/groups')} className="text-navy dark:text-white"><ArrowLeft size={20} /></button>
        <p className="flex-1 text-[13px] font-bold text-navy dark:text-white truncate">{g.name}</p>
        {isMuted && <BellOff size={14} className="text-gray-400" />}
        <button onClick={() => setters.setShowMenu(true)} className="text-navy dark:text-white text-[20px]">⋯</button>
      </div>

      <div className="p-4 flex flex-col items-center border-b border-gray-100 dark:border-darkline">
        <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold text-xl overflow-hidden mb-2">
          {g.avatar_url ? <img src={g.avatar_url} alt="" className="w-16 h-16 object-cover" /> : g.name?.[0]?.toUpperCase()}
        </div>
        <div className="flex items-center gap-1.5">
          <h1 className="text-[15px] font-black text-navy dark:text-white">{g.name}</h1>
          {g.is_announcement && <Megaphone size={13} className="text-accent" />}
        </div>
        <p className="text-[10px] text-gray-500 mt-0.5">
          {g.member_count} members{g.disappearing_seconds ? ` · auto-deletes after ${g.disappearing_seconds / 3600}h` : ''}
        </p>
        {isStaff && g.invite_code && (
          <div className="flex gap-2 mt-2">
            <button onClick={copyCode} className="text-[10px] font-bold text-navy dark:text-white bg-gray-100 dark:bg-darkline px-3 py-1.5 rounded-full flex items-center gap-1">
              {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
            </button>
            <button onClick={shareCode} className="text-[10px] font-bold text-white bg-accent px-3 py-1.5 rounded-full flex items-center gap-1">
              <Share2 size={11} /> Share
            </button>
          </div>
        )}
      </div>

      <div className="flex border-b border-gray-200 dark:border-darkline sticky top-[50px] z-10 bg-white dark:bg-darkcard">
        {(['chat', 'members', 'info'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-[11px] font-bold capitalize ${tab === t ? 'text-accent border-b-2 border-accent' : 'text-gray-500'}`}>
            {t}{t === 'members' ? ` (${data.members?.length || 0})` : ''}
          </button>
        ))}
      </div>

      {tab === 'chat' && (
        <div className="pb-32 px-3 py-3">
          {messages.map((m: any) => {
            const mine = m.sender_id === me?.id;
            const isVoice = m.message_type === 'voice_note';
            const isImage = m.message_type === 'image';
            const isDoc = m.message_type === 'document';
            const isPoll = m.message_type === 'poll';
            const isSystem = m.message_type === 'system';

            if (isSystem) return <p key={m.id} className="text-center text-[10px] italic text-gray-400 my-2">{m.body}</p>;
            if (m.is_deleted) return (
              <div key={m.id} className={`mb-2 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <p className="text-[10px] italic text-gray-400 px-3 py-1">Message deleted</p>
              </div>
            );

            const poll = polls[m.id];

            return (
              <div key={m.id} className={`mb-2 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  onClick={() => { if (!isImage && !isVoice && !isPoll) setActionMessage(m); }}
                  className={`max-w-[80%] rounded-2xl ${mine ? 'bg-navy text-white rounded-br-sm' : 'bg-white dark:bg-darkcard text-gray-800 dark:text-gray-100 shadow-sm rounded-bl-sm'} overflow-hidden`}
                >
                  {!mine && <p className="text-[10px] font-bold px-3 pt-1.5 text-accent">@{m.sender_username}</p>}
                  {m.reply_preview && (
                    <div className={`mx-2 mt-1.5 px-2 py-1 rounded border-l-2 text-[10px] ${mine ? 'bg-white/10 border-white/40' : 'bg-gray-100 dark:bg-darkbg border-accent text-gray-500'}`}>
                      <p className="font-bold">@{m.reply_sender}</p>
                      <p className="truncate">{m.reply_preview}</p>
                    </div>
                  )}
                  {isImage && <img src={m.media_url} alt="" className="max-w-[280px] w-full" />}
                  {isVoice && (
                    <button onClick={() => togglePlay(m)} className="flex items-center gap-2 px-3 py-2 min-w-[160px]">
                      {playingId === m.id ? <Pause size={14} /> : <Play size={14} />}
                      <div className="flex items-center gap-0.5">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <span key={i} className="wave-bar w-0.5 h-3 bg-current opacity-80" style={{ animationDelay: `${i * 0.1}s` }} />
                        ))}
                      </div>
                      <span className="text-[10px] opacity-80">{m.media_duration_seconds || 0}s</span>
                    </button>
                  )}
                  {isDoc && <div className="p-2"><DocumentCard url={m.media_url} /></div>}
                  {isPoll && poll && (
                    <div className="p-3 min-w-[220px]">
                      <p className="text-[12px] font-bold mb-2 flex items-center gap-1"><BarChart3 size={12} /> {poll.poll.question}</p>
                      {poll.results.map((r: any) => {
                        const voted = poll.my_votes.includes(r.option_key);
                        const pct = poll.total_votes > 0 ? Math.round((r.votes / poll.total_votes) * 100) : 0;
                        return (
                          <button key={r.option_key} disabled={poll.poll.is_closed} onClick={() => vote(poll.poll.id, m.id, r.option_key)}
                            className={`w-full relative mb-1.5 rounded-lg overflow-hidden border text-left ${voted ? 'border-accent' : 'border-gray-200 dark:border-darkline'}`}>
                            <div className="absolute inset-0 bg-accent/20" style={{ width: `${pct}%` }} />
                            <div className="relative flex justify-between p-2 text-[11px]">
                              <span className="font-bold">{voted ? '✓ ' : ''}{r.text}</span><span>{pct}%</span>
                            </div>
                          </button>
                        );
                      })}
                      <p className="text-[9px] opacity-70 mt-1">{poll.total_votes} votes{poll.poll.is_closed ? ' · closed' : ''}</p>
                    </div>
                  )}
                  {m.body && !isPoll && <p className="px-3 py-2 text-[12px] whitespace-pre-wrap">{m.body}</p>}
                  <p className={`text-[8px] px-3 pb-1.5 ${mine ? 'text-white/60' : 'text-gray-400'}`}>
                    {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}

      <GroupDetailExtras
        state={state}
        setters={setters}
        actions={actions}
        refs={refs}
        flags={flags}
      />
    </div>
  );
}
