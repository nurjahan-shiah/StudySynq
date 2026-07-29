"""
StudySynq - minimal integration tests, one or two per feature.

Coverage map (service -> tests):
  auth-service            TestAuth
  api-gateway (RBAC)      TestGatewayRBAC
  groups-service          TestGroups
  sessions-service        TestSessions
  tasks-service           TestTasks
  announcements-service   TestAnnouncements
  resources-service       TestResources
  notifications-service   TestNotifications
  users-service (prefs)   TestPreferences
  social-service          TestSocial
  admin-service           TestAdminModeration (needs admin creds, else skipped)
  courses-service         TestCourses
  health/dashboard        TestHealth
"""
import time
import uuid

import requests

from conftest import BASE_URL, PASSWORD, TS, auth, register


# ---------------------------------------------------------------- auth-service
class TestAuth:
    def test_valid_login_returns_token(self, leader):
        r = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": leader["email"], "password": PASSWORD},
            timeout=30,
        )
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_invalid_login_rejected(self, leader):
        r = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": leader["email"], "password": "wrong-password"},
            timeout=30,
        )
        assert r.status_code in (400, 401, 403)


# ------------------------------------------------------------------ api-gateway
class TestGatewayRBAC:
    def test_protected_route_blocks_missing_token(self, group):
        r = requests.get(f"{BASE_URL}/groups/{group}/members", timeout=30)
        assert r.status_code in (401, 403)

    def test_protected_route_allows_valid_token(self, group, member):
        r = requests.get(f"{BASE_URL}/groups/{group}/members", headers=auth(member), timeout=30)
        assert r.status_code == 200
        assert member["email"] in r.text

    def test_member_cannot_do_leader_only_action(self, group, member, outsider):
        r = requests.post(
            f"{BASE_URL}/groups/{group}/members",
            json={"user_email": outsider["email"], "membership_role": "member"},
            headers=auth(member),
            timeout=30,
        )
        assert r.status_code in (401, 403)


# --------------------------------------------------------------- groups-service
class TestGroups:
    def test_create_and_get_group(self, group, leader):
        r = requests.get(f"{BASE_URL}/groups/{group}", headers=auth(leader), timeout=30)
        assert r.status_code == 200
        assert r.json()["id"] == group

    def test_duplicate_join_rejected(self, group, member):
        r = requests.post(f"{BASE_URL}/groups/{group}/join", headers=auth(member), timeout=30)
        assert r.status_code in (400, 409)

    def test_get_nonexistent_group_404(self, leader):
        r = requests.get(
            f"{BASE_URL}/groups/00000000-0000-0000-0000-000000000000",
            headers=auth(leader),
            timeout=30,
        )
        assert r.status_code == 404


# -------------------------------------------------------------- sessions-service
class TestSessions:
    def test_leader_schedules_session(self, group, leader):
        r = requests.post(
            f"{BASE_URL}/groups/{group}/sessions",
            json={"title": "Pytest Session", "scheduled_at": "2026-12-01T10:00:00Z", "duration_minutes": 60},
            headers=auth(leader),
            timeout=30,
        )
        assert r.status_code in (200, 201), r.text
        TestSessions.session_id = r.json()["id"]

    def test_past_session_rejected(self, group, leader):
        r = requests.post(
            f"{BASE_URL}/groups/{group}/sessions",
            json={"title": "Past Session", "scheduled_at": "2020-01-01T10:00:00Z", "duration_minutes": 60},
            headers=auth(leader),
            timeout=30,
        )
        assert r.status_code in (400, 422)

    def test_member_rsvp(self, group, member):
        r = requests.post(
            f"{BASE_URL}/sessions/{TestSessions.session_id}/rsvp",
            headers=auth(member),
            timeout=30,
        )
        assert r.status_code in (200, 201)

    def test_cancel_session(self, leader):
        r = requests.patch(
            f"{BASE_URL}/sessions/{TestSessions.session_id}/cancel",
            headers=auth(leader),
            timeout=30,
        )
        assert r.status_code == 200


# ----------------------------------------------------------------- tasks-service
class TestTasks:
    def test_leader_assigns_task(self, group, leader, member):
        r = requests.post(
            f"{BASE_URL}/groups/{group}/tasks",
            json={
                "title": "Pytest Task",
                "description": "minimal test",
                "priority": "high",
                "due_date": "2030-07-10",
                "assigned_to": member["id"],
            },
            headers=auth(leader),
            timeout=30,
        )
        assert r.status_code in (200, 201), r.text
        TestTasks.task_id = r.json()["id"]

    def test_assignee_marks_done(self, member):
        r = requests.patch(
            f"{BASE_URL}/tasks/{TestTasks.task_id}/status",
            json={"status": "done"},
            headers=auth(member),
            timeout=30,
        )
        assert r.status_code == 200

    def test_non_assignee_blocked_from_status_change(self, outsider):
        r = requests.patch(
            f"{BASE_URL}/tasks/{TestTasks.task_id}/status",
            json={"status": "in_progress"},
            headers=auth(outsider),
            timeout=30,
        )
        assert r.status_code in (401, 403)


# --------------------------------------------------------- announcements-service
class TestAnnouncements:
    def test_leader_posts_announcement(self, group, leader):
        r = requests.post(
            f"{BASE_URL}/groups/{group}/announcements",
            json={"title": "Pytest announcement", "message": "hello", "is_pinned": True},
            headers=auth(leader),
            timeout=30,
        )
        assert r.status_code in (200, 201), r.text
        TestAnnouncements.ann_id = r.json()["id"]

    def test_member_cannot_post_announcement(self, group, member):
        r = requests.post(
            f"{BASE_URL}/groups/{group}/announcements",
            json={"title": "Sneaky", "message": "blocked", "is_pinned": False},
            headers=auth(member),
            timeout=30,
        )
        assert r.status_code in (401, 403)

    def test_members_can_read_announcements(self, group, member):
        r = requests.get(f"{BASE_URL}/groups/{group}/announcements", headers=auth(member), timeout=30)
        assert r.status_code == 200
        assert "Pytest announcement" in r.text


