import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bot, FileText, Loader2, Send, ShoppingBag, Sparkles, Wrench } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { d1Request } from "../lib/d1Api";

type RelatedResult = { id: string; kind: string; title: string; subtitle: string; meta: string; snippet: string; cover: string | null };
type Message = { role: "user" | "assistant"; content: string; related_results?: RelatedResult[] };

const suggestions = [
  { icon: ShoppingBag, label: "Help me find a product", prompt: "Help me find a product on CenPaya. Ask me what I need and my budget." },
  { icon: Wrench, label: "Find a freelance service", prompt: "Help me find a suitable freelance service on CenPaya." },
  { icon: FileText, label: "Improve my listing", prompt: "Help me write a clear, attractive description for my marketplace listing." },
  { icon: Sparkles, label: "Explain CenPaya", prompt: "Explain how CenPaya works and help me understand its features." },
];

export default function AIAssistant() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    d1Request<{ data: { enabled: boolean; available: boolean } }>("/api/ai/assistant/status")
      .then(result => { if (active) setAvailable(!!result.data?.available); })
      .catch(err => { if (active) { setAvailable(false); setError(err.message || "Assistant status is unavailable."); } });
    return () => { active = false; };
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, sending]);

  const send = async (text = input) => {
    const content = text.trim();
    if (!content || sending || !available) return;
    const next: Message[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setError("");
    setSending(true);
    try {
      const result = await d1Request<{ data: { message: string; related_results?: RelatedResult[] } }>("/api/ai/assistant/chat", {
        method: "POST",
        body: JSON.stringify({ messages: next.slice(-12).map(({ role, content: message }) => ({ role, content: message })) }),
      });
      setMessages(current => [...current, {
        role: "assistant",
        content: result.data.message,
        related_results: result.data.related_results || [],
      }]);
    } catch (err: any) {
      setError(err.message || "Could not send your message. Please try again.");
    } finally { setSending(false); }
  };

  const openResult = (item: RelatedResult) => navigate(item.kind === "service" ? "/service/" + encodeURIComponent(item.id) : "/listing/" + encodeURIComponent(item.id));

  if (available === null) return <div className="min-h-[60vh] flex items-center justify-center text-xs text-gray-500"><Loader2 size={16} className="animate-spin mr-2" /> Connecting to CenPaya Assistant…</div>;
  if (!available) return (
    <div className="max-w-xl mx-auto px-4 py-10 text-center">
      <button onClick={() => navigate(-1)} className="absolute left-4 top-5 p-2 rounded-full bg-white dark:bg-darkcard"><ArrowLeft size={18} /></button>
      <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 text-brand flex items-center justify-center mx-auto mb-4"><Bot size={30} /></div>
      <h1 className="text-lg font-bold text-navy dark:text-white">CenPaya Assistant</h1>
      <p className="text-sm text-gray-500 mt-2">AI assistance is not available at the moment. Please check again later.</p>
      {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto min-h-[calc(100dvh-190px)] flex flex-col px-2 pb-4">
      <header className="flex items-center gap-3 py-3 sticky top-0 bg-offwhite dark:bg-darkbg z-10">
        <button onClick={() => navigate(-1)} aria-label="Go back" className="p-2 rounded-full bg-white dark:bg-darkcard text-navy dark:text-white"><ArrowLeft size={18} /></button>
        <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-brand flex items-center justify-center"><Bot size={22} /></div>
        <div className="flex-1 min-w-0"><h1 className="text-sm font-bold text-navy dark:text-white">CenPaya Assistant</h1><p className="text-[10px] text-gray-500">Product discovery · Writing · Platform help</p></div>
        <span className="w-2 h-2 rounded-full bg-emerald-500" title="Available" />
      </header>

      <div className="flex-1 space-y-4 py-4">
        {messages.length === 0 && (
          <div className="py-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white dark:bg-darkcard text-brand shadow-sm flex items-center justify-center mx-auto mb-3"><Sparkles size={25} /></div>
            <h2 className="text-lg font-bold text-navy dark:text-white">How can I help you today?</h2>
            <p className="text-xs text-gray-500 mt-1">Ask me about products, freelance services, listings, documents or CenPaya.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-6 text-left">
              {suggestions.map(item => {
                const Icon = item.icon;
                return <button key={item.label} onClick={() => void send(item.prompt)} className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-darkcard border border-gray-100 dark:border-darkline text-left">
                  <Icon size={18} className="text-brand shrink-0" /><span className="text-xs font-semibold text-navy dark:text-white">{item.label}</span>
                </button>;
              })}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div key={index} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={message.role === "user" ? "max-w-[88%] rounded-2xl rounded-br-md bg-brand text-white p-3 text-sm whitespace-pre-wrap" : "max-w-[94%] w-full rounded-2xl rounded-bl-md bg-white dark:bg-darkcard border border-gray-100 dark:border-darkline p-3 text-sm text-navy dark:text-white whitespace-pre-wrap"}>
              {message.role === "assistant" && <div className="flex items-center gap-2 text-[10px] font-bold text-brand mb-2"><Bot size={14} /> CENPAYA ASSISTANT</div>}
              {message.content}
              {!!message.related_results?.length && (
                <div className="mt-3 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Relevant CenPaya results</p>
                  {message.related_results.map(item => <button key={item.id} onClick={() => openResult(item)} className="w-full flex gap-3 p-2 rounded-xl bg-gray-50 dark:bg-darkbg text-left border border-gray-100 dark:border-darkline">
                    {item.cover ? <img src={item.cover} alt="" className="w-14 h-14 object-cover rounded-lg" /> : <span className="w-14 h-14 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-brand flex items-center justify-center"><ShoppingBag size={20} /></span>}
                    <span className="min-w-0 flex-1"><span className="block text-xs font-bold truncate">{item.title}</span><span className="block text-[10px] text-gray-500 truncate">{item.subtitle}</span><span className="block text-[10px] font-semibold text-brand mt-1">{item.meta || (item.kind === "service" ? "Freelance service" : "Marketplace listing")}</span></span>
                  </button>)}
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && <div className="flex items-center gap-2 text-xs text-gray-500"><Bot size={15} className="text-brand" /><span className="animate-pulse">CenPaya Assistant is thinking…</span></div>}
        {error && <p role="alert" className="text-xs text-red-500 text-center">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={event => { event.preventDefault(); void send(); }} className="sticky bottom-0 bg-offwhite dark:bg-darkbg pt-2 pb-2">
        <div className="flex items-end gap-2 p-2 rounded-2xl bg-white dark:bg-darkcard border border-gray-200 dark:border-darkline shadow-sm">
          <textarea value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} rows={1} maxLength={4000} placeholder="Ask CenPaya Assistant…" className="flex-1 resize-none max-h-32 min-h-10 bg-transparent outline-none text-sm text-navy dark:text-white p-2" />
          <button type="submit" disabled={!input.trim() || sending} aria-label="Send message" className="w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center disabled:opacity-40"><Send size={17} /></button>
        </div>
        <p className="text-[9px] text-center text-gray-400 mt-2">AI can make mistakes. Do not share passwords, OTPs or payment PINs.</p>
      </form>
    </div>
  );
}
