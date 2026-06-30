import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const TOKEN_KEY = "kc_token";

export function saveToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function publicFileUrl(path) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${API}/public/files/${encoded}`;
}

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
  // ponytail: 65s covers Render free-tier cold start (30-60s); 45s was too short
  timeout: 65000,
});

// Attach stored token as Authorization header (fallback for mobile where cross-origin cookies are blocked)
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers["Authorization"] = `Bearer ${token}`;
  return config;
});

export async function downloadCsv(path, filename) {
  const token = getToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(`${API}${path}`, { credentials: "include", headers });
  if (!response.ok) {
    let message = "Export failed";
    try { const d = await response.json(); message = formatApiErrorDetail(d.detail); } catch { /* ignore */ }
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
  return true;
}

export function formatApiErrorDetail(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

// Fire-and-forget ping to wake Render from cold start
export function pingBackend() {
  fetch(`${API}/`, { method: "GET" }).catch(() => {});
}

const HEALTH_URL = BACKEND_URL ? `${BACKEND_URL}/health` : null;

/** Poll /health until backend is awake (Render cold start). Resolves when ready or times out. */
export async function wakeBackend({ maxWaitMs = 90000, intervalMs = 2000 } = {}) {
  if (!HEALTH_URL) return false;
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(HEALTH_URL, { method: "GET", signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) return true;
    } catch { /* still waking */ }
    await new Promise((r) => setTimeout(r, intervalMs));
    pingBackend();
  }
  return false;
}

/** Retry a request on network errors (no response) — helps with Render cold starts */
export async function withRetry(fn, { retries = 3, delayMs = 2500 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isNetwork = !err.response;
      const isTimeout = err.code === "ECONNABORTED";
      if ((!isNetwork && !isTimeout) || attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
      pingBackend();
    }
  }
  throw lastErr;
}
