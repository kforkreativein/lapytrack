import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Cpu, Loader2, ShieldAlert } from "lucide-react";

export default function PinOverlay() {
  const { unlockWithPin, logout, setupStatus, formatApiErrorDetail } = useAuth();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handlePinChange = async (value) => {
    setPin(value);
    setError("");
    if (value.length === 4 && !submitting) {
      setSubmitting(true);
      try {
        await unlockWithPin(value);
      } catch (err) {
        const msg = !err.response
          ? "Cannot reach server — is the backend running?"
          : (formatApiErrorDetail(err.response?.data?.detail) || "Incorrect PIN");
        setError(msg);
        setPin("");
      } finally {
        setSubmitting(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-xs text-center animate-fade-up">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 bg-zinc-950 flex items-center justify-center rounded-sm">
            <Cpu className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 mb-3">
          <ShieldAlert className="w-4 h-4 text-zinc-400" />
          <span className="kpi-label">Session locked</span>
        </div>

        <h2 className="font-heading text-2xl font-bold tracking-tight mb-1">
          {setupStatus?.shop_name || "Krish Computer"}
        </h2>
        <p className="text-sm text-zinc-500 mb-8">
          Enter your PIN to continue
        </p>

        <div className="flex justify-center mb-4">
          <InputOTP
            maxLength={4}
            value={pin}
            onChange={handlePinChange}
            disabled={submitting}
            inputMode="numeric"
            autoFocus
          >
            <InputOTPGroup className="gap-3">
              {[0, 1, 2, 3].map((i) => (
                <InputOTPSlot
                  key={i}
                  index={i}
                  className="w-14 h-14 text-2xl font-bold rounded-sm border-zinc-300 border first:border-l data-[active=true]:ring-2 data-[active=true]:ring-zinc-950"
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        {submitting && (
          <div className="flex items-center justify-center gap-2 text-xs text-zinc-500 mb-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifying…
          </div>
        )}

        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-sm mb-4">
            {error}
          </div>
        )}

        <button
          onClick={logout}
          className="text-xs text-zinc-400 hover:text-zinc-600 mt-4 underline"
        >
          Sign out instead
        </button>
      </div>
    </div>
  );
}
