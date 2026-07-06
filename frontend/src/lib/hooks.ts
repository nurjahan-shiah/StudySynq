"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "./apiClient";

// ── inline types (avoids the ./types import that TS can't resolve yet) ────────

export type UserRole = "student" | "group_leader" | "admin";

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
}

export interface SessionWithGroup extends StudySession {
  group_name: string;
}

export interface SessionRSVP {
  id: string;
  session_id: string;
  user_id: string;
  status: "attending" | "not_attending" | "maybe";
  created_at: string;
}

export interface StudySessionDetail extends StudySession {
  attendees: SessionRSVP[];
}

export interface Resource {
  id: string;
  group_id: string;
  uploaded_by: string;
  file_name: string;
  file_url: string;
  file_type: string;
  created_at: string;
}

export interface ResourceWithGroup extends Resource {
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

export interface AuthUser {
  user_id: string;
  user_email: string;
  user_role: UserRole;
  user_name: string;
}

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

// ── Generic fetch hook ────────────────────────────────────────────────────────

function useFetch<T>(endpoint: string, skip = false) {
  const [data, setData]       = useState<T | null>(null);
  const [loading, setLoading] = useState(!skip);
  const [error, setError]     = useState<string | null>(null);

  const run = useCallback(async () => {
    if (skip) return;
    setLoading(true);
    setError(null);
    const res = await apiClient.get<T>(endpoint);
    if (res.error) setError(res.error);
    else           setData(res.data ?? null);
    setLoading(false);
  }, [endpoint, skip]);

  useEffect(() => { run(); }, [run]);
  return { data, loading, error, refetch: run };
}

// ── Profile ───────────────────────────────────────────────────────────────────

export function useProfile(userId: string) {
  return useFetch<UserProfile>(`/users/${userId}`, !userId);
}

// ── Enrolled courses ──────────────────────────────────────────────────────────

export function useEnrolledCourses(userId: string) {
  return useFetch<Course[]>(`/users/${userId}/enrollments`, !userId);
}

// ── My groups ─────────────────────────────────────────────────────────────────

export function useMyGroups(userId: string) {
  const [data, setData]       = useState<MyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) { setData([]); setError(null); setLoading(false); return; }
    setLoading(true);
    setError(null);

    const res = await apiClient.get<GroupDetail[]>("/groups");
    if (res.error) { setError(res.error); setLoading(false); return; }

    const results = await Promise.all(
      (res.data ?? []).map(async (g: GroupDetail) => {
        const m = await apiClient.get<GroupMember[]>(`/groups/${g.id}/members`);
        const me = (m.data ?? []).find((x: GroupMember) => x.user_id === userId);
        if (!me) return null;
        const row: MyGroup = { ...g, my_role: me.membership_role };
        return row;
      })
    );
    setData(results.filter((x): x is MyGroup => x !== null));
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, refetch: load };
}

// ── Single group + its members (US-E.2) ──────────────────────────────────────

export function useGroup(groupId: string) {
  return useFetch<GroupDetail>(`/groups/${groupId}`, !groupId);
}

export function useGroupMembers(groupId: string) {
  return useFetch<GroupMember[]>(`/groups/${groupId}/members`, !groupId);
}

// ── Announcements for a group (US-E.2) ───────────────────────────────────────

export function useGroupAnnouncements(groupId: string) {
  return useFetch<Announcement[]>(`/groups/${groupId}/announcements`, !groupId);
}

// ── Available groups ──────────────────────────────────────────────────────────

export function useAvailableGroups(userId: string) {
  const [data, setData]       = useState<GroupDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);

    const res = await apiClient.get<GroupDetail[]>("/groups");
    if (res.error) { setError(res.error); setLoading(false); return; }

    const results = await Promise.all(
      (res.data ?? []).map(async (g: GroupDetail) => {
        const m = await apiClient.get<GroupMember[]>(`/groups/${g.id}/members`);
        const isMember = (m.data ?? []).some((x: GroupMember) => x.user_id === userId);
        return isMember ? null : g;
      })
    );
    setData(results.filter((x): x is GroupDetail => x !== null));
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, refetch: load };
}

