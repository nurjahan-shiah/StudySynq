"use client";

/**
 * frontend/src/app/components/ResourceUpload.tsx
 * US-D.1 — simple button that uploads a file straight to Supabase Storage
 * (with a progress bar) then registers its metadata with the backend.
 */

import { useRef, useState, ChangeEvent, FormEvent } from "react";
import { apiClient } from "@/lib/apiClient";
import { uploadFileToSupabase } from "@/lib/supabaseUpload";
import type { Resource } from "@/lib/hooks";

const T = {
  border: "var(--border)",
  bg3:    "var(--bg3)",
  text:   "var(--text)",
  text2:  "var(--text2)",
  red:    "var(--ss-red)",
} as const;

const MAX_MB = 25;

type Phase = "idle" | "uploading" | "saving" | "error";

export function ResourceUpload({
  groupId,
  onUploaded,
}: {
  groupId: string;
  onUploaded: (resource: Resource) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  async function handleFile(file: File) {
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`File is too large — max ${MAX_MB}MB.`);
      setPhase("error");
      return;
    }

    setFileName(file.name);
    setError(null);
    setProgress(0);
    setPhase("uploading");

    try {
      const { publicUrl } = await uploadFileToSupabase(file, groupId, setProgress);

      setPhase("saving");
      const params = new URLSearchParams({
        file_name: file.name,
        file_url: publicUrl,
        file_type: file.type || "application/octet-stream",
      });
      const res = await apiClient.post<Resource>(`/groups/${groupId}/resources?${params}`, {});

      if (res.error || !res.data) {
        throw new Error(res.error ?? "Failed to save file metadata");
      }

      onUploaded(res.data);
      setPhase("idle");
      setFileName(null);
      setProgress(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setPhase("error");
    }
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = ""; // allow re-selecting the same file later
  }

  async function handleLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = linkName.trim();
    const url = linkUrl.trim();
    if (!name || !url) {
      setError("Enter both a link name and URL.");
      setPhase("error");
      return;
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") throw new Error();
    } catch {
      setError("Enter a valid https URL.");
      setPhase("error");
      return;
    }

    setError(null);
    setPhase("saving");
    const params = new URLSearchParams({
      file_name: name,
      file_url: url,
      file_type: "link",
    });
    const res = await apiClient.post<Resource>(`/groups/${groupId}/resources?${params}`, {});
    if (res.error || !res.data) {
      setError(res.error ?? "Failed to save link");
      setPhase("error");
      return;
    }
    onUploaded(res.data);
    setLinkName("");
    setLinkUrl("");
    setShowLinkForm(false);
    setPhase("idle");
  }

  const busy = phase === "uploading" || phase === "saving";

  return (
    <div style={{ marginBottom: 16 }}>
      <input ref={inputRef} type="file" hidden onChange={onPick} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          style={{
            padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            border: "none", background: T.red, color: "#fff",
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {phase === "uploading" ? `Uploading… ${progress}%` : "+ Upload file"}
        </button>
        <button
          onClick={() => { setShowLinkForm((visible) => !visible); setError(null); setPhase("idle"); }}
          disabled={busy}
          style={{
            padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            border: `1px solid ${T.border}`, background: "transparent", color: T.text,
            cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1,
          }}
        >
          + Add link
        </button>
      </div>

      {showLinkForm && (
        <form onSubmit={handleLink} style={{
          display: "grid", gridTemplateColumns: "minmax(140px, 1fr) minmax(220px, 2fr) auto",
          gap: 8, marginTop: 10,
        }}>
          <input
            value={linkName}
            onChange={(event) => setLinkName(event.target.value)}
            placeholder="Link name"
            maxLength={255}
            style={{
              padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.border}`,
              background: T.bg3, color: T.text, fontSize: 12,
            }}
          />
          <input
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            placeholder="https://example.com"
            type="url"
            style={{
              padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.border}`,
              background: T.bg3, color: T.text, fontSize: 12,
            }}
          />
          <button type="submit" disabled={busy} style={{
            padding: "8px 14px", borderRadius: 8, border: "none",
            background: T.red, color: "#fff", fontSize: 12, fontWeight: 600,
            cursor: busy ? "default" : "pointer",
          }}>
            {phase === "saving" ? "Saving…" : "Save link"}
          </button>
        </form>
      )}

      {fileName && busy && (
        <div style={{ maxWidth: 280, marginTop: 8 }}>
          <p style={{
            fontSize: 12, color: T.text2, margin: "0 0 6px",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {fileName}
          </p>
          <div style={{ height: 5, borderRadius: 4, background: T.bg3, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${phase === "saving" ? 100 : progress}%`,
              background: T.red,
              transition: "width 0.15s",
            }} />
          </div>
        </div>
      )}

      {phase === "error" && (
        <div style={{ marginTop: 8 }}>
          <p style={{ fontSize: 12, color: T.red, margin: "0 0 6px" }}>{error}</p>
          <button
            onClick={() => { setPhase("idle"); setError(null); }}
            style={{
              padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600,
              border: `1px solid ${T.border}`, background: "transparent", color: T.text, cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
