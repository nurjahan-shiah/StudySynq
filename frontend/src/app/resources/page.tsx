"use client";

// US-D: Merged AI Study Assistant + Ask Library into unified Resources Intelligence Block
// + Added "All Files" dropdown option + refined visual design

import { useState, useEffect, CSSProperties } from "react";
import { Sidebar, ProfileButton } from "@/app/components/Sidebar";
import { NotificationBell } from "@/app/components/NotificationBell";
import { useConfirm } from "@/app/components/ConfirmProvider";
import { apiClient } from "@/lib/apiClient";
import {
  useMyGroups,
  useMyResources,
  askLibrary,
  type ResourceWithGroup,
  type MyGroup,
  type UserRole,
} from "@/lib/hooks";

const T = {
  bg:     "var(--bg)",
  bg2:    "var(--bg2)",
  bg3:    "var(--bg3)",
  card:   "var(--card-bg)",
  border: "var(--border)",
  text:   "var(--text)",
  text2:  "var(--text2)",
  red:    "var(--ss-red)",
} as const;

function fileIcon(fileType: string): string {
  const t = fileType.toLowerCase();
  if (t.includes("pdf"))                        return "⊟";
  if (t.includes("image") || t.includes("png") || t.includes("jpg") || t.includes("jpeg") || t.includes("gif") || t.includes("webp")) return "⊞";
  if (t.includes("word") || t.includes("doc")) return "◫";
  if (t.includes("sheet") || t.includes("csv") || t.includes("xls")) return "▦";
  return "◎";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

function isImage(fileType: string): boolean {
  const t = fileType.toLowerCase();
  return t.includes("image") || t.includes("png") || t.includes("jpg") || t.includes("jpeg") || t.includes("gif") || t.includes("webp");
}

function isPDF(fileType: string): boolean {
  return fileType.toLowerCase().includes("pdf");
}

function isDocument(fileType: string): boolean {
  return ["doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt", "md"]
    .includes(fileType.toLowerCase());
}

function isLink(fileType: string): boolean {
  return fileType.toLowerCase() === "link";
}

// ── Stats Widget (leader-only) ───────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: 12,
      padding: "14px 18px", display: "flex", flexDirection: "column", gap: 4,
    }}>
      <span style={{ fontSize: 22, fontWeight: 700, color: T.text }}>{value}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: T.text2 }}>{label}</span>
      {sub && <span style={{ fontSize: 10, color: T.text2, opacity: 0.7 }}>{sub}</span>}
    </div>
  );
}

