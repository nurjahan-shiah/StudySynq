"use client";

/**
 * SocialFeed — Reddit/Discord-style column on the dashboard.
 * Post, like, comment; usernames are clickable (mini profile card + Add friend);
 * each post shows which group the author is from.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addComment,
  createPost,
  deletePost,
  getComments,
  getFeed,
  getUserCard,
  sendFriendRequest,
  acceptFriendRequest,
  toggleLike,
  type Post,
  type PostComment,
  type UserCard,
} from "@/lib/social";
import type { MyGroup } from "@/lib/hooks";

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

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso + (iso.endsWith("Z") ? "" : "Z")).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── Mini profile popover (clickable username) ────────────────────────────────

function UserCardPopover({
  userId, onClose,
}: { userId: string; onClose: () => void }) {
  const [card, setCard] = useState<UserCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [friendBusy, setFriendBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    getUserCard(userId).then(res => {
      if (cancelled) return;
      if (res.error || !res.data) setError(res.error ?? "Couldn't load profile");
      else setCard(res.data);
    });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose]);

  async function handleFriend() {
    if (!card) return;
    setFriendBusy(true);
    const res = card.friend_status === "pending_in"
      ? await acceptFriendRequest(card.id)
      : await sendFriendRequest(card.id);
    setFriendBusy(false);
    if (!res.error && res.data) {
      setCard({ ...card, friend_status: res.data.status as UserCard["friend_status"] });
    }
  }

  const friendLabel: Record<string, string> = {
    none: "+ Add friend",
    pending_out: "Request sent ✓",
    pending_in: "Accept request",
    friends: "Friends ✓",
  };

  return (
    <div
      ref={ref}
      style={{
        position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 60,
        width: 260, background: T.bg2, border: `1px solid ${T.border}`,
        borderRadius: 12, padding: "14px 16px", boxShadow: "0 10px 30px rgba(0,0,0,.3)",
      }}
    >
      {error ? (
        <p style={{ fontSize: 12, color: T.red, margin: 0 }}>{error}</p>
      ) : !card ? (
        <p style={{ fontSize: 12, color: T.text2, margin: 0 }}>Loading…</p>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%", background: T.red, color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 15, fontWeight: 700, flexShrink: 0,
            }}>
              {card.name[0]?.toUpperCase() ?? "?"}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: T.text, margin: 0 }}>{card.name}</p>
              {(card.major || card.year_of_study) && (
                <p style={{ fontSize: 11, color: T.text2, margin: 0 }}>
                  {[card.major, card.year_of_study].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          </div>

          {card.bio && (
            <p style={{ fontSize: 11.5, color: T.text2, margin: "0 0 8px", lineHeight: 1.5 }}>{card.bio}</p>
          )}
          {card.email && (
            <p style={{ fontSize: 11, color: T.text2, margin: "0 0 8px" }}>✉ {card.email}</p>
          )}
          {card.groups.length > 0 && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
              {card.groups.map(g => (
                <span key={g} style={{
                  fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                  background: T.bg3, border: `1px solid ${T.border}`, color: T.text2,
                }}>
                  {g}
                </span>
              ))}
            </div>
          )}

          {card.friend_status !== "self" && (
            <button
              onClick={handleFriend}
              disabled={friendBusy || card.friend_status === "friends" || card.friend_status === "pending_out"}
              style={{
                width: "100%", padding: "7px 0", borderRadius: 8, fontSize: 12, fontWeight: 700,
                border: "none",
                background: card.friend_status === "friends" ? T.bg3 : T.red,
                color: card.friend_status === "friends" ? T.green : "#fff",
                cursor: friendBusy ? "wait" : "pointer",
                opacity: friendBusy ? 0.7 : 1,
              }}
            >
              {friendBusy ? "…" : friendLabel[card.friend_status]}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Clickable username ───────────────────────────────────────────────────────

function AuthorName({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: "none", border: "none", padding: 0, cursor: "pointer",
          fontSize: 12.5, fontWeight: 800, color: T.text,
        }}
        onMouseEnter={e => { e.currentTarget.style.color = T.red; }}
        onMouseLeave={e => { e.currentTarget.style.color = T.text; }}
      >
        {name}
      </button>
      {open && <UserCardPopover userId={userId} onClose={() => setOpen(false)} />}
    </span>
  );
}

// ── Comments ─────────────────────────────────────────────────────────────────

function Comments({ postId, onCountChange }: { postId: string; onCountChange: (n: number) => void }) {
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    const res = await getComments(postId);
    setComments(res.data ?? []);
    setLoading(false);
  }, [postId]);

  useEffect(() => { load(); }, [load]);

  async function submit() {
    const content = draft.trim();
    if (!content || posting) return;
    setPosting(true);
    const res = await addComment(postId, content);
    setPosting(false);
    if (!res.error && res.data) {
      const next = [...comments, res.data];
      setComments(next);
      onCountChange(next.length);
      setDraft("");
    }
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
      {loading ? (
        <p style={{ fontSize: 11.5, color: T.text2, margin: 0 }}>Loading comments…</p>
      ) : (
        comments.map(c => (
          <div key={c.id} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%", background: T.bg3,
              border: `1px solid ${T.border}`, display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 10, fontWeight: 700, color: T.text2, flexShrink: 0,
            }}>
              {c.author_name[0]?.toUpperCase() ?? "?"}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: 11.5, margin: 0, lineHeight: 1.45, color: T.text }}>
                <AuthorName userId={c.author_id} name={c.author_name} />
                <span style={{ color: T.text2, fontWeight: 400, marginLeft: 6, fontSize: 10.5 }}>{timeAgo(c.created_at)}</span>
              </p>
              <p style={{ fontSize: 12, color: T.text, margin: "2px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {c.content}
              </p>
            </div>
          </div>
        ))
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") submit(); }}
          placeholder="Write a comment…"
          className="ss-input"
          style={{ flex: 1, fontSize: 12, padding: "7px 10px" }}
        />
        <button
          onClick={submit}
          disabled={posting || !draft.trim()}
          style={{
            padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
            border: "none", background: T.red, color: "#fff",
            cursor: "pointer", opacity: posting || !draft.trim() ? 0.5 : 1,
          }}
        >
          Reply
        </button>
      </div>
    </div>
  );
}

// ── Post card ────────────────────────────────────────────────────────────────

function PostCard({ post, onDeleted }: { post: Post; onDeleted: (id: string) => void }) {
  const [liked, setLiked] = useState(post.liked_by_me);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [showComments, setShowComments] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);

  async function handleLike() {
    if (likeBusy) return;
    setLikeBusy(true);
    // optimistic
    setLiked(l => !l);
    setLikeCount(n => n + (liked ? -1 : 1));
    const res = await toggleLike(post.id);
    setLikeBusy(false);
    if (res.error) {
      setLiked(post.liked_by_me);
      setLikeCount(post.like_count);
    } else if (res.data) {
      setLiked(res.data.liked);
      setLikeCount(res.data.like_count);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this post?")) return;
    const res = await deletePost(post.id);
    if (!res.error) onDeleted(post.id);
  }

  const groupTag = post.group_name ?? post.author_group;

  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: 12,
      padding: "12px 14px", marginBottom: 10,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%", background: T.red, color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700, flexShrink: 0,
        }}>
          {post.author_name[0]?.toUpperCase() ?? "?"}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <AuthorName userId={post.author_id} name={post.author_name} />
            {groupTag && (
              <span style={{
                fontSize: 9.5, fontWeight: 700, padding: "1px 8px", borderRadius: 20,
                background: `${T.blue}1a`, color: T.blue, letterSpacing: "0.02em",
              }}>
                {post.group_name ? `in ${post.group_name}` : `from ${post.author_group}`}
              </span>
            )}
            <span style={{ fontSize: 10.5, color: T.text2 }}>{timeAgo(post.created_at)}</span>
          </div>
          <p style={{ fontSize: 13, color: T.text, margin: "5px 0 0", lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {post.content}
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 8 }}>
            <button
              onClick={handleLike}
              style={{
                display: "flex", alignItems: "center", gap: 5, background: "none", border: "none",
                cursor: "pointer", fontSize: 12, fontWeight: 700,
                color: liked ? T.red : T.text2, padding: 0,
              }}
            >
              {liked ? "♥" : "♡"} {likeCount}
            </button>
            <button
              onClick={() => setShowComments(s => !s)}
              style={{
                display: "flex", alignItems: "center", gap: 5, background: "none", border: "none",
                cursor: "pointer", fontSize: 12, fontWeight: 700, color: T.text2, padding: 0,
              }}
            >
              💬 {commentCount}
            </button>
            {post.is_mine && (
              <button
                onClick={handleDelete}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: T.text2, padding: 0, marginLeft: "auto" }}
                onMouseEnter={e => { e.currentTarget.style.color = T.red; }}
                onMouseLeave={e => { e.currentTarget.style.color = T.text2; }}
              >
                Delete
              </button>
            )}
          </div>

          {showComments && <Comments postId={post.id} onCountChange={setCommentCount} />}
        </div>
      </div>
    </div>
  );
}

// ── Composer + feed ──────────────────────────────────────────────────────────

export function SocialFeed({ myGroups }: { myGroups: MyGroup[] }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [groupId, setGroupId] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getFeed(30);
    if (res.error) setError(res.error);
    else setPosts(res.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // keep the feed fresh
    return () => clearInterval(t);
  }, [load]);

  async function submit() {
    const content = draft.trim();
    if (!content || posting) return;
    setPosting(true);
    setPostError(null);
    const res = await createPost(content, groupId || undefined);
    setPosting(false);
    if (res.error || !res.data) {
      // Previously this branch did nothing at all, so a failed post looked
      // like a dead button with no explanation.
      setPostError(res.error ?? "Couldn't publish your post. Please try again.");
      return;
    }
    setPosts(p => [res.data!, ...p]);
    setDraft("");
    setGroupId("");
  }

  return (
    <div>
      {/* Composer */}
      <div style={{
        background: T.card, border: `1px solid ${T.border}`, borderRadius: 12,
        padding: "12px 14px", marginBottom: 14,
      }}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value.slice(0, 4000))}
          placeholder="Share something with campus — a question, a win, a study tip…"
          rows={2}
          className="ss-input"
          style={{ width: "100%", resize: "vertical", fontSize: 13, fontFamily: "inherit" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <select
            value={groupId}
            onChange={e => setGroupId(e.target.value)}
            className="ss-input"
            style={{ fontSize: 11.5, padding: "6px 8px", maxWidth: 190 }}
          >
            <option value="">No group tag</option>
            {myGroups.map(g => <option key={g.id} value={g.id}>in {g.name}</option>)}
          </select>
          <button
            onClick={submit}
            disabled={posting || !draft.trim()}
            className="ss-btn-primary"
            style={{ marginLeft: "auto", padding: "7px 18px", fontSize: 12.5, opacity: posting || !draft.trim() ? 0.5 : 1 }}
          >
            {posting ? "Posting…" : "Post"}
          </button>
        </div>
        {postError && (
          <p role="alert" style={{ fontSize: 12, color: T.red, margin: "8px 0 0", lineHeight: 1.45 }}>
            {postError}
          </p>
        )}
      </div>

      {/* Feed */}
      {loading ? (
        <p style={{ fontSize: 12.5, color: T.text2 }}>Loading the feed…</p>
      ) : error ? (
        <p style={{ fontSize: 12.5, color: T.red }}>Couldn&apos;t load the feed: {error}</p>
      ) : posts.length === 0 ? (
        <div style={{ textAlign: "center", padding: "36px 10px", color: T.text2 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>💬</div>
          <p style={{ fontSize: 13, margin: 0 }}>Nothing here yet — be the first to post!</p>
        </div>
      ) : (
        posts.map(p => (
          <PostCard key={p.id} post={p} onDeleted={id => setPosts(ps => ps.filter(x => x.id !== id))} />
        ))
      )}
    </div>
  );
}

export default SocialFeed;
