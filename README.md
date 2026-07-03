# StudySync 📚
> A university-focused study group and collaboration platform - built for students, by students.

StudySync helps university students connect with classmates, organize study sessions, share resources, and collaborate on courses. Think Google Classroom meets Discord study servers, but purpose-built for student-led course collaboration.

---

## 👥 Team Members

| Name | Email |
|---|---|
| Nurjahan Ahmed Shiah | nshiah49@my.yorku.ca |
| Ali Shandhor | ali2030@my.yorku.ca |
| Muhammad Fahad Sohail | fadi786@my.yorku.ca |
| Saaram Ahmed Mustafa | ahmed779@my.yorku.ca |
| Uzma Alam | uzmaa@my.yorku.ca |
| Nusayba Hossain | @ |

---

## 🧠 What It Does

- Students create or join **study groups** based on their courses
- Group leaders organize **study sessions**, share resources, and assign tasks
- Admins manage users, courses, and platform moderation
- **Study group recommendations** help students find groups based on courses and interests

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 + React + TypeScript |
| Backend | FastAPI (Python) - microservices architecture |
| Database | PostgreSQL 16 |
| Auth | JWT via `python-jose` + `passlib[bcrypt]` |
| ORM | SQLAlchemy |
| Data Layer | Delta Lake + DuckDB + scikit-learn (recommendations) |
| Containerization | Docker + Docker Compose |

---

## 📁 Project Structure

```
StudySync/
├── api-gateway/              # Routes requests to microservices
├── services/
│   ├── auth-service/         # Registration, login, JWT
│   ├── users-service/        # User profiles
│   ├── groups-service/       # Study group management
│   ├── sessions-service/     # Study session scheduling
│   ├── resources-service/    # File/resource sharing
│   ├── courses-service/      # Course management
│   ├── recommendations-service/ # ML-based group recommendations
│   ├── notifications-service/ # Notification Centre (US-E.1)
│   ├── announcements-service/ # Announcement Board (US-E.2)
│   └── admin-service/        # Platform administration
├── frontend/                 # Next.js App Router (TypeScript)
│   └── src/app/
│       ├── page.tsx          # Landing page
│       ├── signup/           # Registration
│       ├── login/            # Login
│       ├── dashboard/        # User dashboard
│       ├── resources/        # Resources page
│       ├── notifications/    # Notification Centre full page (US-E.1)
│       ├── groups/           # Group list + detail w/ Announcement Board (US-E.2)
│       └── admin/            # Admin console
├── shared/                   # Shared auth utilities across services
├── datalake/                 # Delta Lake analytics pipeline
├── tests/
│   └── curl/
│       ├── signup/           # Signup endpoint tests
│       ├── dashboard/        # Dashboard/token validation tests
│       ├── notifications/    # Notification Centre tests (US-E.1)
│       └── announcements/    # Announcement Board tests (US-E.2)
├── docker-compose-microservices.yml
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)
- [Git](https://git-scm.com/)

> You do **not** need Python or Node.js installed locally — Docker handles everything.

---

### 1. Clone the Repository

```bash
git clone https://github.com/nurjahan-shiah/StudySync/
cd StudySync
```

---

### 2. Set Up Environment Variables

```bash
cp .env.example .env
```

Open `.env` and configure:

```env
# Database
POSTGRES_USER=admin
POSTGRES_PASSWORD=secret
POSTGRES_DB=studysync

# Auth
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

### 3. Build and Run with Docker

```bash
docker compose -f docker-compose-microservices.yml up --build
```

This starts all containers:

| Container | Description | Port |
|---|---|---|
| `studysync-gateway` | API Gateway | `8000` |
| `studysync-auth` | Auth service | `8001` |
| `studysync-db` | PostgreSQL | `5432` |
| `studysync-frontend` | Next.js frontend | `3000` |

---

### 4. Verify It's Running

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| API Gateway | http://localhost:8000 |
| Signup | http://localhost:3000/signup |
| Dashboard | http://localhost:3000/dashboard |
| Admin Console | http://localhost:3000/admin |

---

### Stopping the App

```bash
docker compose -f docker-compose-microservices.yml down
```

Full reset (removes DB volume):

```bash
docker compose -f docker-compose-microservices.yml down -v
```

---

## 🔄 Rebuilding After Code Changes

```bash
docker compose -f docker-compose-microservices.yml up --build
```

Force clean rebuild (no cache):

```bash
docker compose -f docker-compose-microservices.yml up --build --no-cache
```

---

## 🧪 Running Tests

Make sure Docker is running first, then from the project root:

```bash
bash tests/curl/signup/test_signup.sh
bash tests/curl/dashboard/test_dashboard.sh
bash tests/curl/notifications/test_notifications.sh
bash tests/curl/announcements/test_announcements.sh
```

---

## 📄 License

Advanced Software Engineering (EECS 4314), York University, Summer 2026.
