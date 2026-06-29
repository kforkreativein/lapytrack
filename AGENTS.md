# LapyTrack Codex Instructions

This file is the working memory for Codex-style agents in this repository. Read it before making changes.

## Project

LapyTrack is a store manager for Krish Computer / laptop repair shops.

Core product areas:
- Inward/outward device repair tracking.
- Auto job IDs and public QR job cards.
- Printable job sheets/cards.
- Customer/device details and repair status.
- Khata Book ledger for today's transactions with date navigation.
- Reports for daily, weekly, monthly, and annual summaries.
- First-time setup with shop details, email/password, and 4-digit PIN.
- Daily unlock with 4-digit PIN.

Live URLs:
- Frontend: `https://lapy-track.vercel.app`
- Backend: `https://lapytrack.onrender.com`
- GitHub: `https://github.com/kforkreativein/lapytrack`

## Repository Layout

Work from:

```bash
/Users/krish/Documents/Ai/Web-Projects/Krish-computer-apps/krish-computer-app
```

Important paths:
- `frontend/` - React app deployed to Vercel.
- `backend/` - FastAPI app deployed to Render.
- `backend/server.py` - Main API server.
- `Dockerfile` - Root Dockerfile used by Render.
- `backend/Dockerfile` - Backend Dockerfile kept for backend-only/container use.
- `frontend/.env.production` - Production frontend API origin.
- `backend/.env.example` - Backend env variable reference.
- `docs/` - Launch/deploy notes.
- `.cursor/rules/` - Cursor project rules; keep them aligned with major changes.

Do not work in sibling repos such as `DayBook-Tracker/` or `INward-outward/` unless explicitly asked.

## Stack

Frontend:
- React.
- CRA/CRACO.
- React Router.
- Tailwind/shadcn-style UI components.
- Vercel hosting.

Backend:
- FastAPI.
- Uvicorn.
- MongoDB via Motor/PyMongo.
- Docker on Render.

Database/storage:
- MongoDB Atlas for app data.
- Uploaded job images are stored in MongoDB so Render restarts do not lose them.

## Deployment Rule

Always follow this order:

1. Make and verify local changes.
2. Commit changes.
3. Push to GitHub `main`.
4. Deploy/redeploy Vercel or Render from the pushed GitHub state.

Do not make Vercel production differ from GitHub. The user specifically wants GitHub first, then Vercel/Render.

Current deployment:
- Vercel frontend points to `https://lapytrack.onrender.com`.
- Render backend should deploy the latest `main` commit.
- Render uses the root `Dockerfile`.

## Environment Variables

Frontend production:

```text
REACT_APP_BACKEND_URL=https://lapytrack.onrender.com
```

Do not include `/api` in `REACT_APP_BACKEND_URL`; the app appends API paths itself.

Backend required/recommended variables:

```text
MONGO_URL=<MongoDB Atlas connection string>
DB_NAME=krish_computer_db
JWT_SECRET=<long random secret>
CORS_ORIGINS=https://lapy-track.vercel.app
FRONTEND_URL=https://lapy-track.vercel.app
```

Backend also accepts `MONGODB_URI` as a fallback for `MONGO_URL`.

Never commit real secrets. `.env`, `.env.local`, and local Vercel/Render files must stay out of git.

## Local Commands

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --reload --port 8000
```

Frontend:

```bash
cd frontend
yarn install
yarn start
```

Production frontend build:

```bash
cd frontend
yarn build
```

Quick backend syntax check:

```bash
cd backend
MONGODB_URI="mongodb://localhost:27017" DB_NAME="krish_computer_db" python3 -m py_compile server.py
```

## Deploy Commands

Vercel production deploy, only after GitHub push:

```bash
cd frontend
vercel deploy . --prod -y
```

Render should usually be redeployed from the dashboard using:

```text
Manual Deploy -> Deploy latest commit
```

If Render fails, inspect the latest red log line first. Common causes:
- Missing `MONGO_URL` or `MONGODB_URI`.
- Missing `DB_NAME`.
- Wrong Dockerfile path. Render should use the root `Dockerfile`.
- MongoDB Atlas network access not allowing Render.
- Render free instance sleeping; first request may take 30-60 seconds.

Test backend:

```bash
curl https://lapytrack.onrender.com/api/
```

Test frontend:

```bash
curl -I https://lapy-track.vercel.app
```

## Git Notes

The expected remote is:

```text
origin https://github.com/kforkreativein/lapytrack.git
```

Before editing, run:

```bash
git status --short
```

There may be user changes in the working tree. Never revert changes you did not make. If you only need to add documentation, keep the edit scoped to documentation.

## Product Behavior To Preserve

- Onboarding should happen only once, during first registration/setup.
- After setup, normal entry is the 4-digit PIN unlock.
- Email/password is for setup and full sign-in/recovery flows.
- Public QR job card routes must be viewable without login.
- Job sheet printing should not auto-crash embedded browsers; prefer opening the sheet and letting the user click print.
- Device problem entry should support multiple problems.
- Devices page should show monthly inward/outward counts.
- Ledger/Khata Book should focus on today's transactions with previous/next date navigation, not a large all-period ledger view.

## UX Style

Keep the app practical and shop-operator focused:
- Dense, clear, operational layouts.
- Avoid marketing-style landing pages inside the app.
- Keep buttons and actions obvious.
- Use existing components and visual patterns before inventing new ones.
- Do not add decorative clutter.

## When The User Is Deploying

The user may be stressed by deployment errors. Keep instructions short and concrete.

Prefer:

```text
Click Environment.
Add MONGO_URL.
Click Manual Deploy.
Click Deploy latest commit.
```

Avoid long theory unless asked.
