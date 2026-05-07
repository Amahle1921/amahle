import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Sparkles, Mail, FileText, ListTodo, BookOpen, Loader2, ArrowLeft, Wand2, MessageSquare, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

type TaskId = "chat" | "email" | "summarize" | "plan" | "research";
type ChatMsg = { role: "user" | "assistant"; content: string };

const TASKS: { id: TaskId; icon: typeof Mail; label: string; description: string }[] = [
  { id: "chat", icon: MessageSquare, label: "AI Chatbot", description: "Have a free-form conversation with Workhorse." },
  { id: "email", icon: Mail, label: "Write Email", description: "Draft a polished, professional email." },
  { id: "summarize", icon: FileText, label: "Summarize Notes", description: "Turn meeting notes into key points & actions." },
  { id: "plan", icon: ListTodo, label: "Plan My Day", description: "Prioritize tasks into a clear action plan." },
  { id: "research", icon: BookOpen, label: "Research Assistant", description: "Get an in-depth briefing on any topic." },
];

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

async function streamChat(
  messages: ChatMsg[],
  onDelta: (chunk: string) => void,
): Promise<{ ok: boolean; status?: number }> {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ messages }),
  });

  if (!resp.ok || !resp.body) return { ok: false, status: resp.status };

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let done = false;

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
        if (delta) onDelta(delta);
      } catch { buf = line + "\n" + buf; break; }
    }
  }
  return { ok: true };
}

