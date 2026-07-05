/**
 * frontend/src/lib/supabaseUpload.ts
 * US-D.1 — Supabase File and Upload Pipeline
 *
 * Uploads go straight from the browser to Supabase Storage's REST API —
 * they never pass through our own backend, keeping large files off the
 * API gateway. We use a raw XMLHttpRequest (rather than the supabase-js
 * SDK) purely so we get real `upload.onprogress` events to drive a
 * progress bar. Once the upload finishes, the caller registers the
 * resulting public URL as resource metadata via
 * POST /groups/:id/resources (see hooks.ts / ResourceUpload.tsx).
 */

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const BUCKET            = process.env.NEXT_PUBLIC_SUPABASE_BUCKET ?? "resources";

export interface UploadResult {
  path: string;
  publicUrl: string;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Upload a file to the Supabase Storage bucket, reporting 0–100 progress.
 * Rejects with a human-readable message on failure.
 */
export function uploadFileToSupabase(
  file: File,
  groupId: string,
  onProgress?: (pct: number) => void
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      reject(new Error(
        "Supabase is not configured — set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY in the frontend environment."
      ));
      return;
    }

    // Namespace by group so files don't collide across groups, and by
    // timestamp so re-uploading the same filename never overwrites a file.
    const path = `${groupId}/${Date.now()}-${sanitizeFileName(file.name)}`;
    const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`;

    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Authorization", `Bearer ${SUPABASE_ANON_KEY}`);
    xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "false");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
        resolve({ path, publicUrl });
      } else {
        let detail = xhr.responseText;
        try {
          detail = JSON.parse(xhr.responseText).message ?? detail;
        } catch {
          /* response wasn't JSON — fall back to raw text */
        }
        reject(new Error(detail || `Upload failed (HTTP ${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}