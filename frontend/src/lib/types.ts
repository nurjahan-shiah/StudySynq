export type UserRole = "student" | "group_leader" | "admin";

export interface AuthUser {
  user_id: string;
  user_email: string;
  user_role: UserRole;
  user_name: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export interface Course {
  id: string;
  course_code: string;
  course_name: string;
  department: string;
}

export interface GroupDetail {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_by: string;
  created_at: string;
  member_count: number;
  course_codes: string[];
}

export interface GroupMember {
  user_id: string;
  user_name: string;
  user_email: string;
  membership_role: "member" | "leader";
}

export interface MyGroup extends GroupDetail {
  my_role: "member" | "leader";
}

export interface StudySession {
  id: string;
  group_id: string;
  title: string;
  scheduled_at: string;
  location: string | null;
  description: string | null;
  created_by: string;
  created_at: string;
  group_name: string;
}

export interface Resource {
  id: string;
  group_id: string;
  uploaded_by: string;
  file_name: string;
  file_url: string;
  file_type: string;
  created_at: string;
  group_name: string;
}

export interface Recommendation {
  group_id: string;
  name: string;
  score: number;
  course_codes?: string[];
}

export interface AdminStats {
  total_users: number;
  total_groups: number;
  total_sessions: number;
  total_resources: number;
}

// US-E.1 — Notification Centre
export type NotificationType =
  | "session"
  | "announcement"
  | "task"
  | "resource"
  | "system";

export interface Notification {
  id: string;
  user_id: string;
  group_id: string | null;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
  metadata?: Record<string, unknown> | null;
}

export interface UnreadCount {
  unread_count: number;
}

// US-E.2 — Announcement Board
export interface Announcement {
  id: string;
  group_id: string;
  author_id: string;
  author_name: string;
  title: string;
  message: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}