// ── Sessions across my groups ─────────────────────────────────────────────────

export function useMySessions(myGroups: MyGroup[]) {
  const [data, setData]       = useState<SessionWithGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!myGroups.length) { setData([]); setLoading(false); return; }
    setLoading(true);

    const all = await Promise.all(
      myGroups.map(async (g: MyGroup) => {
        const r = await apiClient.get<StudySession[]>(`/groups/${g.id}/sessions`);
        return (r.data ?? []).map((s: StudySession): SessionWithGroup => ({
          ...s,
          group_name: g.name,
        }));
      })
    );

    const flat = all.flat().sort(
      (a: SessionWithGroup, b: SessionWithGroup) =>
        new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    );
    setData(flat);
    setLoading(false);
  }, [myGroups]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, refetch: load };
}

// ── Resources across my groups ────────────────────────────────────────────────

export function useMyResources(myGroups: MyGroup[]) {
  const [data, setData]       = useState<ResourceWithGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!myGroups.length) { setData([]); setLoading(false); return; }
    setLoading(true);

    const all = await Promise.all(
      myGroups.map(async (g: MyGroup) => {
        const r = await apiClient.get<Resource[]>(`/groups/${g.id}/resources`);
        return (r.data ?? []).map((x: Resource): ResourceWithGroup => ({
          ...x,
          group_name: g.name,
        }));
      })
    );

    const flat = all.flat().sort(
      (a: ResourceWithGroup, b: ResourceWithGroup) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    setData(flat);
    setLoading(false);
  }, [myGroups]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, refetch: load };
}

// ── Recommendations ───────────────────────────────────────────────────────────

export function useRecommendations() {
  const [data, setData]       = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await apiClient.get<{ recommendations: Recommendation[] }>("/recommendations");
      if (r.error) setError(r.error);
      else         setData(r.data?.recommendations ?? []);
      setLoading(false);
    })();
  }, []);

  return { data, loading, error };
}

// ── Admin stats ───────────────────────────────────────────────────────────────

export function useAdminStats() {
  return useFetch<AdminStats>("/admin/stats");
}

// ── Sessions for a single group (US-C.3) ─────────────────────────────────────

export function useGroupSessions(groupId: string) {
  return useFetch<StudySession[]>(`/groups/${groupId}/sessions`, !groupId);
}

// ── Resources for a single group (US-D.1 / US-D.2) ───────────────────────────

export function useGroupResources(groupId: string) {
  return useFetch<Resource[]>(`/groups/${groupId}/resources`, !groupId);
}

// ── Session detail with attendees (US-C.5) ────────────────────────────────────

export function useSessionDetail(sessionId: string) {
  return useFetch<StudySessionDetail>(`/sessions/${sessionId}`, !sessionId);
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export const joinGroup   = (id: string) => apiClient.post(`/groups/${id}/join`, {});
export const leaveGroup  = (id: string) => apiClient.delete(`/groups/${id}/leave`);
export const rsvpSession = (sessionId: string, status: "attending" | "not_attending" | "maybe") =>
  apiClient.post<SessionRSVP>(`/sessions/${sessionId}/rsvp`, { status });

// US-C.1 @author: Uzma Alam
export const createSession = (groupId: string, data: {
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  location?: string;
  description?: string;
}) => apiClient.post(`/groups/${groupId}/sessions`, data);

// US-C.4 @author: Uzma Alam
export const updateSession = (sessionId: string, data: {
  title?: string;
  scheduled_at?: string;
  location?: string;
  description?: string;
}) => apiClient.put(`/sessions/${sessionId}`, data);

// US-C.4 @author: Uzma Alam
export const cancelSession = (sessionId: string) =>
  apiClient.patch(`/sessions/${sessionId}/cancel`, {});