# ------------------------------------------------------------- resources-service
class TestResources:
    def test_member_uploads_resource_metadata(self, group, member):
        r = requests.post(
            f"{BASE_URL}/groups/{group}/resources",
            params={
                "file_name": f"pytest-notes-{TS}.pdf",
                "file_url": f"https://example.com/pytest-notes-{TS}.pdf",
                "file_type": "pdf",
            },
            headers=auth(member),
            timeout=30,
        )
        assert r.status_code in (200, 201), r.text
        TestResources.res_id = r.json()["id"]

    def test_group_resources_listed(self, group, leader):
        r = requests.get(f"{BASE_URL}/groups/{group}/resources", headers=auth(leader), timeout=30)
        assert r.status_code == 200
        assert f"pytest-notes-{TS}.pdf" in r.text

    def test_outsider_cannot_list_group_resources(self, group, outsider):
        r = requests.get(f"{BASE_URL}/groups/{group}/resources", headers=auth(outsider), timeout=30)
        assert r.status_code in (401, 403)


# ---------------------------------------------------------- notifications-service
class TestNotifications:
    def test_unread_count_endpoint(self, member):
        r = requests.get(
            f"{BASE_URL}/notifications/{member['id']}/unread-count",
            headers=auth(member),
            timeout=30,
        )
        assert r.status_code == 200

    def test_notifications_list_and_read_all(self, member):
        lst = requests.get(f"{BASE_URL}/notifications/{member['id']}", headers=auth(member), timeout=30)
        assert lst.status_code == 200
        mark = requests.patch(
            f"{BASE_URL}/notifications/{member['id']}/read-all",
            headers=auth(member),
            timeout=30,
        )
        assert mark.status_code == 200
        count = requests.get(
            f"{BASE_URL}/notifications/{member['id']}/unread-count",
            headers=auth(member),
            timeout=30,
        ).json()
        assert count.get("unread_count", count.get("count", 0)) == 0


# ------------------------------------------------------ users-service preferences
class TestPreferences:
    def test_get_and_update_notification_preferences(self, member):
        g = requests.get(
            f"{BASE_URL}/notification-preferences/{member['id']}",
            headers=auth(member),
            timeout=30,
        )
        assert g.status_code == 200
        u = requests.patch(
            f"{BASE_URL}/notification-preferences/{member['id']}",
            json={"announcements_enabled": False},
            headers=auth(member),
            timeout=30,
        )
        assert u.status_code == 200


# ---------------------------------------------------------------- social-service
class TestSocial:
    def test_friend_request_and_accept(self):
        a = register("Py Social A", f"py_social_a_{TS}@yorku.ca", "student")
        b = register("Py Social B", f"py_social_b_{TS}@yorku.ca", "student")
        req = requests.post(f"{BASE_URL}/social/friends/{a['id']}", headers=auth(b), timeout=30)
        assert req.status_code in (200, 201), req.text
        acc = requests.post(f"{BASE_URL}/social/friends/{b['id']}/accept", headers=auth(a), timeout=30)
        assert acc.status_code in (200, 201), acc.text


# ----------------------------------------------------------------- admin-service
class TestAdminModeration:
    """Requires an admin account. Set STUDYSYNQ_ADMIN_EMAIL / STUDYSYNQ_ADMIN_PASSWORD
    env vars to enable; otherwise these tests are skipped."""

    @staticmethod
    def _admin_headers():
        import os
        import pytest as _pytest

        email = os.environ.get("STUDYSYNQ_ADMIN_EMAIL")
        password = os.environ.get("STUDYSYNQ_ADMIN_PASSWORD")
        if not email:
            _pytest.skip("No admin credentials provided (STUDYSYNQ_ADMIN_EMAIL/PASSWORD)")
        r = requests.post(
            f"{BASE_URL}/auth/login", json={"email": email, "password": password}, timeout=30
        )
        assert r.status_code == 200, "Admin login failed"
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    def test_student_blocked_from_admin_endpoints(self, member):
        r = requests.get(f"{BASE_URL}/admin/moderation/groups", headers=auth(member), timeout=30)
        assert r.status_code in (401, 403)

    def test_admin_can_view_moderation_groups(self):
        r = requests.get(f"{BASE_URL}/admin/moderation/groups", headers=self._admin_headers(), timeout=30)
        assert r.status_code == 200

    def test_admin_analytics_overview(self):
        r = requests.get(f"{BASE_URL}/admin/analytics/overview", headers=self._admin_headers(), timeout=30)
        assert r.status_code == 200

    def test_admin_audit_logs(self):
        r = requests.get(f"{BASE_URL}/admin/moderation/audit-logs", headers=self._admin_headers(), timeout=30)
        assert r.status_code == 200


# ---------------------------------------------------------------- courses-service
class TestCourses:
    def test_admin_courses_blocked_for_students(self, member):
        r = requests.get(f"{BASE_URL}/admin/courses", headers=auth(member), timeout=30)
        assert r.status_code in (401, 403)


# -------------------------------------------------------------- health/dashboard
class TestHealth:
    def test_all_services_healthy(self, leader):
        r = requests.get(f"{BASE_URL}/health/services", headers=auth(leader), timeout=60)
        assert r.status_code == 200