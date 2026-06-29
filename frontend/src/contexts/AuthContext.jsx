import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { api, formatApiErrorDetail, saveToken, pingBackend } from "@/lib/api";

const PIN_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const STORAGE_KEY = "kc_unlocked_at";
const ONBOARDING_FLAG = "kc_show_onboarding_after_setup";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [setupStatus, setSetupStatus] = useState(null);
  const [pinLocked, setPinLocked] = useState(false);
  const timerRef = useRef(null);

  const markUnlocked = () => {
    sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
    setPinLocked(false);
  };

  const lockNow = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setPinLocked(true);
  }, []);

  const checkPinTimeout = useCallback(() => {
    const last = Number(sessionStorage.getItem(STORAGE_KEY) || 0);
    if (!last || Date.now() - last > PIN_TIMEOUT_MS) {
      setPinLocked(true);
    }
  }, []);

  const startPinTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(checkPinTimeout, 60_000);
  }, [checkPinTimeout]);

  const stopPinTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible" && user) checkPinTimeout();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [user, checkPinTimeout]);

  const refreshSetupStatus = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/setup-status");
      setSetupStatus(data);
      return data;
    } catch {
      // Backend unreachable — don't assume first-time setup; show PIN screen with offline warning
      const fallback = { needs_setup: false, shop_name: null, offline: true };
      setSetupStatus(fallback);
      return fallback;
    }
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      return data;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    pingBackend(); // wake Render cold start immediately on any page load
    (async () => {
      const [, userData] = await Promise.all([refreshSetupStatus(), checkAuth()]);
      if (userData) { checkPinTimeout(); startPinTimer(); }
      setLoading(false);
    })();
    return stopPinTimer;
  }, [refreshSetupStatus, checkAuth, checkPinTimeout, startPinTimer, stopPinTimer]);

  const setupPin = async (shopName, pin, email, password, { register = false } = {}) => {
    const body = { shop_name: shopName, pin };
    if (email && password) { body.email = email; body.password = password; }
    const path = register ? "/auth/register" : "/auth/setup";
    const { data } = await api.post(path, body);
    if (data.token) saveToken(data.token);
    sessionStorage.setItem(ONBOARDING_FLAG, "1");
    setUser(data.user);
    setSetupStatus({ needs_setup: false, has_email: true, allow_register: true });
    markUnlocked();
    startPinTimer();
    return data.user;
  };

  const loginEmail = async (email, password) => {
    const { data } = await api.post("/auth/login-email", { email, password });
    if (data.token) saveToken(data.token);
    setUser(data.user);
    markUnlocked();
    startPinTimer();
    return data.user;
  };

  // Session re-lock only — verifies PIN for the signed-in account (not a standalone login)
  const unlockWithPin = async (pin) => {
    await api.post("/auth/unlock-pin", { pin });
    markUnlocked();
    return true;
  };

  const changePin = async (currentPin, newPin) => {
    await api.post("/auth/change-pin", { current_pin: currentPin, new_pin: newPin });
  };

  const changePassword = async (currentPassword, newPassword) => {
    await api.post("/auth/change-password", { current_password: currentPassword, new_password: newPassword });
  };

  const setEmailPassword = async (email, password) => {
    const { data } = await api.post("/auth/email-password", { email, password });
    if (data.user) {
      setUser(data.user);
    } else {
      setUser(prev => prev ? { ...prev, email: data.email, has_email: true } : prev);
    }
    setSetupStatus(prev => prev ? { ...prev, has_email: true } : prev);
    return data;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch { /* ignore */ }
    sessionStorage.removeItem(STORAGE_KEY);
    saveToken(null);
    stopPinTimer();
    setUser(null);
    setPinLocked(false);
  };

  return (
    <AuthContext.Provider value={{
      user, loading, setupStatus, pinLocked,
      setupPin, loginEmail, unlockWithPin, changePin, changePassword, setEmailPassword, logout, lockNow,
      refreshSetupStatus, formatApiErrorDetail,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
