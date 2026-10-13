import { useState } from 'react';
import { Crown, Shield, LogOut, Send, Mic, Image as ImageIcon, Trash2, Reply, AtSign, Bell, BellOff, Clock, BarChart3, Flag, X, Plus, UserMinus } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function GroupDetailExtras({ state, setters, actions, refs, flags }: any) {
  const { id, data, g, tab, me, replyTo, mentions, showMentions, mentionResults, isRecording, actionMessage, showPoll, reportMessage, memberAction, showMenu, input, sending } = state;
  const { setReplyTo, setMemberAction, setShowMenu, setActionMessage, setReportMessage, setShowPoll } = setters;
  const { leave, mute, setDisappearing, setPostingRule, shareGroupToFeed, sendText, handleInputChange, sendImage, startRecording, sendRecording, cancelRecording, pickMention, deleteMsg, shareMessageToFeed, submitReport, loadMessages, loadGroup } = actions;
  const { fileRef, inputRef } = refs;
  const { isStaff, canPost } = flags;

  return (
    <>
      {tab === 'members' && (
        <div className="px-3 py-3">
          {data.members?.map((m: any) => (
            <div key={m.user_id} className="bg-white dark:bg-darkcard rounded-xl shadow-sm mb-2 p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold overflow-hidden">
                {m.avatar_url ? <img src={m.avatar_url} alt="" className="w-10 h-10 object-cover" /> : m.username?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-[12px] font-bold text-navy dark:text-white truncate">@{m.username}</p>
                  {m.role === 'owner' && <Crown size={11} className="text-gold" />}
                  {m.role === 'admin' && <Crown size={11} className="text-accent" />}
                </div>
                <p className="text-[9px] text-gray-400 uppercase tracking-wider">{m.role}</p>
              </div>
              {isStaff && m.role !== 'owner' && m.user_id !== me?.id && (
                <button onClick={() => setMemberAction(m)} className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-darkline flex items-center justify-center text-gray-500">
                  <Shield size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'info' && (
        <div className="px-3 py-3">
          <div className="bg-white dark:bg-darkcard rounded-xl shadow-sm p-4 mb-3">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Description</p>
            <p className="text-[12px] text-navy dark:text-white">{g.description || 'No description'}</p>
          </div>
          {data.my_role !== 'owner' && (
            <button onClick={leave} className="w-full bg-red-50 dark:bg-red-900/20 text-red-600 font-bold py-3 rounded-xl text-[12px] flex items-center justify-center gap-1">
              <LogOut size={13} /> Leave group
            </button>
          )}
        </div>
      )}

      {tab === 'chat' && canPost && (
        <>
          {replyTo && (
            <div className="fixed bottom-24 left-0 right-0 bg-navy/95 text-white px-3 py-2 flex items-center gap-2 z-20">
              <Reply size={14} />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold">Replying to @{replyTo.sender_username}</p>
                <p className="text-[10px] truncate opacity-80">{replyTo.body || '📎 media'}</p>
              </div>
              <button onClick={() => setReplyTo(null)}><X size={16} /></button>
            </div>
          )}

          {showMentions && mentionResults.length > 0 && (
            <div className="fixed bottom-32 left-2 right-2 max-h-40 overflow-y-auto bg-white dark:bg-darkcard rounded-xl shadow-lg z-30">
              {mentionResults.map((m: any) => (
                <button key={m.user_id} onClick={() => pickMention(m)} className="w-full flex items-center gap-2 p-2 border-b last:border-b-0 text-left">
                  <AtSign size={12} className="text-accent" />
                  <span className="text-[12px] font-bold text-navy dark:text-white">@{m.username}</span>
                </button>
              ))}
            </div>
          )}

          {isRecording && (
            <div className="fixed bottom-24 left-0 right-0 bg-red-500 text-white px-3 py-2 flex items-center gap-3 z-20">
              <button onClick={cancelRecording}><Trash2 size={16} /></button>
              <div className="flex-1 flex items-center gap-2">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                <span className="text-xs font-bold">Recording...</span>
              </div>
              <button onClick={sendRecording} className="bg-white text-red-500 rounded-full w-9 h-9 flex items-center justify-center"><Send size={14} /></button>
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); sendText(); }}
            className="fixed bottom-16 left-0 right-0 bg-white dark:bg-darkcard border-t border-gray-100 dark:border-darkline p-2 flex gap-1 items-center z-10">
            <button type="button" onClick={() => fileRef.current?.click()} className="w-9 h-9 flex items-center justify-center text-gray-500 shrink-0">
              <ImageIcon size={18} />
            </button>
            <button type="button" onClick={() => setShowPoll(true)} className="w-9 h-9 flex items-center justify-center text-gray-500 shrink-0">
              <BarChart3 size={18} />
            </button>
            <input ref={inputRef} value={input} onChange={(e) => handleInputChange(e.target.value)} placeholder="Message..."
              className="flex-1 p-2.5 bg-gray-50 dark:bg-darkbg border border-gray-200 dark:border-darkline rounded-full text-[12px]" />
            {input.trim() ? (
              <button type="submit" disabled={sending} className="bg-accent text-white rounded-full w-10 h-10 flex items-center justify-center shrink-0"><Send size={14} /></button>
            ) : (
              <button type="button" onMouseDown={startRecording} onMouseUp={sendRecording}
                onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
                onTouchEnd={(e) => { e.preventDefault(); sendRecording(); }}
                className="bg-accent text-white rounded-full w-10 h-10 flex items-center justify-center shrink-0">
                <Mic size={14} />
              </button>
            )}
          </form>
        </>
      )}

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && sendImage(e.target.files[0])} />

      {showMenu && (
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={() => setShowMenu(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-2xl animate-slide-up max-h-[80vh] overflow-y-auto">
            <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between">
              <p className="text-[13px] font-bold text-navy dark:text-white">Group options</p>
              <button onClick={() => setShowMenu(false)}><X size={18} /></button>
            </div>
            <div className="p-3 space-y-2">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Notifications</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => mute(480)} className="p-2.5 rounded-lg bg-gray-50 dark:bg-darkbg text-[11px] font-bold flex items-center gap-2"><BellOff size={12} /> Mute 8h</button>
                <button onClick={() => mute(10080)} className="p-2.5 rounded-lg bg-gray-50 dark:bg-darkbg text-[11px] font-bold flex items-center gap-2"><BellOff size={12} /> Mute 1 week</button>
                <button onClick={() => mute(null)} className="p-2.5 rounded-lg bg-gray-50 dark:bg-darkbg text-[11px] font-bold flex items-center gap-2"><Bell size={12} /> Unmute</button>
              </div>
              {isStaff && (
                <>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mt-3">Disappearing messages</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[{ v: 86400, l: '24 hours' }, { v: 604800, l: '7 days' }, { v: 7776000, l: '90 days' }, { v: null, l: 'Off' }].map(({ v, l }) => (
                      <button key={l} onClick={() => setDisappearing(v)} className={`p-2.5 rounded-lg text-[11px] font-bold flex items-center gap-2 ${g.disappearing_seconds === v ? 'bg-accent/15 text-accent' : 'bg-gray-50 dark:bg-darkbg'}`}><Clock size={12} /> {l}</button>
                    ))}
                  </div>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mt-3">Who can post</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(['everyone', 'admins'] as const).map((w) => (
                      <button key={w} onClick={() => setPostingRule(w)} className={`p-2.5 rounded-lg text-[11px] font-bold capitalize ${g.who_can_post === w ? 'bg-accent/15 text-accent' : 'bg-gray-50 dark:bg-darkbg'}`}>{w}</button>
                    ))}
                  </div>
                </>
              )}
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mt-3">Share</p>
              <button onClick={shareGroupToFeed} className="w-full text-left p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-700 font-bold text-[12px] flex items-center gap-2">
                <Send size={14} /> Share group to social feed
              </button>
            </div>
          </div>
        </div>
      )}

      {actionMessage && (
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={() => setActionMessage(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-2xl animate-slide-up">
            <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between">
              <p className="text-[13px] font-bold text-navy dark:text-white">Message</p>
              <button onClick={() => setActionMessage(null)}><X size={18} /></button>
            </div>
            <div className="p-3 space-y-2">
              <button onClick={() => { setReplyTo(actionMessage); setActionMessage(null); }} className="w-full text-left p-3 rounded-xl bg-gray-50 dark:bg-darkbg text-navy dark:text-white font-bold text-[12px] flex items-center gap-2">
                <Reply size={14} /> Reply
              </button>
              <button onClick={shareMessageToFeed} className="w-full text-left p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-700 font-bold text-[12px] flex items-center gap-2">
                <Send size={14} /> Share to social feed
              </button>
              {(actionMessage.sender_id === me?.id || isStaff) && (
                <button onClick={deleteMsg} className="w-full text-left p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 font-bold text-[12px] flex items-center gap-2">
                  <Trash2 size={14} /> Delete message
                </button>
              )}
              {actionMessage.sender_id !== me?.id && (
                <button onClick={() => { setReportMessage(actionMessage); setActionMessage(null); }} className="w-full text-left p-3 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 font-bold text-[12px] flex items-center gap-2">
                  <Flag size={14} /> Report to admin
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showPoll && <PollInline onClose={() => setShowPoll(false)} onCreated={() => { setShowPoll(false); loadMessages(); }} groupId={id} />}
      {reportMessage && <ReportInline onClose={() => setReportMessage(null)} onSubmit={submitReport} />}
      {memberAction && <MemberInline group={g} member={memberAction} onClose={() => setMemberAction(null)} onDone={() => { setMemberAction(null); loadGroup(); }} />}
    </>
  );
}

function PollInline({ onClose, onCreated, groupId }: any) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const create = async () => {
    setErr('');
    const cleanOpts = options.map((o) => o.trim()).filter(Boolean);
    if (question.trim().length < 3) return setErr('Question too short');
    if (cleanOpts.length < 2) return setErr('Need at least 2 options');
    setBusy(true);
    const { data, error } = await supabase.rpc('create_group_poll', { p_group_id: groupId, p_question: question.trim(), p_options: cleanOpts, p_is_multiple_choice: multiple, p_closes_in_hours: null });
    if (error || !data?.ok) { setErr(error?.message || data?.error || 'Failed'); setBusy(false); return; }
    onCreated();
  };
  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between sticky top-0 bg-white dark:bg-darkcard">
          <p className="text-[13px] font-bold text-navy dark:text-white">New poll</p>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-3 space-y-3">
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What should we..." className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs" />
          {options.map((opt, i) => (
            <div key={i} className="flex gap-2">
              <input value={opt} onChange={(e) => { const n = [...options]; n[i] = e.target.value; setOptions(n); }} placeholder={`Option ${i + 1}`} className="flex-1 p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs" />
              {options.length > 2 && <button onClick={() => setOptions(options.filter((_, x) => x !== i))} className="text-red-500 px-2"><X size={14} /></button>}
            </div>
          ))}
          {options.length < 10 && (
            <button onClick={() => setOptions([...options, ''])} className="text-[11px] font-bold text-accent flex items-center gap-1"><Plus size={12} /> Add option</button>
          )}
          <label className="flex items-center gap-2 text-[11px] text-navy dark:text-white">
            <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} className="accent-accent" />
            Allow multiple answers
          </label>
          {err && <p className="text-[11px] text-red-600">{err}</p>}
          <button onClick={create} disabled={busy} className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[12px] disabled:opacity-50">{busy ? 'Creating...' : 'Create poll'}</button>
        </div>
      </div>
    </div>
  );
}

function ReportInline({ onClose, onSubmit }: any) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (reason.trim().length < 10) return alert('Reason must be at least 10 characters.');
    setBusy(true);
    await onSubmit(reason.trim());
    setBusy(false);
  };
  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-2xl animate-slide-up">
        <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between">
          <p className="text-[13px] font-bold text-navy dark:text-white">Report message</p>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-3 space-y-3">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} placeholder="Why are you reporting this message?" className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs resize-none" />
          <button onClick={submit} disabled={busy} className="w-full bg-red-500 text-white font-bold py-3 rounded-xl text-[12px] disabled:opacity-50">{busy ? 'Reporting...' : 'Report to admin'}</button>
        </div>
      </div>
    </div>
  );
}