function StatsWidget({ resources, myGroups }: { resources: ResourceWithGroup[]; myGroups: MyGroup[] }) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const totalFiles  = resources.length;
  const thisWeek    = resources.filter(r => new Date(r.created_at) >= weekAgo).length;
  const pdfCount    = resources.filter(r => isPDF(r.file_type)).length;
  const imageCount  = resources.filter(r => isImage(r.file_type)).length;
  const otherCount  = totalFiles - pdfCount - imageCount;

  const perGroup = myGroups
    .filter(g => g.my_role === "leader")
    .map(g => ({
      name:  g.name,
      count: resources.filter(r => r.group_id === g.id).length,
    }))
    .sort((a, b) => b.count - a.count);

  const recent = resources.slice(0, 5);

  const [open, setOpen] = useState(true);

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: T.text2, textTransform: "uppercase", letterSpacing: "0.07em" }}>
          Upload Activity · Leader View
        </span>
        <button
          onClick={() => setOpen(o => !o)}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: T.text2 }}
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Top stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
            <StatCard label="Total Files" value={totalFiles} />
            <StatCard label="This Week" value={thisWeek} sub="last 7 days" />
            <StatCard label="PDFs" value={pdfCount} />
            <StatCard label="Images" value={imageCount} />
            <StatCard label="Other" value={otherCount} />
          </div>

          {/* Per-group breakdown + recent uploads side by side */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>

            {/* Per-group */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 18px" }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: T.text2, textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 10px" }}>
                Files by Group
              </p>
              {perGroup.length === 0 ? (
                <p style={{ fontSize: 12, color: T.text2, margin: 0 }}>No groups.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {perGroup.map(g => (
                    <div key={g.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, color: T.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {g.name}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 20,
                        background: `${T.red}15`, color: T.red,
                      }}>
                        {g.count}
                      </span>
                      {/* bar */}
                      <div style={{ width: 60, height: 4, borderRadius: 2, background: T.bg3, flexShrink: 0 }}>
                        <div style={{
                          height: "100%", borderRadius: 2, background: T.red,
                          width: totalFiles > 0 ? `${Math.round((g.count / totalFiles) * 100)}%` : "0%",
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent uploads */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 18px" }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: T.text2, textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 10px" }}>
                Recent Uploads
              </p>
              {recent.length === 0 ? (
                <p style={{ fontSize: 12, color: T.text2, margin: 0 }}>No uploads yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {recent.map(r => (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>{fileIcon(r.file_type)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, color: T.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.file_name}
                        </p>
                        <p style={{ fontSize: 10, color: T.text2, margin: 0 }}>{formatDate(r.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Preview Modal ─────────────────────────────────────────────────────────────

function PreviewModal({ resource, onClose }: { resource: ResourceWithGroup; onClose: () => void }) {
  const canPreview = isPDF(resource.file_type) || isImage(resource.file_type);

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300 }}
      />
      <div role="dialog" aria-modal="true" aria-label="Resource preview" style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        width: "min(860px, 92vw)", maxHeight: "88vh",
        background: T.card, border: `1px solid ${T.border}`,
        borderRadius: 16, zIndex: 301, overflow: "hidden",
        display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: `1px solid ${T.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: T.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {resource.file_name}
            </p>
            <p style={{ fontSize: 12, color: T.text2, margin: "4px 0 0" }}>
              {resource.group_name} • {formatDate(resource.created_at)}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: T.text2, padding: "0 10px" }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {canPreview ? (
            isPDF(resource.file_type) ? (
              <iframe
                src={`${resource.file_url}#toolbar=0`}
                style={{ width: "100%", height: "100%", border: "none", borderRadius: 8 }}
              />
            ) : (
              <img
                src={resource.file_url}
                alt={resource.file_name}
                style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }}
              />
            )
          ) : (
            <div style={{ textAlign: "center", color: T.text2, paddingTop: "40px" }}>
              <p style={{ fontSize: 36, margin: "0 0 10px" }}>{fileIcon(resource.file_type)}</p>
              <p style={{ fontSize: 13, margin: 0 }}>Preview not available for this file type.</p>
              <a
                href={resource.file_url}
                download
                style={{ fontSize: 12, color: T.red, textDecoration: "none", marginTop: "12px", display: "inline-block" }}
              >
                Download instead →
              </a>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Unified Resources Intelligence Block (AI + Ask Library merged) ───────────────

interface AskLibraryResponse {
  answer: string;
  sources: Array<{ file_name: string; file_url: string; file_type: string }>;
}

interface AiTutorMessage {
  role: "user" | "assistant";
  content: string;
}

function ResourcesIntelligenceBlock({ groupId }: { groupId: string }) {
  const [tab, setTab] = useState<"chat" | "library">("chat");
  const [chatMessages, setChatMessages] = useState<AiTutorMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  
  const [libraryQuestion, setLibraryQuestion] = useState("");
  const [libraryAnswer, setLibraryAnswer] = useState<AskLibraryResponse | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(false);

  const handleChatSend = async () => {
    if (!chatInput.trim()) return;
    
    const newMessages: AiTutorMessage[] = [...chatMessages, { role: "user", content: chatInput }];
    setChatMessages(newMessages);
    setChatInput("");
    setChatLoading(true);

    const response = await apiClient.post<{ reply: string; note?: string }>("/resources/ai-tutor", {
      messages: newMessages,
      mode: "chat",
    });

    if (!response.error && response.data) {
      setChatMessages([...newMessages, { role: "assistant", content: response.data.reply }]);
    }
    setChatLoading(false);
  };

  const handleLibraryAsk = async () => {
    if (!libraryQuestion.trim()) return;
    
    setLibraryLoading(true);
    const response = await askLibrary(groupId, libraryQuestion);
    if (!response.error && response.data) {
      setLibraryAnswer(response.data);
    }
    setLibraryLoading(false);
  };

  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: 14,
      marginBottom: 20, overflow: "hidden",
    }}>
      {/* Tab header */}
      <div style={{
        display: "flex", gap: 0, borderBottom: `1px solid ${T.border}`,
        background: T.bg3,
      }}>
        <button
          onClick={() => setTab("chat")}
          style={{
            flex: 1, padding: "12px 16px", fontSize: 13, fontWeight: 600,
            border: "none", background: tab === "chat" ? T.card : "transparent",
            color: tab === "chat" ? T.text : T.text2, cursor: "pointer",
            borderBottom: tab === "chat" ? `2px solid ${T.red}` : "none",
          }}
        >
          🤖 AI Study Assistant
        </button>
        <button
          onClick={() => setTab("library")}
          style={{
            flex: 1, padding: "12px 16px", fontSize: 13, fontWeight: 600,
            border: "none", background: tab === "library" ? T.card : "transparent",
            color: tab === "library" ? T.text : T.text2, cursor: "pointer",
            borderBottom: tab === "library" ? `2px solid ${T.red}` : "none",
          }}
        >
          📚 Ask Your Library
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: "16px" }}>
        {tab === "chat" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 12, color: T.text2, margin: 0 }}>
              Get concepts explained, work through problems, or take a quiz.
            </p>
            
            {/* Messages */}
            <div style={{
              maxHeight: "300px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 8,
              padding: "12px", background: T.bg, borderRadius: 8,
            }}>
              {chatMessages.length === 0 ? (
                <p style={{ fontSize: 12, color: T.text2, margin: 0, textAlign: "center", paddingTop: "20px" }}>
                  Start a conversation...
                </p>
              ) : (
                chatMessages.map((msg, i) => (
                  <div key={i} style={{
                    display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                  }}>
                    <div style={{
                      maxWidth: "80%", padding: "8px 12px", borderRadius: 8,
                      background: msg.role === "user" ? T.red : T.bg2,
                      color: msg.role === "user" ? "white" : T.text,
                      fontSize: 12, lineHeight: "1.4",
                    }}>
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Input */}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                placeholder="Ask anything about your courses..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleChatSend()}
                disabled={chatLoading}
                style={{
                  flex: 1, padding: "7px 12px", borderRadius: 6,
                  border: `1px solid ${T.border}`, background: T.bg2,
                  color: T.text, fontSize: 12, outline: "none",
                }}
              />
              <button
                onClick={handleChatSend}
                disabled={chatLoading || !chatInput.trim()}
                style={{
                  padding: "7px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                  border: "none", background: T.red, color: "white", cursor: "pointer",
                  opacity: chatLoading || !chatInput.trim() ? 0.6 : 1,
                }}
              >
                Send
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 12, color: T.text2, margin: 0 }}>
              Search your group's resources by content or metadata.
            </p>

            {/* Input */}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                placeholder="What are you looking for?"
                value={libraryQuestion}
                onChange={e => setLibraryQuestion(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLibraryAsk()}
                disabled={libraryLoading}
                style={{
                  flex: 1, padding: "7px 12px", borderRadius: 6,
                  border: `1px solid ${T.border}`, background: T.bg2,
                  color: T.text, fontSize: 12, outline: "none",
                }}
              />
              <button
                onClick={handleLibraryAsk}
                disabled={libraryLoading || !libraryQuestion.trim()}
                style={{
                  padding: "7px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                  border: "none", background: T.red, color: "white", cursor: "pointer",
                  opacity: libraryLoading || !libraryQuestion.trim() ? 0.6 : 1,
                }}
              >
                Ask
              </button>
            </div>

            {/* Answer */}
            {libraryAnswer && (
              <div style={{
                padding: "12px", background: T.bg, borderRadius: 8,
                borderLeft: `3px solid ${T.red}`,
              }}>
                <p style={{ fontSize: 12, color: T.text, margin: "0 0 10px", lineHeight: "1.5" }}>
                  {libraryAnswer.answer}
                </p>
                {libraryAnswer.sources.length > 0 && (
                  <div style={{ fontSize: 11, color: T.text2 }}>
                    <p style={{ margin: "0 0 6px", fontWeight: 600 }}>Sources:</p>
                    {libraryAnswer.sources.map((src, i) => (
                      <div key={i} style={{ margin: "4px 0" }}>
                        <a
                          href={src.file_url}
                          download
                          style={{ color: T.red, textDecoration: "none", fontSize: 11 }}
                        >
                          📥 {src.file_name}
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

function ResourceRow({
  resource,
  onPreview,
  canDelete,
  deleting,
  onDelete,
}: {
  resource: ResourceWithGroup;
  onPreview: () => void;
  canDelete: boolean;
  deleting: boolean;
  onDelete: () => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "32px 1fr auto auto",
        gap: 12,
        padding: "12px 16px",
        borderBottom: `1px solid ${T.border}`,
        alignItems: "center",
        cursor: "pointer",
      }}
      onClick={onPreview}
    >
      <span style={{ fontSize: 18 }}>{fileIcon(resource.file_type)}</span>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: T.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {resource.file_name}
        </p>
        <p style={{ fontSize: 11, color: T.text2, margin: "2px 0 0" }}>
          {resource.group_name} • {formatDate(resource.created_at)}
        </p>
      </div>
      <a
        href={resource.file_url}
        download
        onClick={e => e.stopPropagation()}
        style={{
          fontSize: 11, color: T.red, textDecoration: "none", cursor: "pointer",
          padding: "4px 8px", borderRadius: 4, whiteSpace: "nowrap",
        }}
      >
        Download
      </a>
      {canDelete && (
        <button
          onClick={e => {
            e.stopPropagation();
            onDelete();
          }}
          disabled={deleting}
          style={{
            fontSize: 11, color: T.red, background: "none", border: "none", cursor: "pointer",
            opacity: deleting ? 0.5 : 1,
          }}
        >
          {deleting ? "..." : "Delete"}
        </button>
      )}
    </div>
  );
}

export default function ResourcesPage() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "pdf" | "document" | "image" | "link" | "other">("all");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [preview, setPreview] = useState<ResourceWithGroup | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data: resources, loading, error, refetch: refetchResources } = useMyResources(undefined as never);
  const { data: myGroups, loading: groupsLoading } = useMyGroups(undefined as never);
  const confirm = useConfirm();

  useEffect(() => {
    if (myGroups.length > 0 && !selectedGroupId) {
      setSelectedGroupId(myGroups[0].id);
    }
  }, [myGroups, selectedGroupId]);

  const isLeader = (): boolean => {
    if (!selectedGroupId) return false;
    const group = myGroups.find(g => g.id === selectedGroupId);
    if (!group) return false;

    return group?.my_role === "leader";
  };

  const canDeleteResource = (resource: ResourceWithGroup): boolean => {
    if (!selectedGroupId) return false;

    const isCurrentUser = resource.uploaded_by === resource.uploaded_by;
    const group = myGroups.find(g => g.id === selectedGroupId);
    if (!group) return false;

    return group?.my_role === "leader";
  };

  const handleDeleteResource = async (resource: ResourceWithGroup) => {
    const confirmed = await confirm({
      title: "Delete resource",
      message: `"${resource.file_name}" will be permanently removed. This cannot be undone.`,
      confirmLabel: "Delete",
    });

    if (!confirmed) {
      return;
    }

    setDeletingId(resource.id);
    setDeleteError(null);

    const response = await apiClient.delete<void>(`/resources/${resource.id}`);

    if (response.error) {
      setDeleteError(response.error);
      setDeletingId(null);
      return;
    }

    if (preview?.id === resource.id) {
      setPreview(null);
    }

    await refetchResources();
    setDeletingId(null);
  };

  // Filter by selected group
  const groupResources = selectedGroupId
    ? resources.filter(r => r.group_id === selectedGroupId)
    : resources;

  const filtered = groupResources.filter(r => {
    const matchSearch = r.file_name.toLowerCase().includes(search.toLowerCase()) ||
                        r.group_name.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filterType === "pdf")   return isPDF(r.file_type);
    if (filterType === "document") return isDocument(r.file_type);
    if (filterType === "image") return isImage(r.file_type);
    if (filterType === "link") return isLink(r.file_type);
    if (filterType === "other") {
      return !isPDF(r.file_type) && !isDocument(r.file_type)
        && !isImage(r.file_type) && !isLink(r.file_type);
    }
    return true;
  });

  const chipStyle = (active: boolean): CSSProperties => ({
    padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600,
    border: `1px solid ${active ? T.red : T.border}`,
    background: active ? `${T.red}15` : "transparent",
    color: active ? T.red : T.text2,
    cursor: "pointer",
  });

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: T.bg }}>
      <div className="ss-stripe-bar" />
      <Sidebar />

      <main style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: T.text, margin: 0 }}>Resources</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <NotificationBell />
            <ProfileButton />
          </div>
        </div>

        {/* Stats widget — leaders only */}
        {!loading && isLeader() && (
          <StatsWidget resources={resources} myGroups={myGroups} />
        )}

        {/* Group selector + Unified Intelligence Block */}
        {!loading && myGroups.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            {myGroups.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: T.text2, display: "block", marginBottom: 6 }}>
                  Select Group
                </label>
                <select
                  value={selectedGroupId}
                  onChange={e => setSelectedGroupId(e.target.value)}
                  style={{
                    padding: "8px 12px", borderRadius: 8, fontSize: 12, width: "100%", maxWidth: "300px",
                    border: `1px solid ${T.border}`, background: T.bg2,
                    color: T.text, cursor: "pointer", outline: "none",
                  }}
                >
                  <option value="">-- Select a group --</option>
                  {myGroups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
            )}
            
            {selectedGroupId && <ResourcesIntelligenceBlock groupId={selectedGroupId} />}
          </div>
        )}

        {/* Search + filters */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Search by file name or group…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1, minWidth: 200, padding: "7px 12px", borderRadius: 8,
              border: `1px solid ${T.border}`, background: T.bg2,
              color: T.text, fontSize: 13, outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["all", "pdf", "document", "image", "link", "other"] as const).map(t => (
              <button key={t} onClick={() => setFilterType(t)} style={chipStyle(filterType === t)}>
                {t === "all" ? "All Files" : t === "pdf" ? "PDFs"
                  : t === "document" ? "Documents" : t === "image" ? "Images"
                    : t === "link" ? "Links" : "Other"}
              </button>
            ))}
          </div>
        </div>

        {deleteError && (
          <div
            role="alert"
            style={{
              marginBottom: 12,
              padding: "10px 14px",
              borderRadius: 8,
              border: `1px solid ${T.red}55`,
              background: `${T.red}12`,
              color: T.red,
              fontSize: 12,
            }}
          >
            {deleteError}
          </div>
        )}

        {/* Resource list */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
          {/* List header */}
          <div style={{
            display: "grid", gridTemplateColumns: "32px 1fr auto auto",
            gap: 12, padding: "9px 16px",
            borderBottom: `1px solid ${T.border}`,
            background: T.bg3,
          }}>
            <span />
            <span style={{ fontSize: 10, fontWeight: 700, color: T.text2, textTransform: "uppercase", letterSpacing: "0.06em" }}>File</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: T.text2, textTransform: "uppercase", letterSpacing: "0.06em" }}>Uploaded</span>
            <span />
          </div>

          {loading && (
            <div style={{ padding: "40px 0", textAlign: "center", color: T.text2, fontSize: 13 }}>
              Loading resources…
            </div>
          )}

          {!loading && error && (
            <div style={{ padding: "40px 0", textAlign: "center", color: T.red, fontSize: 13 }}>
              {error}
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div style={{ padding: "48px 0", textAlign: "center", color: T.text2 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>⊟</div>
              <p style={{ fontSize: 13, margin: 0 }}>
                {resources.length === 0 ? "No resources in your groups yet." : "No results match your search."}
              </p>
            </div>
          )}

          {!loading && filtered.map(r => (
            <ResourceRow
              key={r.id}
              resource={r}
              onPreview={() => setPreview(r)}
              canDelete={canDeleteResource(r)}
              deleting={deletingId === r.id}
              onDelete={() => handleDeleteResource(r)}
            />
          ))}
        </div>

        {/* Footer count */}
        {!loading && filtered.length > 0 && (
          <p style={{ fontSize: 11, color: T.text2, marginTop: 10, textAlign: "right" }}>
            {filtered.length} file{filtered.length !== 1 ? "s" : ""}
          </p>
        )}
      </main>

      {preview && <PreviewModal resource={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}