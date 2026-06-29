# LapyTrack — Project Instructions for Claude Code

This file is read automatically by Claude Code at the start of every session.

---

## What This App Is

**LapyTrack** is a store management system for Krish Computer Life Services (laptop repair shop).

- **Inward / Outward** — log devices in/out with auto job numbers + QR codes
- **Job Sheet (public)** — QR scan → `/job/:id` → no login needed, shows repair status
- **Khata Book** — financial ledger (credit/debit per customer)
- **Reports** — charts + CSV export with daily/weekly/monthly/annual filters
- **Settings** — change PIN, change password, lock app

---

## Stack

| Layer | Service | URL |
|-------|---------|-----|
| Frontend | React (CRA + Craco + Tailwind) on Vercel | https://lapy-track.vercel.app |
| Backend | FastAPI (Python) on Render | https://lapytrack.onrender.com |
| Database | MongoDB Atlas M0 (512 MB free) | Atlas cluster |
| Repo | GitHub | https://github.com/kforkreativein/lapytrack |

---

## Key Files

```
backend/server.py          — entire backend (FastAPI, auth, devices, ledger, exports)
frontend/src/App.js        — routes + ProtectedRoute
frontend/src/contexts/AuthContext.jsx  — auth state, login/logout/PIN logic
frontend/src/pages/PinAuth.jsx         — signup + email login + PIN login screen
frontend/src/pages/InwardForm.jsx      — new device inward entry
frontend/src/pages/OutwardForm.jsx     — device outward / issue to customer
frontend/src/pages/DeviceDetail.jsx    — job card view with QR code display
frontend/src/pages/PublicJobCard.jsx   — public QR scan target (no auth)
frontend/src/pages/Ledger.jsx          — khata book (financial ledger)
frontend/src/pages/Reports.jsx         — income/expense charts
frontend/src/pages/Settings.jsx        — change PIN, change password, logout
frontend/src/lib/api.js                — axios instance (withCredentials, JWT header)
```

---

## Auth Flow

```
First visit / cookie expired:
  Email + Password → JWT cookie (7 days) → PIN screen → App

Return visit (cookie valid):
  PIN screen → App

PIN re-lock: after 15 min of inactivity (sessionStorage timer)
```

- Credentials (email hash, PIN hash) live in MongoDB `users` collection
- `app_config` holds only `shop_name` now (credentials migrated to `users` on startup)
- Rate limit: 5 failed login or PIN attempts → 15-min account lockout

---

## QR Code Rules

- QR SVG is generated **on read** by `enrich_device()` — NOT stored in MongoDB
- QR is **present** when device status is `in_repair` or `in_stock`
- QR is **null** when device status is `issued` (outward) — restores on next inward
- Public job card URL: `https://lapy-track.vercel.app/job/<device_id>`

---

## MongoDB Storage

No images stored. Storage is effectively unlimited for a small shop:
- ~500 bytes per device record
- 512 MB / 500 bytes ≈ 1,000,000 devices before any concern

---

## Render Free Tier — Cold Start Warning

Render free tier sleeps after 15 min of inactivity. Cold start takes 30–60 s.
**Fix:** UptimeRobot (free) pings `https://lapytrack.onrender.com/api/` every 5 min.

---

## Environment Variables

**Backend** (Render dashboard or `backend/.env`):
```
MONGO_URL=mongodb+srv://...
DB_NAME=krish_computer_db
JWT_SECRET=<strong random string>
FRONTEND_URL=https://lapy-track.vercel.app
CORS_ORIGINS=https://lapy-track.vercel.app
```

**Frontend** (Vercel dashboard or `frontend/.env.local`):
```
REACT_APP_BACKEND_URL=https://lapytrack.onrender.com
```

---

## Coding Rules for Claude

- **No images** — photo upload is intentionally disabled (saves MongoDB storage). Do not re-enable without Cloudinary integration.
- **No commit unless user says "push"** — always stage and describe changes, wait for explicit push instruction.
- **Use the task tracker** — TaskCreate/TaskUpdate for every session with multiple steps.
- **Backend is `server.py`** — single file, do not split into multiple modules unless explicitly asked.
- **Ponytail mode** — shortest working diff wins. No unnecessary abstractions.
- **Vercel project name** — `krish-computer-apps` (was renamed from `frontend`).
- **When user says "push"** — commit all changed files with a clear message, push to GitHub (triggers Render + Vercel auto-deploy).
