import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, X, Send, Sparkles, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { CHAT } from "@/constants/testIds";

const QUICK_ACTIONS = [
  "Analyze this area",
  "Find infrastructure gaps",
  "Explain the zoning",
  "How can I improve sustainability?",
  "Compare Proposal A vs B",
  "What are the major planning risks?",
];

export default function ChatBot({ projectId, zoneContext }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "ai", text: "Hi, I'm the SmartScape AI Planner. Ask me about zoning, infrastructure, sustainability or risks for your project." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setMessages((m) => [...m, { role: "user", text: msg }]);
    setInput("");
    setLoading(true);
    try {
      const { data } = await api.post("/chat", { project_id: projectId, message: msg, zone_context: zoneContext });
      setMessages((m) => [...m, { role: "ai", text: data.reply }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "ai", text: "Sorry — I couldn't reach the planning engine. Try again in a moment." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        data-testid={CHAT.toggle}
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-gradient-to-tr from-sky-600 via-teal-600 to-emerald-500 hover:from-sky-500 hover:to-emerald-400 text-white grid place-items-center shadow-xl shadow-sky-600/30 ring-2 ring-white/90 hover:scale-105 transition-all"
        aria-label="Open AI Planner"
      >
        {open ? <X size={20} /> : <Sparkles size={20} className="text-amber-300 drop-shadow-xs" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[540px] rounded-2xl glass shadow-2xl flex flex-col overflow-hidden border border-slate-200/80"
          >
            <div className="px-4 py-3 border-b border-slate-200/80 bg-white/90 backdrop-blur-md flex items-center gap-2.5 relative">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-sky-500 via-emerald-500 to-amber-400" />
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-600 to-emerald-600 grid place-items-center shadow-xs">
                <Sparkles size={14} className="text-amber-300" />
              </div>
              <div>
                <div className="text-sm font-display font-bold text-slate-900 flex items-center gap-1.5">
                  <span>SmartScape AI Planner</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                </div>
                <div className="text-[10px] text-slate-500 uppercase tracking-[0.15em] font-semibold">Urban Spatial Assistant</div>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-gradient-to-r from-slate-900 to-sky-950 text-white rounded-br-sm shadow-xs"
                      : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-2xs"
                  }`}>{m.text}</div>
                </motion.div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm flex items-center gap-2 text-slate-500 shadow-2xs">
                    <Loader2 size={14} className="animate-spin text-sky-600" /> Thinking…
                  </div>
                </div>
              )}
            </div>

            <div className="p-2 border-t border-slate-200/80 bg-white/70 overflow-x-auto flex gap-1.5 scrollbar-none">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a}
                  onClick={() => send(a)}
                  className="text-[11px] whitespace-nowrap px-2.5 py-1 rounded-full border border-sky-200/80 bg-sky-50/70 hover:bg-sky-100 hover:border-sky-300 text-sky-900 transition-colors"
                >
                  {a}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); send(); }}
              className="p-3 border-t border-slate-200/80 bg-white flex gap-2"
            >
              <input
                data-testid={CHAT.input}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about density, infrastructure, zoning…"
                className="flex-1 h-10 px-3 rounded-lg border border-slate-200 bg-slate-50/90 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none text-sm"
              />
              <button
                data-testid={CHAT.send}
                disabled={loading || !input.trim()}
                className="h-10 px-3.5 rounded-lg bg-gradient-to-r from-sky-600 to-emerald-600 hover:from-sky-500 hover:to-emerald-500 text-white disabled:opacity-40 transition-all grid place-items-center shadow-xs"
              >
                <Send size={15} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
