"use client";

/**
 * frontend/src/app/components/GroupResourcesPanel.tsx
 * Resources tab content for a single group (US-D.1 upload pipeline,
 * US-D.2 library view, US-D.3 download, US-D.4 permissions).
 * Wire into groups/[id]/page.tsx's "resources" tab.
 */

import { useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { useGroupResources, type Resource } from "@/lib/hooks";
import { ResourceUpload } from "./ResourceUpload";

const T = {
  card:   "var(--card-bg)",
  bg3:    "var(--bg3)",
  border: "var(--border)",
  text:   "var(--text)",
  text2:  "var(--text2)",
  red:    "var(--ss-red)",
} as const;

function fileIcon(fileType: string): string {
  const t = fileType.toLowerCase();
  if (t.includes("pdf")) return "⊟";
  if (t.includes("image") || t.includes("png") || t.includes("jpg") || t.includes("jpeg") || t.includes("gif") || t.includes("webp")) return "⊞";
  if (t.includes("word") || t.includes("doc")) return "◫";
  if (t.includes("sheet") || t.includes("csv") || t.includes("xls")) return "▦";
  return "◎";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

export function GroupResourcesPanel({
  groupId,
  canManage,
  userId,
}: {
  groupId: string;
  /** true for group leader or admin — can delete anyone's file */
  canManage: boolean;
  userId: string;
}) {
  const { data: resources, loading, refetch } = useGroupResources(groupId);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(r: Resource) {
    if (!confirm(`Delete "${r.file_name}"? This cannot be undone.`)) return;
    setDeletingId(r.id);
    const res = await apiClient.delete(`/resources/${r.id}`);
    setDeletingId(null);
    if (!res.error) refetch();
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <ResourceUpload groupId={groupId} onUploaded={() => refetch()} />

      {loading ? (
        <p style={{ fontSize: 13, color: T.text2 }}>Loading…</p>
      ) : (resources ?? []).length === 0 ? (
        <div style={{ textAlign: "center", padding: "30px 0", color: T.text2 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⊟</div>
          <p style={{ fontSize: 13, margin: 0 }}>No files shared yet.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(resources ?? []).map((r) => {
            const canDelete = canManage || r.uploaded_by === userId;
            return (
              <div
                key={r.id}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  background: T.card, border: `1px solid ${T.border}`,
                  borderRadius: 10, padding: "10px 14px",
                }}
              >
                <span style={{ fontSize: 18 }}>{fileIcon(r.file_type)}</span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: 13, fontWeight: 600, color: T.text, margin: "0 0 2px",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {r.file_name}
                  </p>
                  <p style={{ fontSize: 11, color: T.text2, margin: 0 }}>{formatDate(r.created_at)}</p>
                </div>

                <a
                  href={r.file_url}
                  download={r.file_name}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: "5px 12px", borderRadius: 7, fontSize: 11, fontWeight: 600,
                    background: `${T.red}18`, color: T.red, textDecoration: "none",
                    border: `1px solid ${T.red}30`, flexShrink: 0,
                  }}
                >
                  {"↓ Download"}
                </a>

                {canDelete && (
                  <button
                    onClick={() => handleDelete(r)}
                    disabled={deletingId === r.id}
                    style={{
                      padding: "5px 10px", borderRadius: 7, fontSize: 11, fontWeight: 600,
                      background: "transparent", color: T.text2, border: `1px solid ${T.border}`,
                      cursor: deletingId === r.id ? "default" : "pointer", flexShrink: 0,
                      opacity: deletingId === r.id ? 0.6 : 1,
                    }}
                  >
                    {deletingId === r.id ? "…" : "Delete"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}