"use client";

import { useRef, useState } from "react";
import { Send, Bot } from "lucide-react";
import type { ReportMeta } from "@/lib/reportIndexer";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: ReportMeta[];
}

interface Props {
  symbol?: string;
  analyst?: string;
}

export function RagChat({ symbol, analyst }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function send() {
    const query = input.trim();
    if (!query || streaming) return;
    setInput("");

    const userMsg: Message = { role: "user", content: query };
    setMessages((prev) => [...prev, userMsg]);

    const assistantMsg: Message = { role: "assistant", content: "", sources: [] };
    setMessages((prev) => [...prev, assistantMsg]);
    setStreaming(true);

    try {
      const res = await fetch("/api/reports/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, symbol, analyst, topK: 6 }),
      });

      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = JSON.parse(line.slice(6)) as {
            type: string;
            text?: string;
            sources?: ReportMeta[];
          };

          if (payload.type === "sources") {
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { ...updated[updated.length - 1], sources: payload.sources };
              return updated;
            });
          } else if (payload.type === "delta" && payload.text) {
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                content: updated[updated.length - 1].content + payload.text,
              };
              return updated;
            });
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
          }
        }
      }
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="border border-border rounded-xl bg-surface flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Bot className="w-4 h-4 text-amber" />
        <h2 className="text-xs font-mono text-muted tracking-widest uppercase">Ask the Reports</h2>
        {(symbol || analyst) && (
          <span className="ml-auto text-[10px] font-mono text-amber/70">
            {[symbol, analyst].filter(Boolean).join(" · ")}
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <p className="text-xs font-mono text-muted">
            Ask anything about the research reports — target prices, investment thesis, risk factors, sector views…
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={msg.role === "user" ? "text-right" : ""}>
            {msg.sources && msg.sources.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {msg.sources.map((s) => (
                  <span key={s.id} className="text-[9px] font-mono bg-amber/10 text-amber px-1.5 py-0.5 rounded">
                    {s.company} · {s.analyst}
                  </span>
                ))}
              </div>
            )}
            <div
              className={`inline-block text-xs font-sans leading-relaxed px-3 py-2 rounded-lg max-w-[85%] text-left whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-amber/15 text-primary"
                  : "bg-border text-primary"
              }`}
            >
              {msg.content || (streaming && i === messages.length - 1 ? "▌" : "")}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 px-4 py-3 border-t border-border">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Ask about target prices, thesis, risks…"
          disabled={streaming}
          className="flex-1 text-xs font-mono bg-background border border-border rounded px-3 py-2 text-primary placeholder-muted focus:outline-none focus:border-amber/60 disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={streaming || !input.trim()}
          className="p-2 text-amber hover:bg-amber/10 rounded transition-colors disabled:opacity-30"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
