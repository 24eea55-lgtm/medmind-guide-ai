import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { sendChatMessage } from "@/lib/medicine.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/Markdown";
import { toast } from "sonner";
import { Send, Loader2, Bot, User } from "lucide-react";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({ meta: [{ title: "AI Assistant — MediSense" }] }),
  component: ChatPage,
});

type Msg = { id?: string; role: string; content: string };

function ChatPage() {
  const qc = useQueryClient();
  const send = useServerFn(sendChatMessage);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: history } = useQuery({
    queryKey: ["chat"],
    queryFn: async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("id, role, content")
        .order("created_at", { ascending: true });
      return (data ?? []) as Msg[];
    },
  });

  const messages = [...(history ?? []), ...pending];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, busy]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setPending([{ role: "user", content: text }]);
    setBusy(true);
    try {
      const res = await send({ data: { message: text } });
      if (!res.ok) toast.error(res.error ?? "Failed");
    } catch {
      toast.error("Failed to get a response");
    } finally {
      setPending([]);
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["chat"] });
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col md:h-[calc(100vh-5rem)]">
      <div className="mb-4">
        <h1 className="text-3xl font-semibold">AI assistant</h1>
        <p className="text-muted-foreground">
          Ask about your reports, medicines, or any health doubt.
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto rounded-xl border bg-card p-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
            <Bot className="h-10 w-10 text-primary" />
            <p className="mt-3 max-w-sm">
              Hi! I can explain your lab results, your medicines, and answer general
              health questions. What would you like to know?
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={m.id ?? i}
            className={"flex gap-3 " + (m.role === "user" ? "flex-row-reverse" : "")}
          >
            <div
              className={
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full " +
                (m.role === "user" ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground")
              }
            >
              {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </div>
            <div
              className={
                "max-w-[80%] rounded-2xl px-4 py-2.5 " +
                (m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground")
              }
            >
              {m.role === "user" ? (
                <p className="whitespace-pre-wrap text-sm">{m.content}</p>
              ) : (
                <Markdown>{m.content}</Markdown>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="mt-4 flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Type your question…"
          disabled={busy}
        />
        <Button onClick={handleSend} disabled={busy || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Educational use only — always consult a healthcare professional.
      </p>
    </div>
  );
}
