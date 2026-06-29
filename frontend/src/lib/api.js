import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export function publicFileUrl(path) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${API}/public/files/${encoded}`;
}

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
  timeout: 15000,
});

export async function downloadCsv(path, filename) {
  const response = await fetch(`${API}${path}`, { credentials: "include" });
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
