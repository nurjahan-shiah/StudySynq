"use client";

/**
 * frontend/src/app/components/FriendsPanel.tsx
 * Friends management — incoming requests, current friends, and blocked users.
 *
 * Backend (social-service, port 8012):
 *   GET    /social/friends            — accepted friends
 *   GET    /social/friends/requests   — incoming pending requests
 *   GET    /social/friends/blocked    — users I've blocked
 *   POST   /social/friends/:id/accept — accept a request
 *   DELETE /social/friends/:id        — unfriend / decline / withdraw
 *   POST   /social/friends/:id/block  — block (also removes any friendship)
 *   DELETE /social/friends/:id/block  — unblock
 */

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  acceptFriendRequest,
  blockUser,
  getBlockedUsers,
  getFriendRequests,
  getFriends,
  removeFriend,
  unblockUser,
  type BlockedUser,
  type Friend,
  type FriendRequest,
} from "@/lib/social";

const T = {
  card:   "var(--card-bg)",
  bg3:    "var(--bg3)",
  border: "var(--border)",
  text:   "var(--text)",
  text2:  "var(--text2)",
  red:    "var(--ss-red)",
  green:  "var(--ss-green)",
} as const;

type Tab = "friends" | "requests" | "blocked";

function initials(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

function Avatar({ name }: { name: string }) {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: "50%", background: T.red, color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 13, fontWeight: 700, flexShrink: 0,
    }}>
      {initials(name)}
    </div>
  );
}

function SmallButton({
  label, onClick, disabled, tone = "neutral",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "neutral" | "danger" | "primary";
}) {
  const palette = {
    neutral: { bg: "transparent", fg: T.text2, border: `1px solid ${T.border}` },
    danger:  { bg: "transparent", fg: T.red,   border: `1px solid ${T.red}55` },
    primary: { bg: T.red,         fg: "#fff",  border: "none" },
  }[tone];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "4px 10px", borderRadius: 7, fontSize: 11.5, fontWeight: 600,
        cursor: disabled ? "wait" : "pointer", whiteSpace: "nowrap",
        background: palette.bg, color: palette.fg, border: palette.border,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  );
}

export function FriendsPanel() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("friends");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [f, r, b] = await Promise.all([
      getFriends(),
      getFriendRequests(),
      getBlockedUsers(),
    ]);
    // Surface the first failure rather than silently showing empty lists.
    const failure = f.error ?? r.error ?? b.error;
    if (failure) setError(failure);
    setFriends(f.data ?? []);
    setRequests(r.data ?? []);
    setBlocked(b.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function act(userId: string, fn: () => Promise<{ error?: string }>) {
    setBusyId(userId);
    setError(null);
    const res = await fn();
    setBusyId(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    load();
  }

  function handleBlock(userId: string, name: string) {
    if (!confirm(`Block ${name}? You'll be unfriended and won't see each other's posts.`)) return;
    act(userId, () => blockUser(userId));
  }

  function handleRemove(userId: string, name: string) {
    if (!confirm(`Remove ${name} from your friends?`)) return;
    act(userId, () => removeFriend(userId));
  }

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "friends",  label: "Friends",  count: friends.length },
    { id: "requests", label: "Requests", count: requests.length },
    { id: "blocked",  label: "Blocked",  count: blocked.length },
  ];

  const rowStyle: CSSProperties = {
    display: "flex", alignItems: "center", gap: 10,
    padding: "9px 0", borderBottom: `1px solid ${T.border}`,
  };

  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`,
      borderRadius: 14, padding: "16px 18px",
    }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "5px 11px", borderRadius: 20, border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: tab === t.id ? 700 : 500,
              background: tab === t.id ? `${T.red}14` : "transparent",
              color: tab === t.id ? T.red : T.text2,
            }}
          >
            {t.label}
            {t.count > 0 && (
              <span style={{
                marginLeft: 6, fontSize: 10.5, fontWeight: 700,
                padding: "1px 6px", borderRadius: 20,
                background: t.id === "requests" && t.count > 0 ? T.red : T.bg3,
                color: t.id === "requests" && t.count > 0 ? "#fff" : T.text2,
              }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" style={{ fontSize: 11.5, color: T.red, margin: "0 0 8px" }}>
          {error}
        </p>
      )}

      {loading ? (
        <p style={{ fontSize: 12, color: T.text2, margin: 0 }}>Loading…</p>
      ) : tab === "friends" ? (
        friends.length === 0 ? (
          <p style={{ fontSize: 12, color: T.text2, margin: 0 }}>
            No friends yet — tap someone&apos;s name in the campus feed to add them.
          </p>
        ) : (
          <div>
            {friends.map(f => (
              <div key={f.id} style={rowStyle}>
                <Avatar name={f.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    onClick={() => router.push(`/profile/${f.id}`)}
                    style={{
                      fontSize: 13, fontWeight: 600, color: T.text, margin: 0,
                      cursor: "pointer", overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                  >
                    {f.name}
                  </p>
                  {f.major && (
                    <p style={{ fontSize: 11, color: T.text2, margin: 0 }}>{f.major}</p>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <SmallButton
                    label="Remove"
                    disabled={busyId === f.id}
                    onClick={() => handleRemove(f.id, f.name)}
                  />
                  <SmallButton
                    label="Block"
                    tone="danger"
                    disabled={busyId === f.id}
                    onClick={() => handleBlock(f.id, f.name)}
                  />
                </div>
              </div>
            ))}
          </div>
        )
      ) : tab === "requests" ? (
        requests.length === 0 ? (
          <p style={{ fontSize: 12, color: T.text2, margin: 0 }}>No pending requests.</p>
        ) : (
          <div>
            {requests.map(r => (
              <div key={r.id} style={rowStyle}>
                <Avatar name={r.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: T.text, margin: 0 }}>
                    {r.name}
                  </p>
                  {r.major && (
                    <p style={{ fontSize: 11, color: T.text2, margin: 0 }}>{r.major}</p>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <SmallButton
                    label="Accept"
                    tone="primary"
                    disabled={busyId === r.id}
                    onClick={() => act(r.id, () => acceptFriendRequest(r.id))}
                  />
                  <SmallButton
                    label="Decline"
                    disabled={busyId === r.id}
                    onClick={() => act(r.id, () => removeFriend(r.id))}
                  />
                </div>
              </div>
            ))}
          </div>
        )
      ) : blocked.length === 0 ? (
        <p style={{ fontSize: 12, color: T.text2, margin: 0 }}>
          You haven&apos;t blocked anyone.
        </p>
      ) : (
        <div>
          {blocked.map(b => (
            <div key={b.id} style={rowStyle}>
              <Avatar name={b.name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: T.text, margin: 0 }}>
                  {b.name}
                </p>
                <p style={{ fontSize: 11, color: T.text2, margin: 0 }}>
                  Hidden from your feed
                </p>
              </div>
              <SmallButton
                label="Unblock"
                disabled={busyId === b.id}
                onClick={() => act(b.id, () => unblockUser(b.id))}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}