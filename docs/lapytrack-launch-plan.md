# LapyTrack Launch Plan

This guide covers two paths:

1. Fastest launch for the current app.
2. Long-term SaaS architecture.

Current app shape:

- Frontend: React app in `krish-computer-app/frontend`
- Backend: FastAPI app in `krish-computer-app/backend`
- Current database: MongoDB
- Current uploads: backend `uploads/` folder
- Current auth: custom PIN/email/password flow with JWT cookies

## Fastest Launch

Use this path to get the current app online with the least rewrite.

### Services

| Layer | Recommended Service | Why |
| --- | --- | --- |
| Frontend | Vercel | Simple React deployment from GitHub |
| Backend | Fly.io or Render | Runs the existing FastAPI Docker app |
| Database | MongoDB Atlas | Works with the current MongoDB code |
| File storage | Fly volume, Cloudflare R2, S3, or Supabase Storage | Keeps uploaded photos persistent |

### Step 1: Push Code To GitHub

Create a GitHub repository and push the project.

Only commit safe files. Do not commit real `.env` secrets.

Important files:

- `krish-computer-app/frontend/package.json`
- `krish-computer-app/frontend/vercel.json`
- `krish-computer-app/backend/Dockerfile`
- `krish-computer-app/backend/fly.toml`
- `krish-computer-app/backend/requirements.txt`

### Step 2: Create MongoDB Atlas Database

Create a MongoDB Atlas cluster.

Copy the connection string. It will look like:

```bash
mongodb+srv://USERNAME:PASSWORD@cluster-name.mongodb.net/?retryWrites=true&w=majority
```

Use it as:

```bash
MONGO_URL=mongodb+srv://USERNAME:PASSWORD@cluster-name.mongodb.net/?retryWrites=true&w=majority
DB_NAME=krish_computer
```

### Step 3: Deploy Backend

#### Option A: Fly.io

The backend already has:

- `krish-computer-app/backend/Dockerfile`
- `krish-computer-app/backend/fly.toml`

Set secrets:

```bash
cd krish-computer-app/backend
fly secrets set MONGO_URL="mongodb+srv://..."
fly secrets set DB_NAME="krish_computer"
fly secrets set JWT_SECRET="long-random-production-secret"
fly secrets set FRONTEND_URL="https://your-frontend.vercel.app"
fly secrets set CORS_ORIGINS="https://your-frontend.vercel.app"
```

Deploy:

```bash
fly deploy
```

The backend URL should look like:

```text
https://lapytrack-api.fly.dev
```

#### Option B: Render

Create a new Web Service from the GitHub repo.

Use:

- Root directory: `krish-computer-app/backend`
- Runtime: Docker
- Environment variables:

```bash
MONGO_URL=mongodb+srv://...
DB_NAME=krish_computer
JWT_SECRET=long-random-production-secret
FRONTEND_URL=https://your-frontend.vercel.app
CORS_ORIGINS=https://your-frontend.vercel.app
```

### Step 4: File Upload Storage

Current backend writes uploads to:

```text
krish-computer-app/backend/uploads
```

For fastest launch on Fly.io, use a Fly volume mounted at:

```text
/app/uploads
```

The existing `fly.toml` already includes:

```toml
[[mounts]]
  source = "lapytrack_uploads"
  destination = "/app/uploads"
```

For stronger SaaS storage later, move uploads to one of:

- Cloudflare R2
- AWS S3
- Supabase Storage

### Step 5: Deploy Frontend To Vercel

Create a Vercel project from GitHub.

Use:

- Root directory: `krish-computer-app/frontend`
- Build command: `yarn build`
- Output directory: `build`

Set environment variable:

```bash
REACT_APP_BACKEND_URL=https://lapytrack-api.fly.dev
```

Do not include `/api` in this value. The frontend code already appends `/api`.

### Step 6: Verify Production

Open:

```text
https://your-frontend.vercel.app
```

Check:

- PIN login works.
- Inward creates a job.
- Device detail opens.
- QR job sheet opens at `/job/<device_id>`.
- Khata Book transactions save.
- Reports load.
- Uploaded photos persist after backend restart.

## Long-Term SaaS Path

Use this path when the app needs to support multiple shops/accounts properly.

### Recommended SaaS Architecture

| Layer | Recommended Service |
| --- | --- |
| Frontend | Vercel |
| Auth | Supabase Auth |
| Database | Supabase Postgres |
| Storage | Supabase Storage or Cloudflare R2 |
| Backend logic | Supabase Edge Functions or a separate FastAPI service |
| Billing | Stripe |
| Email | Resend/Postmark |

### Required Data Model Changes

The current app is single-shop. A SaaS version needs tenant isolation.

Core tables/collections:

- `shops`
- `users`
- `shop_members`
- `devices`
- `movements`
- `customers`
- `transactions`
- `categories`
- `files`
- `subscriptions`

Every business record should include:

```text
shop_id
```

That is what prevents one shop from seeing another shop's data.

### Supabase-First SaaS

Supabase can replace a lot of the backend:

- MongoDB Atlas becomes Supabase Postgres.
- Custom email/password auth becomes Supabase Auth.
- Uploaded photos move to Supabase Storage.
- Some backend routes can become Supabase Edge Functions.
- Row Level Security protects each shop's data.

But this is a migration, not a config change. The current app uses FastAPI and MongoDB, so moving fully to Supabase means rewriting the data layer.

### SaaS Security Checklist

- Use HTTPS only.
- Use strong `JWT_SECRET`.
- Use explicit `CORS_ORIGINS`.
- Never use `*` CORS with credentials.
- Add per-shop authorization checks.
- Add backups.
- Add audit logs for money/device changes.
- Move uploads away from local disk for multi-instance deployments.
- Add monitoring and error tracking.

## Decision

Fastest launch:

```text
Vercel + Fly.io/Render + MongoDB Atlas + Fly Volume/R2/Supabase Storage
```

Best long-term SaaS:

```text
Vercel + Supabase Auth + Supabase Postgres + Supabase Storage + Stripe
```

## Useful Links

- Vercel: https://vercel.com
- Fly.io: https://fly.io
- Render: https://render.com
- MongoDB Atlas: https://www.mongodb.com/atlas
- Cloudflare R2: https://www.cloudflare.com/developer-platform/products/r2/
- Supabase: https://supabase.com
- Supabase Auth: https://supabase.com/auth
- Supabase Storage: https://supabase.com/storage
- Stripe: https://stripe.com