function MemberInline({ group, member, onClose, onDone }: any) {
  const setRole = async (role: 'admin' | 'member') => {
    const { data, error } = await supabase.rpc('set_group_member_role', { p_group_id: group.id, p_target_id: member.user_id, p_role: role });
    if (error || !data?.ok) alert(error?.message || data?.error || 'Failed');
    else onDone();
  };
  const remove = async () => {
    if (!window.confirm(`Remove @${member.username} from the group?`)) return;
    const { data, error } = await supabase.rpc('remove_group_member', { p_group_id: group.id, p_target_id: member.user_id });
    if (error || !data?.ok) alert(error?.message || data?.error || 'Failed');
    else onDone();
  };
  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-2xl animate-slide-up">
        <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between">
          <p className="text-[13px] font-bold text-navy dark:text-white">@{member.username}</p>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-3 space-y-2">
          {member.role === 'member' && (
            <button onClick={() => setRole('admin')} className="w-full text-left p-3 rounded-xl bg-accent/10 text-accent font-bold text-[12px]">Promote to admin</button>
          )}
          {member.role === 'admin' && (
            <button onClick={() => setRole('member')} className="w-full text-left p-3 rounded-xl bg-gray-50 dark:bg-darkbg text-navy dark:text-white font-bold text-[12px]">Demote to member</button>
          )}
          <button onClick={remove} className="w-full text-left p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 font-bold text-[12px] flex items-center gap-2">
            <UserMinus size={14} /> Remove from group
          </button>
        </div>
      </div>
    </div>
  );
                        }