export default function Index() {
  const [task, setTask] = useState<TaskId | null>(null);
  const [result, setResult] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Form fields
  const [tone, setTone] = useState("Formal");
  const [recipient, setRecipient] = useState("");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");
  const [tasks, setTasks] = useState("");
  const [topic, setTopic] = useState("");

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isLoading]);

  const buildPrompt = (): string | null => {
    switch (task) {
      case "email":
        if (!purpose.trim()) return null;
        return `Write a professional email.\n- Recipient: ${recipient || "Unspecified"}\n- Tone: ${tone}\n- Purpose: ${purpose}\n\nInclude a subject line and a concise body.`;
      case "summarize":
        if (!notes.trim()) return null;
        return `Summarize the following meeting notes. Extract key points, decisions, action items (with owners), and deadlines.\n\nNOTES:\n${notes}`;
      case "plan":
        if (!tasks.trim()) return null;
        return `Help me plan and prioritize my day. Organize the tasks below by priority (High/Medium/Low) and urgency, then propose a structured schedule with productivity tips.\n\nTASKS:\n${tasks}`;
      case "research":
        if (!topic.trim()) return null;
        return `Act as my research assistant. Conduct in-depth research on this topic and return: executive summary, key insights, important facts & figures, notable perspectives, practical implications, and suggested next steps.\n\nTOPIC: ${topic}`;
      default:
        return null;
    }
  };

  const run = async () => {
    const prompt = buildPrompt();
    if (!prompt) { toast.error("Please fill in the required fields."); return; }
    setIsLoading(true);
    setResult("");

    try {
      let acc = "";
      const res = await streamChat([{ role: "user", content: prompt }], (delta) => {
        acc += delta;
        setResult(acc);
      });
      if (!res.ok) {
        if (res.status === 429) toast.error("Rate limit reached. Try again shortly.");
        else if (res.status === 402) toast.error("AI credits exhausted. Add credits in workspace settings.");
        else toast.error("Failed to get response");
      }
    } catch (e) {
      console.error(e);
      toast.error("Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || isLoading) return;
    const userMsg: ChatMsg = { role: "user", content: text };
    const next = [...chatMessages, userMsg];
    setChatMessages(next);
    setChatInput("");
    setIsLoading(true);

    let assistantSoFar = "";
    let started = false;
    try {
      const res = await streamChat(next, (delta) => {
        assistantSoFar += delta;
        setChatMessages((prev) => {
          if (!started) {
            started = true;
            return [...prev, { role: "assistant", content: assistantSoFar }];
          }
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: assistantSoFar } : m,
          );
        });
      });
      if (!res.ok) {
        if (res.status === 429) toast.error("Rate limit reached. Try again shortly.");
        else if (res.status === 402) toast.error("AI credits exhausted.");
        else toast.error("Failed to get response");
      }
    } catch (e) {
      console.error(e);
      toast.error("Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setTask(null);
    setResult("");
    setRecipient(""); setPurpose(""); setNotes(""); setTasks(""); setTopic(""); setTone("Formal");
    setChatMessages([]); setChatInput("");
  };

  const activeTask = TASKS.find(t => t.id === task);

  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      <div className="absolute inset-0 gradient-glow pointer-events-none" />

      <header className="relative border-b border-border/60 backdrop-blur-sm bg-background/70 z-10">
        <div className="container max-w-5xl flex items-center gap-3 py-4">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-elegant">
            <Sparkles className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Workhorse AI</h1>
            <p className="text-xs text-muted-foreground">Your workplace productivity assistant</p>
          </div>
        </div>
      </header>

      <main className="flex-1 relative z-10">
        <div className="container max-w-5xl py-10">
          {!task && (
            <div className="space-y-8 animate-in fade-in duration-500">
              <div className="text-center space-y-3">
                <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
                  Work smarter with <span className="text-gradient">Workhorse</span>
                </h2>
                <p className="text-muted-foreground max-w-xl mx-auto">
                  Pick a task or chat directly with Workhorse.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
                {TASKS.map(({ id, icon: Icon, label, description }) => (
                  <button
                    key={id}
                    onClick={() => setTask(id)}
                    className="group p-6 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-elegant transition-smooth text-left"
                  >
                    <div className="w-11 h-11 rounded-xl gradient-primary flex items-center justify-center mb-4 shadow-soft">
                      <Icon className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <h3 className="font-semibold text-base mb-1">{label}</h3>
                    <p className="text-sm text-muted-foreground">{description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {task && activeTask && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={reset}>
                  <ArrowLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <div className="flex items-center gap-2">
                  <activeTask.icon className="w-5 h-5 text-primary" />
                  <h2 className="text-xl font-semibold">{activeTask.label}</h2>
                </div>
              </div>

              {task === "chat" ? (
                <div className="rounded-2xl border border-border bg-card shadow-soft flex flex-col h-[70vh] overflow-hidden">
                  <ScrollArea className="flex-1 p-6">
                    {chatMessages.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground py-16">
                        <MessageSquare className="w-8 h-8 mb-3 text-primary/60" />
                        <p className="text-sm">Ask Workhorse anything to get started.</p>
                      </div>
                    )}
                    <div className="space-y-5">
                      {chatMessages.map((m, i) => (
                        <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                          {m.role === "assistant" && (
                            <div className="w-8 h-8 shrink-0 rounded-lg gradient-primary flex items-center justify-center shadow-soft">
                              <Sparkles className="w-4 h-4 text-primary-foreground" />
                            </div>
                          )}
                          <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                            {m.role === "assistant" ? (
                              <div className="prose-chat"><ReactMarkdown>{m.content || "…"}</ReactMarkdown></div>
                            ) : (
                              <p className="whitespace-pre-wrap">{m.content}</p>
                            )}
                          </div>
                          {m.role === "user" && (
                            <div className="w-8 h-8 shrink-0 rounded-lg bg-secondary flex items-center justify-center">
                              <User className="w-4 h-4" />
                            </div>
                          )}
                        </div>
                      ))}
                      {isLoading && chatMessages[chatMessages.length - 1]?.role === "user" && (
                        <div className="flex gap-3">
                          <div className="w-8 h-8 shrink-0 rounded-lg gradient-primary flex items-center justify-center shadow-soft">
                            <Sparkles className="w-4 h-4 text-primary-foreground" />
                          </div>
                          <div className="bg-muted rounded-2xl px-4 py-2.5">
                            <Loader2 className="w-4 h-4 animate-spin" />
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>
                  </ScrollArea>
                  <div className="border-t border-border p-4 flex gap-2">
                    <Textarea
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendChat();
                        }
                      }}
                      placeholder="Type your message… (Enter to send, Shift+Enter for newline)"
                      rows={1}
                      className="min-h-[44px] max-h-32 resize-none"
                    />
                    <Button onClick={sendChat} disabled={isLoading || !chatInput.trim()} className="h-11 gradient-primary shadow-elegant">
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid lg:grid-cols-2 gap-6">
                  <div className="rounded-2xl border border-border bg-card p-6 shadow-soft space-y-4">
                    {task === "email" && (
                      <>
                        <div className="space-y-2">
                          <Label>Recipient</Label>
                          <Input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="e.g. My manager, the client" />
                        </div>
                        <div className="space-y-2">
                          <Label>Tone</Label>
                          <Select value={tone} onValueChange={setTone}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Formal">Formal</SelectItem>
                              <SelectItem value="Informal">Informal</SelectItem>
                              <SelectItem value="Persuasive">Persuasive</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Purpose / Key points *</Label>
                          <Textarea rows={6} value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="What should the email say?" />
                        </div>
                      </>
                    )}

                    {task === "summarize" && (
                      <div className="space-y-2">
                        <Label>Meeting notes *</Label>
                        <Textarea rows={14} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Paste your meeting notes or document here…" />
                      </div>
                    )}

                    {task === "plan" && (
                      <div className="space-y-2">
                        <Label>Your tasks *</Label>
                        <Textarea rows={14} value={tasks} onChange={e => setTasks(e.target.value)} placeholder="List your tasks, one per line…" />
                      </div>
                    )}

                    {task === "research" && (
                      <div className="space-y-2">
                        <Label>Topic *</Label>
                        <Textarea rows={6} value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. The impact of AI on knowledge work" />
                      </div>
                    )}

                    <Button onClick={run} disabled={isLoading} className="w-full h-11 gradient-primary shadow-elegant">
                      {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</> : <><Wand2 className="w-4 h-4 mr-2" /> Generate</>}
                    </Button>
                  </div>

                  <div className="rounded-2xl border border-border bg-card p-6 shadow-soft min-h-[300px]">
                    {!result && !isLoading && (
                      <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground py-12">
                        <Sparkles className="w-8 h-8 mb-3 text-primary/60" />
                        <p className="text-sm">Your result will appear here.</p>
                      </div>
                    )}
                    {isLoading && !result && (
                      <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-12">
                        <Loader2 className="w-6 h-6 animate-spin mb-2" />
                        <p className="text-sm">Working on it…</p>
                      </div>
                    )}
                    {result && (
                      <div className="prose-chat text-sm">
                        <ReactMarkdown>{result}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="relative z-10 border-t border-border/60 bg-background/80 backdrop-blur-sm">
        <div className="container max-w-5xl py-3 text-xs text-muted-foreground text-center">
          Workhorse can make mistakes. Verify important information before acting.
        </div>
      </footer>
    </div>
  );
}
