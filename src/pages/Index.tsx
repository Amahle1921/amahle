import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Send, Sparkles, Mail, FileText, ListTodo, Search, BookOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string };

const QUICK_PROMPTS = [
  { icon: Mail, label: "Write Email", prompt: "Write a professional email to my manager requesting time off next Friday for a personal appointment." },
  { icon: FileText, label: "Summarize Notes", prompt: "Summarize these meeting notes:\n\n" },
  { icon: ListTodo, label: "Plan My Day", prompt: "Help me plan and prioritize my tasks for tomorrow. My tasks are: " },
  { icon: Search, label: "Explain Topic", prompt: "Explain in simple terms: " },
  { icon: BookOpen, label: "Research Assistant", prompt: "Act as my research assistant. Conduct in-depth research on the following topic and return: an executive summary, key insights, important facts & figures, notable perspectives or debates, practical implications, and suggested next steps for deeper learning. Topic: " },
];

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

export default function Index() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || isLoading) return;
    const userMsg: Msg = { role: "user", content };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setIsLoading(true);

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: next }),
      });

      if (resp.status === 429) { toast.error("Rate limit reached. Please try again shortly."); setIsLoading(false); return; }
      if (resp.status === 402) { toast.error("AI credits exhausted. Add credits in workspace settings."); setIsLoading(false); return; }
      if (!resp.ok || !resp.body) { toast.error("Failed to get response"); setIsLoading(false); return; }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
      let done = false;
      let started = false;

      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(json);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              acc += delta;
              if (!started) {
                started = true;
                setMessages(p => [...p, { role: "assistant", content: acc }]);
              } else {
                setMessages(p => p.map((m, i) => i === p.length - 1 ? { ...m, content: acc } : m));
              }
            }
          } catch { buf = line + "\n" + buf; break; }
        }
      }
    } catch (e) {
      console.error(e);
      toast.error("Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      <div className="absolute inset-0 gradient-glow pointer-events-none" />

      {/* Header */}
      <header className="relative border-b border-border/60 backdrop-blur-sm bg-background/70 z-10">
        <div className="container max-w-4xl flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-elegant">
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Workhorse AI</h1>
              <p className="text-xs text-muted-foreground">Your workplace productivity assistant</p>
            </div>
          </div>
        </div>
      </header>

      {/* Chat area */}
      <main ref={scrollRef} className="flex-1 overflow-y-auto relative z-10">
        <div className="container max-w-4xl py-8 space-y-6">
          {messages.length === 0 && (
            <div className="text-center py-12 space-y-6 animate-in fade-in duration-700">
              <div className="space-y-3">
                <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
                  Work smarter with <span className="text-gradient">Workhorse</span>
                </h2>
                <p className="text-muted-foreground max-w-xl mx-auto text-base">
                  Draft emails, summarize meetings, plan your day, and demystify complex topics — all in one place.
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 max-w-3xl mx-auto pt-4">
                {QUICK_PROMPTS.map(({ icon: Icon, label, prompt }) => (
                  <button
                    key={label}
                    onClick={() => setInput(prompt)}
                    className="group p-4 rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-elegant transition-smooth text-left"
                  >
                    <Icon className="w-5 h-5 text-primary mb-2 group-hover:scale-110 transition-smooth" />
                    <div className="text-sm font-medium">{label}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && (
                <div className="w-8 h-8 shrink-0 rounded-lg gradient-primary flex items-center justify-center mt-1">
                  <Sparkles className="w-4 h-4 text-primary-foreground" />
                </div>
              )}
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-soft ${
                m.role === "user"
                  ? "gradient-primary text-primary-foreground rounded-tr-sm"
                  : "bg-card border border-border rounded-tl-sm"
              }`}>
                {m.role === "assistant" ? (
                  <div className="prose-chat text-sm">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.content}</p>
                )}
              </div>
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex gap-3">
              <div className="w-8 h-8 shrink-0 rounded-lg gradient-primary flex items-center justify-center mt-1">
                <Loader2 className="w-4 h-4 text-primary-foreground animate-spin" />
              </div>
              <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-muted-foreground">
                Thinking…
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Input */}
      <div className="relative z-10 border-t border-border/60 bg-background/80 backdrop-blur-sm">
        <div className="container max-w-4xl py-4">
          <div className="flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder="Ask Workhorse to write, summarize, plan, or explain…"
              className="min-h-[56px] max-h-40 resize-none rounded-xl border-border bg-card shadow-soft focus-visible:ring-primary"
              disabled={isLoading}
            />
            <Button
              onClick={() => send()}
              disabled={isLoading || !input.trim()}
              size="lg"
              className="h-[56px] px-5 gradient-primary hover:opacity-90 shadow-elegant transition-smooth"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Workhorse can make mistakes. Verify important information before acting.
          </p>
        </div>
      </div>
    </div>
  );
}
