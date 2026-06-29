import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";
import { Lock, LogOut, ShieldCheck, Cpu, ChevronRight, Mail, Eye, EyeOff, KeyRound } from "lucide-react";

export default function Settings() {
  const { user, changePin, changePassword, setEmailPassword, logout, lockNow, formatApiErrorDetail } = useAuth();
  const navigate = useNavigate();
  const [pinStep, setPinStep] = useState(0); // 0=hidden, 1=current, 2=new, 3=confirm
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [saving, setSaving] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState(user?.email || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");

  // Change password
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmNewPw, setConfirmNewPw] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwError, setPwError] = useState("");

  const handleCurrentPin = (v) => {
    setCurrentPin(v);
    setPinError("");
    if (v.length === 4) setPinStep(2);
  };
  const handleNewPin = (v) => {
    setNewPin(v);
    setPinError("");
    if (v.length === 4) setPinStep(3);
  };
  const handleConfirmPin = async (v) => {
    setConfirmPin(v);
    setPinError("");
    if (v.length === 4) {
      if (v !== newPin) { setPinError("PINs do not match"); setConfirmPin(""); setPinStep(2); setNewPin(""); return; }
      setSaving(true);
      try {
        await changePin(currentPin, v);
        toast.success("PIN changed successfully");
        setPinStep(0); setCurrentPin(""); setNewPin(""); setConfirmPin("");
      } catch (err) {
        const msg = formatApiErrorDetail(err.response?.data?.detail) || "Failed to change PIN";
        setPinError(msg);
        setPinStep(1); setCurrentPin(""); setNewPin(""); setConfirmPin("");
      } finally { setSaving(false); }
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!currentPw) { setPwError("Enter your current password"); return; }
    if (newPw.length < 10) { setPwError("New password must be at least 10 characters"); return; }
    if (newPw !== confirmNewPw) { setPwError("Passwords do not match"); return; }
    setSaving(true); setPwError("");
    try {
      await changePassword(currentPw, newPw);
      toast.success("Password changed successfully");
      setPwOpen(false); setCurrentPw(""); setNewPw(""); setConfirmNewPw("");
    } catch (err) {
      setPwError(formatApiErrorDetail(err.response?.data?.detail) || "Failed to change password");
    } finally { setSaving(false); }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/unlock", { replace: true });
  };

  const handleEmailPassword = async (e) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail.includes("@")) { setEmailError("Enter a valid email"); return; }
    if (password.length < 10) { setEmailError("Password must be at least 10 characters"); return; }
    if (password !== confirmPassword) { setEmailError("Passwords do not match"); return; }
    setSaving(true);
    setEmailError("");
    try {
      await setEmailPassword(cleanEmail, password);
      toast.success("Email sign-in updated");
      setPassword("");
      setConfirmPassword("");
      setEmailOpen(false);
    } catch (err) {
      setEmailError(formatApiErrorDetail(err.response?.data?.detail) || "Failed to update email sign-in");
    } finally { setSaving(false); }
  };

  return (
    <div className="mobile-page max-w-lg mx-auto">
      <div className="mb-8 animate-fade-up">
        <div className="kpi-label">Store Management</div>
        <h1 className="font-heading text-2xl md:text-4xl font-bold tracking-tight mt-1">Settings</h1>
      </div>

      {/* Shop info */}
      <div className="border border-zinc-200 bg-white mb-4 animate-fade-up">
        <div className="px-4 md:px-5 py-3 border-b border-zinc-200 bg-zinc-50">
          <div className="kpi-label">Shop Info</div>
        </div>
        <div className="p-4 md:p-5 flex items-center gap-3">
          <div className="w-10 h-10 bg-zinc-950 flex items-center justify-center rounded-sm flex-shrink-0">
            <Cpu className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <div className="font-heading font-bold text-sm tracking-tight">{user?.shop_name || user?.name || "Krish Computer"}</div>
            <div className="text-[10px] tracking-[0.15em] uppercase font-semibold text-zinc-500">Life Services</div>
          </div>
        </div>
      </div>

      {/* Security */}
      <div className="border border-zinc-200 bg-white mb-4 animate-fade-up">
        <div className="px-4 md:px-5 py-3 border-b border-zinc-200 bg-zinc-50">
          <div className="kpi-label">Security</div>
        </div>

        {/* Change PIN */}
        <div className="p-4 md:p-5">
          {pinStep === 0 ? (
            <button onClick={() => setPinStep(1)}
              className="w-full flex items-center justify-between group touch-target">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-4 h-4 text-zinc-500" />
                <span className="text-sm font-medium">Change PIN</span>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-950 transition-colors" />
            </button>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium">
                  {pinStep === 1 ? "Enter current PIN" : pinStep === 2 ? "Enter new PIN" : "Confirm new PIN"}
                </span>
                <button onClick={() => { setPinStep(0); setCurrentPin(""); setNewPin(""); setConfirmPin(""); setPinError(""); }}
                  className="text-xs text-zinc-500 hover:text-zinc-950">Cancel</button>
              </div>
              <div className="flex justify-center mb-3 overflow-x-auto hide-scrollbar">
                {pinStep === 1 && (
                  <InputOTP maxLength={4} value={currentPin} onChange={handleCurrentPin} autoFocus inputMode="numeric">
                    <InputOTPGroup className="gap-2">
                      {[0,1,2,3].map(i => <InputOTPSlot key={i} index={i} className="w-12 h-12 text-xl font-bold rounded-sm border-zinc-300 border first:border-l" />)}
                    </InputOTPGroup>
                  </InputOTP>
                )}
                {pinStep === 2 && (
                  <InputOTP maxLength={4} value={newPin} onChange={handleNewPin} autoFocus inputMode="numeric">
                    <InputOTPGroup className="gap-2">
                      {[0,1,2,3].map(i => <InputOTPSlot key={i} index={i} className="w-12 h-12 text-xl font-bold rounded-sm border-zinc-300 border first:border-l" />)}
                    </InputOTPGroup>
                  </InputOTP>
                )}
                {pinStep === 3 && (
                  <InputOTP maxLength={4} value={confirmPin} onChange={handleConfirmPin} autoFocus disabled={saving} inputMode="numeric">
                    <InputOTPGroup className="gap-2">
                      {[0,1,2,3].map(i => <InputOTPSlot key={i} index={i} className="w-12 h-12 text-xl font-bold rounded-sm border-zinc-300 border first:border-l" />)}
                    </InputOTPGroup>
                  </InputOTP>
                )}
              </div>
              {pinError && <div className="text-xs text-center text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-sm">{pinError}</div>}
            </div>
          )}
        </div>

        {/* Change Password */}
        {user?.has_email && (
          <div className="border-t border-zinc-200 p-4 md:p-5">
            {!pwOpen ? (
              <button onClick={() => setPwOpen(true)}
                className="w-full flex items-center justify-between group touch-target">
                <div className="flex items-center gap-3">
                  <KeyRound className="w-4 h-4 text-zinc-500" />
                  <span className="text-sm font-medium">Change Password</span>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-950 transition-colors" />
              </button>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">Change Password</span>
                  <button type="button" onClick={() => { setPwOpen(false); setPwError(""); setCurrentPw(""); setNewPw(""); setConfirmNewPw(""); }}
                    className="text-xs text-zinc-500 hover:text-zinc-950">Cancel</button>
                </div>
                <div>
                  <Label className="kpi-label">Current password</Label>
                  <Input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)}
                    className="mt-1.5 rounded-sm border-zinc-300 h-10" placeholder="••••••••" autoFocus />
                </div>
                <div>
                  <Label className="kpi-label">New password</Label>
                  <div className="relative mt-1.5">
                    <Input type={showNewPw ? "text" : "password"} value={newPw} onChange={e => setNewPw(e.target.value)}
                      className="rounded-sm border-zinc-300 h-10 pr-10" placeholder="Min 6 characters" />
                    <button type="button" onClick={() => setShowNewPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700">
                      {showNewPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <Label className="kpi-label">Confirm new password</Label>
                  <Input type="password" value={confirmNewPw} onChange={e => setConfirmNewPw(e.target.value)}
                    className="mt-1.5 rounded-sm border-zinc-300 h-10" placeholder="Repeat new password" />
                </div>
                {pwError && <div className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-sm">{pwError}</div>}
                <Button type="submit" disabled={saving} className="w-full rounded-sm bg-zinc-950 hover:bg-zinc-800 h-10">
                  {saving ? "Saving..." : "Update Password"}
                </Button>
              </form>
            )}
          </div>
        )}

        <div className="border-t border-zinc-200 p-4 md:p-5">
          {!emailOpen ? (
            <button onClick={() => { setEmailOpen(true); setEmail(user?.email || ""); }}
              className="w-full flex items-center justify-between group mb-5 touch-target">
              <div className="flex items-center gap-3 text-left">
                <Mail className="w-4 h-4 text-zinc-500" />
                <div>
                  <div className="text-sm font-medium">Email & Password</div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    {user?.has_email ? (user?.email || "Configured") : (user?.email ? user.email : "Add sign-in email")}
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-950 transition-colors" />
            </button>
          ) : (
            <form onSubmit={handleEmailPassword} className="mb-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Email & Password</div>
                  <div className="text-xs text-zinc-400 mt-0.5">Used only if PIN access is unavailable.</div>
                </div>
                <button
                  type="button"
                  onClick={() => { setEmailOpen(false); setEmailError(""); setPassword(""); setConfirmPassword(""); }}
                  className="text-xs text-zinc-500 hover:text-zinc-950"
                >
                  Cancel
                </button>
              </div>
              <div>
                <Label className="kpi-label">Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="mt-1.5 rounded-sm border-zinc-300 h-10"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <Label className="kpi-label">Password</Label>
                <div className="relative mt-1.5">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="rounded-sm border-zinc-300 h-10 pr-10"
                    placeholder="Minimum 6 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div>
                <Label className="kpi-label">Confirm password</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="mt-1.5 rounded-sm border-zinc-300 h-10"
                  placeholder="Repeat password"
                />
              </div>
              {emailError && <div className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-sm">{emailError}</div>}
              <Button type="submit" disabled={saving} className="w-full rounded-sm bg-zinc-950 hover:bg-zinc-800 h-10">
                {saving ? "Saving..." : user?.has_email ? "Update Email Login" : "Add Email Login"}
              </Button>
            </form>
          )}

          <div className={emailOpen ? "border-t border-zinc-200 pt-5" : ""}>
          <button onClick={lockNow} className="w-full flex items-center gap-3 text-sm font-medium text-zinc-700 hover:text-zinc-950 transition-colors">
            <Lock className="w-4 h-4 text-zinc-500" />
            Lock App Now
            <span className="ml-auto text-xs text-zinc-400">Requires PIN</span>
          </button>
          </div>
        </div>
      </div>

      {/* Sign out */}
      <div className="border border-zinc-200 bg-white animate-fade-up">
        <div className="p-4 md:p-5">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 text-sm font-medium text-red-600 hover:text-red-700 transition-colors">
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>

      <div className="text-center text-[10px] text-zinc-400 mt-8">
        Krish Computer Life Services · Store Manager v1.0
      </div>
    </div>
  );
}
