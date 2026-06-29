# LapyTrack — Frontend

React frontend for the Krish Computer Store Manager. Deployed on Vercel.

## Setup

```bash
cd frontend
npm install
cp .env.example .env.local   # set REACT_APP_BACKEND_URL
npm start                     # dev server at localhost:3000
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `REACT_APP_BACKEND_URL` | Full URL of the backend (e.g. `https://xyz.onrender.com`) |

## Build

```bash
npm run build   # output → build/
```

Vercel picks this up automatically on every push to `main`.

---

See `CLOUD.md` at the repo root for full architecture notes (not in GitHub).
