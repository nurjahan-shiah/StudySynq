"use client";

/**
 * frontend/src/app/components/ResourceUpload.tsx
 * US-D.1 — full upload pipeline UI: pick/drop a file → upload straight to
 * Supabase Storage with a live progress bar → register the file's
 * metadata with the backend. Drop this into any group's Resources tab.
 */

import { useRef, useState, DragEvent, ChangeEvent } from "react";
import { apiClient } from "@/lib/apiClient";
import { uploadFileToSupabase } from "@/lib/supabaseUpload";
import type { Resource } from "@/lib/hooks";

const T = {
  border: "var(--border)",
  bg2:    "var(--bg2)",
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
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

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
      // 1. Upload the raw bytes straight to Supabase Storage.
      const { publicUrl } = await uploadFileToSupabase(file, groupId, setProgress);

      // 2. Register the metadata with our own backend (M3 endpoint).
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

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = ""; // allow re-selecting the same file later
  }

  const busy = phase === "uploading" || phase === "saving";

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      style={{
        border: `1.5px dashed ${dragOver ? T.red : T.border}`,
        borderRadius: 12,
        padding: "18px 16px",
        textAlign: "center",
        background: dragOver ? `${T.red}08` : T.bg2,
        transition: "border-color 0.12s, background 0.12s",
        marginBottom: 16,
      }}
    >
      <input ref={inputRef} type="file" hidden onChange={onPick} />

      {!busy && phase !== "error" && (
        <>
          <p style={{ fontSize: 13, color: T.text2, margin: "0 0 10px" }}>
            Drag a file here, or
          </p>
          <button
            onClick={() => inputRef.current?.click()}
            style={{
              padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: "none", background: T.red, color: "#fff", cursor: "pointer",
            }}
          >
            + Upload file
          </button>
          <p style={{ fontSize: 11, color: T.text2, margin: "10px 0 0" }}>Max {MAX_MB}MB</p>
        </>
      )}

      {busy && (
        <div style={{ maxWidth: 360, margin: "0 auto" }}>
          <p style={{
            fontSize: 12, color: T.text, margin: "0 0 8px",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {phase === "saving" ? "Saving…" : "Uploading…"} {fileName}
          </p>
          <div style={{ height: 6, borderRadius: 4, background: T.bg3, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${phase === "saving" ? 100 : progress}%`,
              background: T.red,
              transition: "width 0.15s",
            }} />
          </div>
          <p style={{ fontSize: 11, color: T.text2, margin: "6px 0 0" }}>
            {phase === "saving" ? "Registering with StudySync…" : `${progress}%`}
          </p>
        </div>
      )}

      {phase === "error" && (
        <div>
          <p style={{ fontSize: 12, color: T.red, margin: "0 0 10px" }}>{error}</p>
          <button
            onClick={() => { setPhase("idle"); setError(null); }}
            style={{
              padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
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