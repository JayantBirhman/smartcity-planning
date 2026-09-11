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
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-slate-900 text-white grid place-items-center shadow-lg hover:scale-105 transition-transform"
        aria-label="Open AI Planner"
      >
        {open ? <X size={20} /> : <Sparkles size={20} className="text-emerald-400" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[540px] rounded-xl glass shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-slate-200 bg-white/70 flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-slate-900 grid place-items-center">
                <Sparkles size={14} className="text-emerald-400" />
              </div>
              <div>
                <div className="text-sm font-display font-semibold text-slate-900">SmartScape AI Planner</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-[0.2em]">Powered by Claude Sonnet 5</div>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-slate-900 text-white rounded-br-sm"
                      : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"
                  }`}>{m.text}</div>
                </motion.div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm flex items-center gap-2 text-slate-500">
                    <Loader2 size={14} className="animate-spin" /> Thinking…
                  </div>
                </div>
              )}
            </div>

            <div className="px-3 pt-2 pb-1 border-t border-slate-200 bg-white/70">
              <div className="flex gap-1.5 flex-wrap mb-2">
                {QUICK_ACTIONS.slice(0, 3).map((q, i) => (
                  <button key={i} data-testid={`${CHAT.quickAction}-${i}`}
                    onClick={() => send(q)}
                    className="text-[11px] px-2 py-1 rounded-full border border-slate-200 hover:border-emerald-500 hover:text-emerald-700 text-slate-600">
                    {q}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 pb-2">
                <input
                  data-testid={CHAT.input}
                  value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder="Ask about zoning, schools, hospitals…"
                  className="flex-1 h-9 px-3 rounded-md border border-slate-200 bg-white text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                />
                <button data-testid={CHAT.send} onClick={() => send()} className="h-9 w-9 grid place-items-center rounded-md bg-slate-900 text-white hover:bg-slate-800">
                  <Send size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
