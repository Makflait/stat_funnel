## Стэк

- Frontend: Next.js + TypeScript + Tailwind + Recharts
- Backend: Node.js + Express + TypeScript
- DB: PostgreSQL
- ORM: Prisma
- Auth: JWT

## Quick start

1. Copy `.env.example` to `.env` and set values.
2. Start PostgreSQL:
   - `docker compose up -d`
3. Install dependencies:
   - `npm install`
4. Generate Prisma client + run migrations:
   - `npm run prisma:generate`
   - `npm run prisma:migrate`
5. Seed first user:
   - `npm run prisma:seed`
6. Run apps:
   - `npm run dev`
     or separately:
   - `npm run dev:backend`
   - `npm run dev:frontend`

Frontend: `http://localhost:3000`
Backend: `http://localhost:4000/api`

Default seed credentials:

- email: `admin@example.com`
- password: `changeme123`

Architecture notes:

- `ARCHITECTURE.md`

## API overview

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/apps`
- `POST /api/apps`
- `GET /api/reports?appId&from&to`
- `POST /api/reports`
- `GET /api/reports/export?appId&from&to`
- `GET /api/dashboard?appId&from&to`
