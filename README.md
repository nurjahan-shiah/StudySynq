# StudySync 📚

> A university-focused study group and collaboration platform - built for students, by students!

StudySync helps university students connect with classmates, organize study sessions, share resources, and collaborate for courses. Think Google Classroom meets Discord study servers, but purpose-built for student-led course collaboration.

---

## 👥 Team Members

| Name | email |
|---|---|
| Nurjahan Ahmed Shiah | nshiah49@my.yorku.ca |
| Ali Shandhor | ali2030@my.yorku.ca |
| Muhammad Fahad Sohail | fadi786@my.yorku.ca |
| Saaram Ahmed Mustafa | @ |
| Uzma Alam | @ |
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
| Frontend | Next.js 16 + React + TypeScript + Tailwind CSS |
| Backend | FastAPI (Python) |
| Database | PostgreSQL 16 |
| Auth | JWT via `python-jose` + `passlib[bcrypt]` |
| ORM | SQLAlchemy + Alembic (migrations) |
| Containerization | Docker + Docker Compose |

---

## 📁 Project Structure

```
StudySync/
├── backend/
│   ├── main.py               # FastAPI app entry point
│   ├── requirements.txt      # Python dependencies
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   └── app/              # Next.js App Router pages
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

Make sure you have installed:
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)
- [Git](https://git-scm.com/)

> You do **not** need Python or Node.js installed locally - Docker handles everything.

---

### 1. Clone the Repository

```bash
git clone https://github.com/nurjahan-shiah/StudySync/
cd StudySync
```

---

### 2. Set Up Environment Variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Open `.env` and configure:

```env
# Database
POSTGRES_USER=studysync
POSTGRES_PASSWORD=yourpassword
POSTGRES_DB=studysync_db

# Backend
DATABASE_URL=postgresql://studysync:yourpassword@db:5432/studysync_db
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

### 3. Build and Run with Docker

```bash
docker compose up --build
```

This will start three containers:
- **backend** → FastAPI at `http://localhost:8000`
- **frontend** → Next.js at `http://localhost:3000`
- **db** → PostgreSQL at port `5432`

---

### 4. Verify It's Running

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| Health Check | http://localhost:8000/health |

---

### Stopping the App

```bash
docker compose down
```

To also remove the database volume (full reset):

```bash
docker compose down -v
```

---

## 🔄 Rebuilding After Code Changes

If you change backend or frontend code:

```bash
docker compose up --build
```

If you only changed frontend:

```bash
docker compose up --build frontend
```

---

## 🗄 Database Migrations (Alembic)

To run migrations inside the backend container:

```bash
docker compose exec backend alembic upgrade head
```

To create a new migration after changing models:

```bash
docker compose exec backend alembic revision --autogenerate -m "describe your change"
```

---

## 📄 License

Advanced Software Engineering, York University, Summer 2026.
