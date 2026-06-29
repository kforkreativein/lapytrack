# LapyTrack — Feature Tracker

> **App name:** LapyTrack (formerly Krish Computer Store Manager)  
> **Last updated:** 2026-06-29  
> **Stack:** React 19 + Tailwind + Shadcn (frontend) · FastAPI + Motor + MongoDB (backend)  
> **Working directory:** `krish-computer-app/`

---

## Status Key
- `[x]` Done
- `[-]` In Progress
- `[ ]` Planned / Todo

---

## Phase 1 — Project Setup & Cleanup

- [x] Remove all Emergent/PostHog from frontend (index.html, craco.config.js, package.json)
- [x] Set up local file storage (`backend/uploads/`) replacing Emergent cloud storage
- [x] Fix `requirements.txt` — motor==3.5.3 + pymongo>=4.5,<4.9
- [x] Create `backend/.env` (MONGO_URL, JWT_SECRET, CORS_ORIGINS)
- [x] MongoDB sparse unique index for `serial_number` (allows null)

---

## Phase 2 — Auth & Session

- [x] PIN setup flow: shop name → PIN → confirm PIN (3 steps)
- [x] bcrypt PIN hashing stored in `app_config` MongoDB collection
- [x] JWT cookie auth (`secure=False`, `samesite=lax` for localhost)
- [x] localStorage Bearer token fallback
- [x] Session persistence fix — reload shows PIN login, not setup
- [x] Offline detection banner (WifiOff icon when backend unreachable)
- [x] 5-step onboarding overlay — redesigned clean white card (shows once, `kc_onboarding_done` localStorage flag)
- [x] **Email + password one-time signup** (optional during setup; fallback login via `/auth/login-email`)
- [ ] Multi-business isolation by `business_id` (each shop is separate account)

---

## Phase 3 — Device Module (Inward/Outward)

- [x] Brand dropdown (12 brands seeded, Apple has 45 models)
- [x] Model cascades from brand selection; "Other" shows free-text input
- [x] Serial number optional (sparse MongoDB index)
- [x] Issue categories as multi-select chips (stored as array on device document)
- [x] Issue notes textarea alongside chips
- [x] Device detail page shows issue chips + notes
- [ ] CSV export button on Devices page (backend route exists at `GET /api/devices/export/csv`)

---

## Phase 4 — Khata Book / Ledger

- [x] Customer list with balance chips (Ledger.jsx)
- [x] Add Contact dialog — name, phone, email (optional), note
- [x] CustomerPicker — searchable dropdown with "+ Create 'name'" when no match found
- [x] Add Entry dialog — customer + Got/Gave + amount + category + payment method + note
- [x] Payment method chip selection in all transaction dialogs
- [x] Transaction list shows payment method badge (Landmark icon)
- [x] Banks seeded: Cash, HDFC Bank, Yes Bank, SBI
- [x] Export Contacts as CSV (`GET /api/customers/export/csv`)
- [x] Export Ledger as CSV (`GET /api/transactions/export/csv`)

---

## Phase 5 — Customize Tab (was Catalog)

- [x] Brands section — add/delete brands with expandable model rows
- [x] Models section — add/delete models per brand
- [x] Issue Categories — chip list with add/delete (repair issues)
- [x] Payment Methods (Banks) — chip list with add/delete/rename
- [x] Ledger Categories — add/delete/rename (appears in Add Entry → Category)
- [x] Contact Import — CSV + VCF file upload (server-side parse + dedup)
- [x] Rename "Catalog" tab → "Customize" in sidebar

---

## Phase 6 — Infrastructure & Hosting

- [ ] **Multi-business support** — each shop signs up with email+password once, then PIN daily
- [x] Hosting decided: **Fly.io** (backend) + **MongoDB Atlas M0** (database) + **UptimeRobot** (keep-alive)
- [x] Deployment files created: `backend/Dockerfile`, `backend/fly.toml`, `backend/.dockerignore`
- [x] Frontend deployment config: `frontend/vercel.json`, `frontend/.env.production`
- [ ] GitHub repo — push when ready (prerequisite for Vercel deploy)
- [ ] Actually deploy to Fly.io + Atlas + Vercel (follow DEPLOY.md steps)
- [ ] App name finalized: **LapyTrack**
- [ ] PWA manifest (installable on phone home screen)
- [ ] Reports page (weekly/monthly bar charts with recharts)
- [ ] Settings page — change PIN flow

---

## Data Storage Map

| MongoDB Collection | What it stores |
|---|---|
| `app_config` | Shop name, hashed PIN, (planned: email + hashed password) |
| `devices` | Inward device records (brand, model, serial, issues, photos) |
| `movements` | Device status changes (inward → repair → outward) |
| `customers` | Khata contacts (name, phone, email, note) |
| `transactions` | Credit/debit entries (amount, type, category, payment_method) |
| `categories` | Ledger transaction categories |
| `brands` | Device brands with nested `models[]` array |
| `issue_categories` | Repair issue chips |
| `banks` | Payment methods (Cash, HDFC, etc.) |

**Local file storage:** `backend/uploads/` — device photos served via `GET /api/files/{path}`

---

## Backend API Endpoints (Key)

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/auth/setup-status` | Check if first-time setup needed |
| POST | `/api/auth/setup` | One-time PIN setup |
| POST | `/api/auth/login` | PIN login |
| GET | `/api/devices` | List all devices |
| POST | `/api/devices` | Register new device (inward) |
| GET | `/api/devices/export/csv` | Download devices as CSV |
| GET | `/api/customers` | List all contacts |
| POST | `/api/customers/import-file` | Bulk import CSV/VCF |
| GET | `/api/customers/export/csv` | Download contacts as CSV |
| GET | `/api/transactions/export/csv` | Download ledger as CSV |
| GET | `/api/catalog/brands` | List brands |
| GET | `/api/catalog/banks` | List payment methods |
| GET | `/api/categories` | List ledger categories |

---

## Session Log

| Date | Changes |
|---|---|
| 2026-06-29 | Full app scaffold, merged backend, auth, device module, ledger, customize page |
| 2026-06-29 | Payment methods, contact import, banks catalog, renamed Customize tab, editable categories, contact export, ledger export, onboarding overlay, email field on contacts, "+ Create" in CustomerPicker |
| 2026-06-29 | Tracker converted to Markdown, onboarding redesigned, email+password auth planned |
