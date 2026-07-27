# New features (this drop)

## 1. Courses tab
- Course codes are validated to the York format (`EECS 4314`); `eecs4314` is auto-normalized. Duplicates are still rejected by the unique constraint.
- **Course requests**: students hit "+ Request a course" (Browse tab or the new Requests tab). All admins get a live notification. Admins see a "Course requests" tab with Approve/Reject; approving creates the course and notifies the student "request accepted", rejecting notifies "request rejected". Notification links deep-link to `/courses?tab=requests`.
- Backend: `CourseRequest` model + `POST /courses/requests`, `GET /courses/requests` (admin), `GET /courses/requests/mine`, `POST /courses/requests/{id}/approve|reject`.

## 2. Recommended tab
- New "For your major" section (view only): `GET /recommendations/major` matches public groups whose `intended_major` equals the user's major, ranked with year-fit first (course level 4xxx ↔ "4th year", badge "Your year").
- If major/year aren't set, the section shows "Complete setting up your profile to see recommendations" with a button that opens the profile modal.

## 3. Complete your profile
- New "Complete your profile" entry in the right profile panel, above Appearance.
- Modal: year of study, major (full York list), bio — each with its own Public/Private toggle (email visibility too).
- Backend: `major`, `year_of_study`, `bio`, `profile_privacy` (JSONB) on `users`, applied via idempotent `run_light_migrations()` at service startup (create_all never ALTERs). `GET /users/{id}` returns the full profile to self/admin and only public fields to everyone else; `PUT /users/{id}` saves the new fields.

## 4. Dashboard social feed
- Dashboard is now two columns: **Campus feed** (left) and the existing workspace panels (right).
- Feed: post (optionally tagged with one of your groups), like (toggle), comment, delete your own posts. Each post shows which group the author is from. Usernames are clickable → mini profile card (privacy-filtered) with **Add friend** (request → notification → accept flow).
- New microservice: `services/social-service` (port 8012), wired into the API gateway (`/social`), `docker-compose-microservices.yml`, and `render.yaml`. Models: `Post`, `PostComment`, `PostLike`, `Friendship`.

## 5. AI Study Assistant (Resources tab)
- Collapsible chat panel at the top of Resources: explains concepts, works through problems, and has a **Quiz mode** (one question at a time, graded, running score). Personalized with the student's enrolled courses.
- Backend: `POST /resources/ai-tutor` using the existing Groq/Llama setup (`GROQ_API_KEY`, also added to the Render resources block). Graceful fallback message when the key is unset.

## Deploy notes
- Rebuild all backend images (shared/ changed): `docker compose -f docker-compose-microservices.yml up --build`.
- The `users` table columns are added automatically on first startup of users/courses/recommendations/social services.
- On Render: re-sync the blueprint to pick up `studysynq-social` and the gateway's `SOCIAL_SERVICE_URL`.

---

# Second drop: York catalogue + group session/section

## Courses: full identifiers + seeded York catalogue
- `Course` now carries **faculty**, **code** (`EECS 4413`), **name**, and **year level** (derived from the code's first digit: `4413` → Year 4, capped at 5 for grad). Columns added via the same light-migration path.
- York's course website (w2prod.sis.yorku.ca) uses expiring per-session WebObjects URLs, so it can't be crawled live. Instead, a curated seed of **128 real York courses** ships at `shared/york_courses_seed.json` (EECS, ENG, MECH/CIVL/ESSE, MATH, PHYS/CHEM/BIOL/NATS, ITEC, ADMS, ECON, POLS/SOCI/PHIL, PSYC, KINE, HLST) with faculty, code, name, and year level.
- **Admin controls (add / edit / delete / import):**
  - `POST /admin/courses/seed` — one-click "⇪ Seed York catalogue" button on the admin page. Skips existing codes, so it's rerunnable and never overwrites admin edits. Audit-logged.
  - `PUT /admin/courses/{id}` — new **Edit** button + modal (code stays York-validated; year level re-derives on code change unless set explicitly). Audit-logged.
  - Create modal gained Faculty (dropdown of York faculties) and Year level (auto-derived, overridable). Delete already existed.
- Admin table shows Faculty and Year columns; the student catalogue cards show `faculty · dept · Year N`, and Browse gained a year-level filter.
- Courses created via the student request flow auto-derive their year level.

## Groups: session + section
- `Group` gained **session** (validated as `F25` / `W26` / `SU26` / `Y25`) and **section** (e.g. `A`, `B`, `M`), entered by the student or admin in the create form and editable in Manage → Edit group details.
- Shown as a badge on group cards (`SU26 · Sec A`) and as stats on the group overview.
