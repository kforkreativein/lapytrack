import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { api, formatApiErrorDetail } from "@/lib/api";

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
    (async () => {
      const [, userData] = await Promise.all([refreshSetupStatus(), checkAuth()]);
      if (userData) { checkPinTimeout(); startPinTimer(); }
      setLoading(false);
    })();
    return stopPinTimer;
  }, [refreshSetupStatus, checkAuth, checkPinTimeout, startPinTimer, stopPinTimer]);

  const setupPin = async (shopName, pin, email, password) => {
    const body = { shop_name: shopName, pin };
    if (email && password) { body.email = email; body.password = password; }
    const { data } = await api.post("/auth/setup", body);
    if (data.access_token) localStorage.setItem("access_token", data.access_token);
    sessionStorage.setItem(ONBOARDING_FLAG, "1");
    setUser(data.user);
    setSetupStatus({ needs_setup: false, shop_name: shopName });
    markUnlocked();
    startPinTimer();
    return data.user;
  };

  const loginEmail = async (email, password) => {
    const { data } = await api.post("/auth/login-email", { email, password });
    if (data.access_token) localStorage.setItem("access_token", data.access_token);
    setUser(data.user);
    markUnlocked();
    startPinTimer();
    return data.user;
  };

  const loginPin = async (pin) => {
    const { data } = await api.post("/auth/login", { pin });
    if (data.access_token) localStorage.setItem("access_token", data.access_token);
    setUser(data.user);
    markUnlocked();
    startPinTimer();
    return data.user;
  };

  // 15-min re-lock overlay: verify PIN and reset timer without full page redirect
  const unlockWithPin = async (pin) => {
    const { data } = await api.post("/auth/login", { pin });
    if (data.access_token) localStorage.setItem("access_token", data.access_token);
    markUnlocked();
    return true;
  };

  const changePin = async (currentPin, newPin) => {
    await api.post("/auth/change-pin", { current_pin: currentPin, new_pin: newPin });
  };

  const setEmailPassword = async (email, password) => {
    const { data } = await api.post("/auth/email-password", { email, password });
    setUser(prev => prev ? { ...prev, email: data.email, has_email: true } : prev);
    setSetupStatus(prev => prev ? { ...prev, has_email: true } : prev);
    return data;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch { /* ignore */ }
    localStorage.removeItem("access_token");
    sessionStorage.removeItem(STORAGE_KEY);
    stopPinTimer();
    setUser(null);
    setPinLocked(false);
  };

  return (
    <AuthContext.Provider value={{
      user, loading, setupStatus, pinLocked,
      setupPin, loginPin, loginEmail, unlockWithPin, changePin, setEmailPassword, logout, lockNow,
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
