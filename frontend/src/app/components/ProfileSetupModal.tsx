"use client";

/**
 * ProfileSetupModal — "Complete your profile"
 * Year of study, major, bio, and a public/private toggle per field.
 * Opened from the profile panel (right sidebar), above Appearance.
 */

import { useEffect, useState } from "react";
import { MAJOR_GROUPS } from "@/lib/majors";
import {
  getMyProfile,
  updateMyProfile,
  type ProfilePrivacy,
  type PrivacyValue,
} from "@/lib/social";

const T = {
  bg2:    "var(--bg2)",
  bg3:    "var(--bg3)",
  card:   "var(--card-bg)",
  border: "var(--border)",
  text:   "var(--text)",
  text2:  "var(--text2)",
  red:    "var(--ss-red)",
  green:  "var(--ss-green)",
} as const;

const YEARS = ["1st year", "2nd year", "3rd year", "4th year", "5th year+"];

function PrivacyToggle({
  value, onChange,
}: { value: PrivacyValue; onChange: (v: PrivacyValue) => void }) {
  const isPublic = value === "public";
  return (
    <button
      type="button"
      onClick={() => onChange(isPublic ? "private" : "public")}
      title={isPublic ? "Visible to everyone — click to make private" : "Only you — click to make public"}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "3px 10px", borderRadius: 20, fontSize: 10.5, fontWeight: 700,
        border: `1px solid ${isPublic ? T.green : T.border}`,
        background: isPublic ? "rgba(0,184,148,.12)" : T.bg3,
        color: isPublic ? T.green : T.text2,
        cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap",
      }}
    >
      {isPublic ? "🌐 Public" : "🔒 Private"}
    </button>
  );
}

function FieldRow({
  label, privacy, onPrivacy, children,
}: {
  label: string;
  privacy: PrivacyValue;
  onPrivacy: (v: PrivacyValue) => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{label}</label>
        <PrivacyToggle value={privacy} onChange={onPrivacy} />
      </div>
      {children}
    </div>
  );
}

export function ProfileSetupModal({
  userId, onClose, onSaved,
}: { userId: string; onClose: () => void; onSaved?: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [saved, setSaved]     = useState(false);

  const [major, setMajor] = useState("");
  const [year, setYear]   = useState("");
  const [bio, setBio]     = useState("");
  const [privacy, setPrivacy] = useState<Required<ProfilePrivacy>>({
    major: "public",
    year_of_study: "public",
    bio: "public",
    email: "private",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getMyProfile(userId);
      if (cancelled) return;
      if (res.data) {
        setMajor(res.data.major ?? "");
        setYear(res.data.year_of_study ?? "");
        setBio(res.data.bio ?? "");
        setPrivacy(p => ({ ...p, ...(res.data!.profile_privacy ?? {}) }));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await updateMyProfile(userId, {
      major, year_of_study: year, bio, profile_privacy: privacy,
    });
    setSaving(false);
    if (res.error) { setError(res.error); return; }
    setSaved(true);
    onSaved?.();
    setTimeout(onClose, 900);
  }

  const complete = Boolean(major && year);

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 300 }}
      />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        width: "min(480px, calc(100vw - 32px))", maxHeight: "88vh", overflowY: "auto",
        background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 16,
        zIndex: 301, padding: "22px 24px", boxShadow: "0 12px 40px rgba(0,0,0,.35)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: T.text, margin: 0 }}>
            Complete your profile
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: T.text2 }}>✕</button>
        </div>
        <p style={{ fontSize: 12, color: T.text2, margin: "0 0 18px", lineHeight: 1.5 }}>
          Your major and year power your recommendations. Use the toggles to decide
          what other students can see on your profile card.
        </p>

        {loading ? (
          <p style={{ fontSize: 13, color: T.text2 }}>Loading…</p>
        ) : (
          <>
            <FieldRow
              label="Year of study"
              privacy={privacy.year_of_study}
              onPrivacy={v => setPrivacy(p => ({ ...p, year_of_study: v }))}
            >
              <select value={year} onChange={e => setYear(e.target.value)} className="ss-input" style={{ width: "100%" }}>
                <option value="">Select year</option>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </FieldRow>

            <FieldRow
              label="Major"
              privacy={privacy.major}
              onPrivacy={v => setPrivacy(p => ({ ...p, major: v }))}
            >
              <select value={major} onChange={e => setMajor(e.target.value)} className="ss-input" style={{ width: "100%" }}>
                <option value="">Select major</option>
                {MAJOR_GROUPS.map(g => (
                  <optgroup key={g.faculty} label={g.faculty}>
                    {g.majors.map(m => <option key={m} value={m}>{m}</option>)}
                  </optgroup>
                ))}
              </select>
            </FieldRow>

            <FieldRow
              label="Bio"
              privacy={privacy.bio}
              onPrivacy={v => setPrivacy(p => ({ ...p, bio: v }))}
            >
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value.slice(0, 1000))}
                placeholder="A bit about you — what you're studying, what you're looking for…"
                rows={3}
                className="ss-input"
                style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
              />
              <p style={{ fontSize: 10, color: T.text2, margin: "3px 0 0", textAlign: "right" }}>{bio.length}/1000</p>
            </FieldRow>

            <FieldRow
              label="Email visibility"
              privacy={privacy.email}
              onPrivacy={v => setPrivacy(p => ({ ...p, email: v }))}
            >
              <p style={{ fontSize: 11.5, color: T.text2, margin: 0 }}>
                Controls whether other students can see your email on your profile card.
              </p>
            </FieldRow>

            {error && <p style={{ fontSize: 12, color: T.red, margin: "0 0 10px" }}>{error}</p>}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 6 }}>
              <span style={{ fontSize: 11, color: complete ? T.green : T.text2, fontWeight: 600 }}>
                {saved ? "Saved ✓" : complete ? "Profile complete" : "Add your major + year to unlock recommendations"}
              </span>
              <button
                onClick={handleSave}
                disabled={saving}
                className="ss-btn-primary"
                style={{ padding: "9px 22px", fontSize: 13, opacity: saving ? 0.7 : 1 }}
              >
                {saving ? "Saving…" : "Save profile"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default ProfileSetupModal;
