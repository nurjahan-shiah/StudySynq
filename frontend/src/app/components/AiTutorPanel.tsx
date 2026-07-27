"use client";

/**
 * AiTutorPanel — AI Study Assistant on the Resources tab.
 * Chat with an AI tutor that can explain concepts, work through problems,
 * and run quiz sessions based on the student's enrolled courses.
 */

import { useEffect, useRef, useState } from "react";
import { askTutor, type TutorMessage } from "@/lib/social";

const T = {
  bg2:    "var(--bg2)",
  bg3:    "var(--bg3)",
  card:   "var(--card-bg)",
  border: "var(--border)",
  text:   "var(--text)",
  text2:  "var(--text2)",
  red:    "var(--ss-red)",
  blue:   "var(--ss-blue)",
  green:  "var(--ss-green)",
} as const;

const SUGGESTIONS = [
  "Explain a concept from one of my courses",
  "Quiz me on my courses",
  "Help me work through a practice problem",
];

export function AiTutorPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [mode, setMode] = useState<"chat" | "quiz">("chat");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  async function send(text: string, forcedMode?: "chat" | "quiz") {
    const content = text.trim();
    if (!content || thinking) return;
    const useMode = forcedMode ?? mode;
    if (forcedMode) setMode(forcedMode);

    const next: TutorMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setDraft("");
    setThinking(true);
    const res = await askTutor(next, useMode);
    setThinking(false);
    setMessages(m => [...m, {
      role: "assistant",
      content: res.data?.reply ?? res.error ?? "Something went wrong — try again.",
    }]);
  }

  function handleSuggestion(s: string) {
    if (s.toLowerCase().startsWith("quiz")) send(s, "quiz");
    else send(s, "chat");
  }

  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: 14,
      marginBottom: 20, overflow: "hidden",
    }}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%",
          padding: "13px 16px", background: "transparent", border: "none",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{
          width: 34, height: 34, borderRadius: 9, background: `${T.blue}1a`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0,
        }}>
          🤖
        </span>
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: T.text }}>
            AI Study Assistant
          </span>
          <span style={{ display: "block", fontSize: 11.5, color: T.text2 }}>
            Get concepts explained, work through problems, or get quizzed on your courses.
          </span>
        </span>
        <span style={{ fontSize: 12, color: T.text2 }}>{open ? "Hide ▲" : "Open ▼"}</span>
      </button>

      {open && (
        <div style={{ borderTop: `1px solid ${T.border}` }}>
          {/* Messages */}
          <div
            ref={scrollRef}
            style={{ maxHeight: 380, overflowY: "auto", padding: "14px 16px" }}
          >
            {messages.length === 0 && (
              <div>
                <p style={{ fontSize: 12.5, color: T.text2, margin: "0 0 10px" }}>
                  Hi! I know which courses you&apos;re enrolled in. Try one of these:
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => handleSuggestion(s)}
                      className="ss-btn-ghost"
                      style={{ fontSize: 11.5, padding: "6px 12px" }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                  marginBottom: 10,
                }}
              >
                <div style={{
                  maxWidth: "82%", padding: "9px 13px", borderRadius: 12, fontSize: 12.5,
                  lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word",
                  background: m.role === "user" ? T.red : T.bg3,
                  color: m.role === "user" ? "#fff" : T.text,
                  border: m.role === "user" ? "none" : `1px solid ${T.border}`,
                }}>
                  {m.content}
                </div>
              </div>
            ))}

            {thinking && (
              <p style={{ fontSize: 12, color: T.text2, margin: 0 }}>Thinking…</p>
            )}
          </div>

          {/* Input */}
          <div style={{
            display: "flex", gap: 8, alignItems: "center",
            padding: "10px 14px", borderTop: `1px solid ${T.border}`, background: T.bg2,
          }}>
            <button
              onClick={() => setMode(m => (m === "quiz" ? "chat" : "quiz"))}
              title="Quiz mode: the assistant asks questions one at a time and grades your answers"
              style={{
                padding: "6px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                border: `1px solid ${mode === "quiz" ? T.green : T.border}`,
                background: mode === "quiz" ? "rgba(0,184,148,.12)" : "transparent",
                color: mode === "quiz" ? T.green : T.text2, cursor: "pointer", flexShrink: 0,
              }}
            >
              {mode === "quiz" ? "◉ Quiz mode" : "○ Quiz mode"}
            </button>
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") send(draft); }}
              placeholder={mode === "quiz" ? "Answer, or ask for a quiz topic…" : "Ask anything about your courses…"}
              className="ss-input"
              style={{ flex: 1, fontSize: 12.5, padding: "8px 12px" }}
            />
            <button
              onClick={() => send(draft)}
              disabled={thinking || !draft.trim()}
              className="ss-btn-primary"
              style={{ padding: "8px 18px", fontSize: 12.5, opacity: thinking || !draft.trim() ? 0.5 : 1 }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AiTutorPanel;
