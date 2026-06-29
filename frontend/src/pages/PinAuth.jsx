import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputOTP, InputOTPGroup, InputOTPSlot,
} from "@/components/ui/input-otp";
import { toast } from "sonner";
import { Cpu, ArrowRight, ShieldCheck, Loader2, WifiOff, Eye, EyeOff } from "lucide-react";

export default function PinAuth() {
  const navigate = useNavigate();
  const { setupStatus, setupPin, loginEmail, formatApiErrorDetail, loading } = useAuth();

  // mode: "setup" | "email-login"
  const [mode, setMode] = useState("email-login");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [shopName, setShopName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // setup steps: 1=shop name + credentials, 2=set PIN, 3=confirm PIN
  const [step, setStep] = useState(1);
  const [isRegister, setIsRegister] = useState(false);

  useEffect(() => {
    if (!setupStatus) return;
    if (setupStatus.needs_setup) {
      setIsRegister(false);
      setMode("setup");
    } else {
      setMode("email-login");
    }
  }, [setupStatus]);

  const friendlyError = (err) => {
    if (!err.response) return "Cannot reach server — please wait a moment and try again.";
    return formatApiErrorDetail(err.response?.data?.detail) || err.message || "Something went wrong";
  };

  const startRegister = () => {
    setIsRegister(true);
    setMode("setup");
    setStep(1);
    setError("");
    setPassword("");
    setConfirmPassword("");
    setShopName("");
    setEmail("");
    setPin("");
    setConfirmPin("");
  };

  const backToSignIn = () => {
    setIsRegister(false);
    setMode("email-login");
    setStep(1);
    setError("");
    setPassword("");
    setConfirmPassword("");
  };

  // ── Email Login ────────────────────────────────────────────────────────────
  const handleEmailLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) { setError("Enter email and password"); return; }
    setSubmitting(true); setError("");
    try {
      await loginEmail(email.trim(), password);
      toast.success("Welcome back");
      navigate("/dashboard");
    } catch (err) {
      setError(friendlyError(err));
    } finally { setSubmitting(false); }
  };

  // ── Setup flow ─────────────────────────────────────────────────────────────
  const handleSetupStep1 = (e) => {
    e?.preventDefault();
    if (!shopName.trim()) { setError("Shop name is required"); return; }
    if (!email.trim() || !email.includes("@")) { setError("Enter a valid email address"); return; }
    if (!password || password.length < 10) { setError("Password must be at least 10 characters"); return; }
    if (password !== confirmPassword) { setError("Passwords do not match"); return; }
    setError(""); setStep(2);
  };

  const handleSetupPinChange = (value) => {
    setPin(value); setError("");
    if (value.length === 4) setStep(3);
  };

  const handleConfirmPinChange = (value) => {
    setConfirmPin(value); setError("");
    if (value.length === 4 && !submitting) handleSetupComplete(value);
  };

  const handleSetupComplete = async (finalPin) => {
    setError("");
    if (finalPin !== pin) {
      setError("PINs do not match. Try again.");
      setConfirmPin(""); setStep(2); setPin(""); return;
    }
    setSubmitting(true);
    try {
      await setupPin(shopName, finalPin, email.trim(), password, { register: isRegister });
      toast.success(`Welcome, ${shopName}`);
      navigate("/dashboard");
    } catch (err) {
      setError(friendlyError(err));
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-white">
      {/* Left visual panel — desktop only */}
      <div className="hidden md:flex md:w-1/2 relative items-end p-12 bg-zinc-950">
        <img
          src="https://images.pexels.com/photos/17489151/pexels-photo-17489151.jpeg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-zinc-950 via-zinc-950/80 to-transparent" />
        <div className="relative z-10 text-white max-w-md">
          <div className="kpi-label text-zinc-400 mb-3">Store Management</div>
          <h1 className="font-heading text-4xl lg:text-5xl font-bold tracking-tight leading-[1.05] mb-6">
            Repairs.<br />Ledger.<br />Everything.
          </h1>
          <p className="text-sm text-zinc-300 leading-relaxed max-w-sm">
            LapyTrack — sign in with your shop email. Each store has its own account. Use your PIN only to unlock while already logged in.
          </p>
        </div>
      </div>

      {/* Right: auth form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-8 bg-white">
        <div className="w-full max-w-sm">

          {setupStatus?.offline && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2.5 rounded-sm mb-6">
              <WifiOff className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>Cannot reach server — the backend may be waking up. Wait 30 seconds and refresh.</span>
            </div>
          )}

          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-8">
            <div className="w-9 h-9 bg-zinc-950 flex items-center justify-center rounded-sm">
              <Cpu className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-heading font-bold text-sm tracking-tight text-zinc-950 leading-tight">LAPYTRACK</div>
              <div className="text-[9px] tracking-[0.15em] uppercase font-semibold text-zinc-500 leading-tight">Store Manager</div>
            </div>
          </div>

          {/* ── EMAIL LOGIN ── */}
          {mode === "email-login" && (
            <>
              <h2 className="font-heading text-3xl font-bold tracking-tight mb-1">Sign in</h2>
              <p className="text-sm text-zinc-500 mb-8">Use your shop email and password</p>

              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div>
                  <Label className="kpi-label">Email</Label>
                  <Input value={email} onChange={e => setEmail(e.target.value)}
                    type="email" placeholder="you@example.com" autoFocus
                    className="mt-1.5 rounded-sm border-zinc-300 h-11" />
                </div>
                <div>
                  <Label className="kpi-label">Password</Label>
                  <div className="relative mt-1.5">
                    <Input value={password} onChange={e => setPassword(e.target.value)}
                      type={showPw ? "text" : "password"} placeholder="••••••••"
                      className="rounded-sm border-zinc-300 h-11 pr-10" />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {error && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-sm">{error}</div>
                )}
                <Button type="submit" disabled={submitting} className="w-full rounded-sm bg-zinc-950 h-11">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign in"}
                </Button>
              </form>

              {setupStatus?.allow_register && (
                <div className="mt-8 pt-6 border-t border-zinc-200">
                  <p className="text-sm text-zinc-600 text-center mb-4 font-medium">
                    Don&apos;t have a shop account yet?
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={startRegister}
                    className="w-full rounded-sm h-11 border-zinc-300 text-zinc-950 hover:bg-zinc-50 font-medium"
                  >
                    Create a new shop account
                  </Button>
                </div>
              )}
            </>
          )}

          {/* ── SETUP MODE ── */}
          {mode === "setup" && (
            <>
              <div className="flex items-center gap-1.5 mb-2">
                <ShieldCheck className="w-3.5 h-3.5 text-zinc-500" />
                <span className="kpi-label">{isRegister ? "New shop account" : "First-time Setup"}</span>
              </div>
              <h2 className="font-heading text-3xl font-bold tracking-tight mb-1">
                {step === 1 && (isRegister ? "Register your shop" : "Create your account")}
                {step === 2 && "Set your PIN"}
                {step === 3 && "Confirm PIN"}
              </h2>
              <p className="text-sm text-zinc-500 mb-6">
                {step === 1 && "Your shop name, email, and password — each shop gets its own login."}
                {step === 2 && "Pick a 4-digit PIN to unlock the app while you're logged in."}
                {step === 3 && "Enter the PIN again to confirm."}
              </p>

              {/* Step dots */}
              <div className="flex gap-1.5 mb-7">
                {[1,2,3].map(s => (
                  <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? "bg-zinc-950" : "bg-zinc-200"}`} />
                ))}
              </div>

              {step === 1 && (
                <form onSubmit={handleSetupStep1} className="space-y-4">
                  <div>
                    <Label className="kpi-label">Shop name *</Label>
                    <Input value={shopName} onChange={e => setShopName(e.target.value)} autoFocus
                      placeholder="e.g. Krish Computer" className="mt-1.5 rounded-sm border-zinc-300 h-11" />
                  </div>
                  <div>
                    <Label className="kpi-label">Email *</Label>
                    <Input value={email} onChange={e => setEmail(e.target.value)}
                      type="email" placeholder="you@example.com" className="mt-1.5 rounded-sm border-zinc-300 h-10 text-sm" />
                  </div>
                  <div>
                    <Label className="kpi-label">Password * <span className="text-zinc-400 font-normal">(min 10 chars)</span></Label>
                    <div className="relative mt-1.5">
                      <Input value={password} onChange={e => setPassword(e.target.value)}
                        type={showPw ? "text" : "password"} placeholder="••••••••"
                        className="rounded-sm border-zinc-300 h-10 text-sm pr-10" />
                      <button type="button" onClick={() => setShowPw(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">
                        {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <Label className="kpi-label">Confirm password *</Label>
                    <Input value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                      type="password" placeholder="••••••••"
                      className="mt-1.5 rounded-sm border-zinc-300 h-10 text-sm" />
                  </div>
                  <p className="text-xs text-zinc-400">
                    Email + password signs you in. PIN only unlocks the app after you&apos;re already logged in.
                  </p>
                  {error && (
                    <div className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-sm">{error}</div>
                  )}
                  <Button type="submit" className="w-full bg-zinc-950 hover:bg-zinc-800 text-white rounded-sm h-11">
                    Continue <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                  {isRegister && (
                    <Button type="button" variant="outline" onClick={backToSignIn}
                      className="w-full rounded-sm h-10 border-zinc-300">
                      Back to sign in
                    </Button>
                  )}
                </form>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <InputOTP maxLength={4} value={pin} onChange={handleSetupPinChange} autoFocus
                      inputMode="numeric" pattern="^[0-9]+$">
                      <InputOTPGroup className="gap-2">
                        {[0,1,2,3].map(i => (
                          <InputOTPSlot key={i} index={i}
                            className="w-14 h-14 md:w-16 md:h-16 text-2xl font-bold rounded-sm border-zinc-300 border first:border-l" />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <button type="button" onClick={() => { setStep(1); setPin(""); setError(""); }}
                    className="text-xs text-zinc-500 hover:text-zinc-950 mx-auto block">
                    ← Back
                  </button>
                  {isRegister && (
                    <button type="button" onClick={backToSignIn}
                      className="text-xs text-zinc-500 hover:text-zinc-950 mx-auto block">
                      Back to sign in
                    </button>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <InputOTP maxLength={4} value={confirmPin} onChange={handleConfirmPinChange}
                      autoFocus disabled={submitting} inputMode="numeric" pattern="^[0-9]+$">
                      <InputOTPGroup className="gap-2">
                        {[0,1,2,3].map(i => (
                          <InputOTPSlot key={i} index={i}
                            className="w-14 h-14 md:w-16 md:h-16 text-2xl font-bold rounded-sm border-zinc-300 border first:border-l" />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  {submitting && (
                    <div className="flex items-center justify-center text-xs text-zinc-500">
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> Setting up…
                    </div>
                  )}
                  {error && (
                    <div className="text-xs text-center text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-sm">{error}</div>
                  )}
                  <button type="button" onClick={() => { setStep(2); setPin(""); setConfirmPin(""); setError(""); }}
                    className="text-xs text-zinc-500 hover:text-zinc-950 mx-auto block">
                    ← Choose a different PIN
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
