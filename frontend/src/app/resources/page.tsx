"use client";

import { useState, useEffect, CSSProperties } from "react";
import { Sidebar, ProfileButton } from "@/app/components/Sidebar";
import {
  useMyGroups,
  useMyResources,
  type ResourceWithGroup,
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
        borderRadius: 16, zIndex: 301,
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px", borderBottom: `1px solid ${T.border}`, flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span style={{ fontSize: 20 }}>{fileIcon(resource.file_type)}</span>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: T.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {resource.file_name}
              </p>
              <p style={{ fontSize: 11, color: T.text2, margin: 0 }}>{resource.group_name} · {formatDate(resource.created_at)}</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <a
              href={resource.file_url}
              download={resource.file_name}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: T.red, color: "#fff", textDecoration: "none",
                display: "inline-flex", alignItems: "center", gap: 5,
              }}
            >
              ↓ Download
            </a>
            <button
              type="button"
              aria-label="Close preview"
              onClick={onClose}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: T.text2, padding: 4, lineHeight: 1 }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Preview area */}
        <div style={{ flex: 1, overflow: "hidden", minHeight: 0, background: T.bg3 }}>
          {isPDF(resource.file_type) && (
            <iframe
              src={resource.file_url}
              title={resource.file_name}
              referrerPolicy="no-referrer"
              sandbox="allow-same-origin allow-downloads"
              style={{ width: "100%", height: "100%", border: "none", minHeight: 480 }}
            />
          )}
          {isImage(resource.file_type) && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: 20, minHeight: 480 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resource.file_url}
                alt={resource.file_name}
                style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain", borderRadius: 8 }}
              />
            </div>
          )}
          {!canPreview && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: 40, minHeight: 260, gap: 12 }}>
              <span style={{ fontSize: 48, opacity: 0.4 }}>{fileIcon(resource.file_type)}</span>
              <p style={{ color: T.text2, fontSize: 13, margin: 0 }}>Preview not available for this file type.</p>
              <a
                href={resource.file_url}
                download={resource.file_name}
                target="_blank"
                rel="noopener noreferrer"
                style={{ padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: T.red, color: "#fff", textDecoration: "none" }}
              >
                ↓ Download file
              </a>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Resource Row ──────────────────────────────────────────────────────────────

function ResourceRow({ resource, onPreview }: { resource: ResourceWithGroup; onPreview: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPreview}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPreview(); } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "grid", gridTemplateColumns: "32px 1fr auto auto",
        alignItems: "center", gap: 12,
        padding: "12px 16px",
        borderBottom: `1px solid ${T.border}`,
        background: hovered ? T.bg3 : "transparent",
        cursor: "pointer", transition: "background 0.12s",
      }}
    >
      <span style={{ fontSize: 18, textAlign: "center", flexShrink: 0 }}>{fileIcon(resource.file_type)}</span>

      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: T.text, margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {resource.file_name}
        </p>
        <p style={{ fontSize: 11, color: T.text2, margin: 0 }}>{resource.group_name}</p>
      </div>

      <span style={{ fontSize: 11, color: T.text2, whiteSpace: "nowrap", flexShrink: 0 }}>
        {formatDate(resource.created_at)}
      </span>

      <a
        href={resource.file_url}
        download={resource.file_name}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        style={{
          padding: "5px 12px", borderRadius: 7, fontSize: 11, fontWeight: 600,
          background: `${T.red}18`, color: T.red, textDecoration: "none",
          border: `1px solid ${T.red}30`, flexShrink: 0,
        }}
      >
        ↓ Download
      </a>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ResourcesPage() {
  const [userId, setUserId] = useState("");
  const [preview, setPreview] = useState<ResourceWithGroup | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "pdf" | "image" | "other">("all");

  useEffect(() => {
    setUserId(localStorage.getItem("ss_user_id") ?? "");
  }, []);

  const { data: myGroups, loading: groupsLoading } = useMyGroups(userId);
  const { data: resources, loading: resLoading, error } = useMyResources(myGroups);

  const loading = groupsLoading || resLoading;

  const filtered = resources.filter(r => {
    const matchSearch = r.file_name.toLowerCase().includes(search.toLowerCase()) ||
                        r.group_name.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filterType === "pdf")   return isPDF(r.file_type);
    if (filterType === "image") return isImage(r.file_type);
    if (filterType === "other") return !isPDF(r.file_type) && !isImage(r.file_type);
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
          <ProfileButton />
        </div>

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
          <div style={{ display: "flex", gap: 6 }}>
            {(["all","pdf","image","other"] as const).map(t => (
              <button key={t} onClick={() => setFilterType(t)} style={chipStyle(filterType === t)}>
                {t === "all" ? "All" : t === "pdf" ? "PDFs" : t === "image" ? "Images" : "Other"}
              </button>
            ))}
          </div>
        </div>

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
            <ResourceRow key={r.id} resource={r} onPreview={() => setPreview(r)} />
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
