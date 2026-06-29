# LapyTrack — Krish Computer Store Manager

A self-hosted store management system for laptop repair shops.

**Live:** https://lapy-track.vercel.app

---

## What It Does

- **Inward / Outward** — log devices coming in for repair and going out to customers, with auto-generated job numbers and QR codes
- **Job Sheet** — scan QR code to view live status of any repair job (public, no login needed)
- **Khata Book (Ledger)** — track credit/debit entries against customers, full financial ledger
- **Reports** — daily, weekly, monthly, annual income vs expense charts with CSV export
- **Settings** — change PIN, change password, lock app, sign out

---

## Stack

| Layer | Service |
|-------|---------|
| Frontend | React · Vercel |
| Backend | FastAPI (Python) · Render |
| Database | MongoDB Atlas |

---

## Project Structure

```
krish-computer-app/
├── .cursor/rules/    # Cursor AI rules (project context)
├── backend/          # FastAPI app (server.py)
│   └── .env          # local only, not in git
├── frontend/         # React app
│   └── .env.local    # local only, not in git
├── .gitignore
└── README.md
```

---

## Local Development

**Backend:**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in MONGO_URL, JWT_SECRET, FRONTEND_URL
uvicorn server:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
echo "REACT_APP_BACKEND_URL=http://localhost:8000" > .env.local
npm start
```

---

## Auth

- First-time setup: shop name + email + password + 4-digit PIN
- Daily access: 4-digit PIN (cookie lasts 7 days; just PIN after first login on each device)
- Full sign-in (email + password): used when cookie expires or on a new browser
- Rate-limited: 5 failed attempts → 15-minute lockout

---

## Deployment

Push to `main` → Render redeploys backend automatically → Vercel redeploys frontend automatically.

See `CLOUD.md` (local, not in git) for full environment variable reference and architecture notes.

## Cursor AI Rules

Project context for Cursor lives in `.cursor/rules/`:
- `lapytrack-core.mdc` — scope, stack, what to always do
- `lapytrack-deployment.mdc` — URLs, env vars, deploy troubleshooting
- `lapytrack-frontend.mdc` — React conventions
- `lapytrack-backend.mdc` — FastAPI conventions
