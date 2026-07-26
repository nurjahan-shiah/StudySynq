"use client";

import { useGroupActivity, type GroupActivity } from "@/lib/hooks";

const T = {
  card: "var(--card-bg)",
  bg3: "var(--bg3)",
  border: "var(--border)",
  text: "var(--text)",
  text2: "var(--text2)",
  red: "var(--ss-red)",
} as const;

const EVENT_STYLE: Record<GroupActivity["type"], { icon: string; label: string }> = {
  member_joined: { icon: "👤", label: "Member" },
  session_created: { icon: "◷", label: "Session" },
  resource_uploaded: { icon: "↓", label: "Resource" },
  announcement_posted: { icon: "!", label: "Announcement" },
};

function formatActivityDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function GroupActivityFeed({ groupId }: { groupId: string }) {
  const { data, loading, error, refetch } = useGroupActivity(groupId);
  const events = data ?? [];

  return (
    <section style={{ maxWidth: 720 }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, marginBottom: 16,
      }}>
        <div>
          <h2 style={{ margin: "0 0 4px", color: T.text, fontSize: 16, fontWeight: 700 }}>
            Group activity
          </h2>
          <p style={{ margin: 0, color: T.text2, fontSize: 12 }}>
            Member joins, sessions, resources, and announcements in one timeline.
          </p>
        </div>
        <button onClick={() => refetch()} disabled={loading} style={{
          padding: "7px 12px", borderRadius: 8, border: `1px solid ${T.border}`,
          background: T.card, color: T.text2, fontSize: 12, fontWeight: 600,
          cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1,
        }}>
          Refresh
        </button>
      </div>

      {loading && events.length === 0 ? (
        <p style={{ color: T.text2, fontSize: 13 }}>Loading activity…</p>
      ) : error ? (
        <div role="alert" style={{
          padding: 14, borderRadius: 10, border: `1px solid ${T.red}40`,
          background: `color-mix(in srgb, ${T.red} 7%, transparent)`,
          color: T.red, fontSize: 13,
        }}>
          {error}
        </div>
      ) : events.length === 0 ? (
        <div style={{
          padding: "34px 20px", textAlign: "center", borderRadius: 12,
          border: `1px solid ${T.border}`, background: T.card, color: T.text2,
        }}>
          <div aria-hidden="true" style={{ fontSize: 24, marginBottom: 8 }}>◷</div>
          <p style={{ margin: 0, fontSize: 13 }}>No group activity yet.</p>
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <div aria-hidden="true" style={{
            position: "absolute", left: 18, top: 18, bottom: 18,
            width: 1, background: T.border,
          }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {events.map((event) => {
              const eventStyle = EVENT_STYLE[event.type];
              const isExternal = Boolean(event.target_url?.startsWith("http"));
              return (
                <article key={event.id} style={{
                  position: "relative", display: "flex", gap: 12,
                  padding: "13px 14px 13px 10px", borderRadius: 12,
                  border: `1px solid ${T.border}`, background: T.card,
                }}>
                  <div aria-hidden="true" style={{
                    zIndex: 1, flex: "0 0 36px", height: 36, borderRadius: 10,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: `color-mix(in srgb, ${T.red} 9%, ${T.bg3})`,
                    color: T.red, fontSize: 14, fontWeight: 800,
                    border: `1px solid ${T.border}`,
                  }}>
                    {eventStyle.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: "flex", alignItems: "flex-start",
                      justifyContent: "space-between", gap: 12,
                    }}>
                      <div>
                        <p style={{
                          margin: "0 0 3px", color: T.text,
                          fontSize: 13, fontWeight: 650,
                        }}>
                          {event.title}
                        </p>
                        <p style={{ margin: 0, color: T.text2, fontSize: 11 }}>
                          {eventStyle.label} · {event.actor_name} · {formatActivityDate(event.occurred_at)}
                        </p>
                      </div>
                      {event.target_url && (
                        <a
                          href={event.target_url}
                          target={isExternal ? "_blank" : undefined}
                          rel={isExternal ? "noopener noreferrer" : undefined}
                          style={{
                            flexShrink: 0, color: T.red, fontSize: 11,
                            fontWeight: 650, textDecoration: "none",
                          }}
                        >
                          View
                        </a>
                      )}
                    </div>
                    {event.description && (
                      <p style={{
                        margin: "8px 0 0", color: T.text2, fontSize: 12,
                        lineHeight: 1.5, overflow: "hidden",
                        display: "-webkit-box", WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}>
                        {event.description}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
