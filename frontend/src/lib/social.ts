/**
 * frontend/src/lib/social.ts
 * API helpers + types for: profile completion, course requests,
 * major-based recommendations, the dashboard social feed, and the AI tutor.
 */

import { apiClient } from "./apiClient";

// ── Profile (Complete your profile) ──────────────────────────────────────────

export type PrivacyValue = "public" | "private";

export interface ProfilePrivacy {
  major?: PrivacyValue;
  year_of_study?: PrivacyValue;
  bio?: PrivacyValue;
  email?: PrivacyValue;
}

export interface FullProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
  major: string | null;
  year_of_study: string | null;
  bio: string | null;
  profile_privacy: ProfilePrivacy | null;
  profile_complete: boolean;
}

export const getMyProfile = (userId: string) =>
  apiClient.get<FullProfile>(`/users/${userId}`);

export const updateMyProfile = (
  userId: string,
  data: {
    major?: string;
    year_of_study?: string;
    bio?: string;
    profile_privacy?: ProfilePrivacy;
  }
) => apiClient.put<FullProfile>(`/users/${userId}`, data);

// ── Course requests ──────────────────────────────────────────────────────────

export interface CourseRequest {
  id: string;
  requested_by: string;
  requester_name: string;
  course_code: string;
  course_name: string;
  department: string;
  status: "pending" | "approved" | "rejected";
  reason: string | null;
  admin_note: string | null;
  created_at: string;
  resolved_at: string | null;
}

export const requestCourse = (data: {
  course_code: string;
  course_name: string;
  department: string;
  reason?: string;
}) => apiClient.post<CourseRequest>("/courses/requests", data);

export const listCourseRequests = (status?: string) =>
  apiClient.get<CourseRequest[]>(`/courses/requests${status ? `?status=${status}` : ""}`);

export const myCourseRequests = () =>
  apiClient.get<CourseRequest[]>("/courses/requests/mine");

export const approveCourseRequest = (id: string, admin_note?: string) =>
  apiClient.post<CourseRequest>(`/courses/requests/${id}/approve`, { admin_note });

export const rejectCourseRequest = (id: string, admin_note?: string) =>
  apiClient.post<CourseRequest>(`/courses/requests/${id}/reject`, { admin_note });

// ── Major-based recommendations ──────────────────────────────────────────────

export interface MajorRecommendationSession {
  id: string;
  title: string;
  scheduled_at: string;
  location: string | null;
}

export interface MajorRecommendation {
  group_id: string;
  name: string;
  description: string | null;
  member_count: number;
  course_codes: string[];
  year_match: boolean;
  match_pct: number;
  already_joined: boolean;
  upcoming_sessions: MajorRecommendationSession[];
}

export interface MajorRecommendationsResponse {
  profile_complete: boolean;
  /** True for admin accounts: this feature is student-scoped, so the UI
   *  should explain that rather than prompt for a major/year. */
  not_applicable: boolean;
  reason?: string;
  major: string | null;
  year_of_study: string | null;
  total: number;
  limit: number;
  offset: number;
  recommendations: MajorRecommendation[];
}

export const getMajorRecommendations = (opts?: {
  limit?: number;
  offset?: number;
  includeJoined?: boolean;
}) => {
  const params = new URLSearchParams();
  if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts?.offset !== undefined) params.set("offset", String(opts.offset));
  if (opts?.includeJoined !== undefined) params.set("include_joined", String(opts.includeJoined));
  const qs = params.toString();
  return apiClient.get<MajorRecommendationsResponse>(
    `/recommendations/major${qs ? `?${qs}` : ""}`
  );
};

// ── Social feed ──────────────────────────────────────────────────────────────

export interface Post {
  id: string;
  author_id: string;
  author_name: string;
  author_group: string | null;
  group_id: string | null;
  group_name: string | null;
  content: string;
  created_at: string;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  is_mine: boolean;
}

export interface PostComment {
  id: string;
  post_id: string;
  author_id: string;
  author_name: string;
  content: string;
  created_at: string;
}

export interface UserCard {
  id: string;
  name: string;
  major: string | null;
  year_of_study: string | null;
  bio: string | null;
  email: string | null;
  groups: string[];
  friend_status: "none" | "pending_out" | "pending_in" | "friends" | "self";
}

export const getFeed = (limit = 30) =>
  apiClient.get<Post[]>(`/social/feed?limit=${limit}`);

export const createPost = (content: string, group_id?: string) =>
  apiClient.post<Post>("/social/posts", { content, group_id: group_id || undefined });

export const deletePost = (postId: string) =>
  apiClient.delete(`/social/posts/${postId}`);

export const toggleLike = (postId: string) =>
  apiClient.post<{ liked: boolean; like_count: number }>(`/social/posts/${postId}/like`, {});

export const getComments = (postId: string) =>
  apiClient.get<PostComment[]>(`/social/posts/${postId}/comments`);

export const addComment = (postId: string, content: string) =>
  apiClient.post<PostComment>(`/social/posts/${postId}/comments`, { content });

export const getUserCard = (userId: string) =>
  apiClient.get<UserCard>(`/social/users/${userId}/card`);

export const sendFriendRequest = (userId: string) =>
  apiClient.post<{ status: string }>(`/social/friends/${userId}`, {});

export const acceptFriendRequest = (userId: string) =>
  apiClient.post<{ status: string }>(`/social/friends/${userId}/accept`, {});

// ── Friend management ────────────────────────────────────────────────────────

export interface Friend {
  id: string;
  name: string;
  major: string | null;
  friends_since: string | null;
}

export interface FriendRequest {
  id: string;
  name: string;
  major: string | null;
  requested_at: string | null;
}

export interface BlockedUser {
  id: string;
  name: string;
  blocked_at: string | null;
}

export const getFriends = () =>
  apiClient.get<Friend[]>("/social/friends");

export const getFriendRequests = () =>
  apiClient.get<FriendRequest[]>("/social/friends/requests");

export const getBlockedUsers = () =>
  apiClient.get<BlockedUser[]>("/social/friends/blocked");

/** Unfriend, withdraw a sent request, or decline a received one. */
export const removeFriend = (userId: string) =>
  apiClient.delete(`/social/friends/${userId}`);

export const blockUser = (userId: string) =>
  apiClient.post<{ status: string }>(`/social/friends/${userId}/block`, {});

export const unblockUser = (userId: string) =>
  apiClient.delete(`/social/friends/${userId}/block`);

// ── AI Study Assistant ───────────────────────────────────────────────────────

export interface TutorMessage {
  role: "user" | "assistant";
  content: string;
}

export const askTutor = (messages: TutorMessage[], mode: "chat" | "quiz" = "chat") =>
  apiClient.post<{ reply: string; note?: string }>("/resources/ai-tutor", { messages, mode });