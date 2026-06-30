import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle2, CircleDollarSign } from "lucide-react";
import { BankChipPicker, txnRemaining } from "@/components/PaymentMethodPicker";

function fmtAmount(n) { return Number(n).toLocaleString("en-IN"); }

/**
 * Full payment, partial payment, and 5-second undo for on-credit transactions.
 */
export default function CreditPaymentActions({ txn, banks, onUpdated, showUndo = true, compact = false }) {
  const [partialOpen, setPartialOpen] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const [partialMethod, setPartialMethod] = useState("");
  const [fullOpen, setFullOpen] = useState(false);
  const [fullMethod, setFullMethod] = useState("");
  const [saving, setSaving] = useState(false);

  const remaining = txnRemaining(txn);
  if (!txn?.on_credit || remaining <= 0) return null;

  const isExpense = txn.type === "debit";
  const fullLabel = isExpense ? "Paid Full" : "Received Full";
  const partialLabel = isExpense ? "Part Pay" : "Part Received";

  const recordPayment = async (amount, paymentMethod, { withUndo = false } = {}) => {
    setSaving(true);
    try {
      await api.post(`/transactions/${txn.id}/payments`, {
        amount,
        payment_method: paymentMethod || banks[0]?.name || "Cash",
      });
      onUpdated();

      if (withUndo && showUndo) {
        toast("Payment recorded", {
          description: `₹${fmtAmount(amount)} — tap Undo within 5 seconds`,
          duration: 5000,
          action: {
            label: "Undo",
            onClick: async () => {
              try {
                await api.delete(`/transactions/${txn.id}/payments/last`);
                toast.success("Payment undone");
                onUpdated();
              } catch {
                toast.error("Could not undo");
              }
            },
          },
        });
      } else {
        toast.success(amount >= remaining - 0.01 ? "Full payment recorded" : "Partial payment recorded");
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to record payment");
    } finally {
      setSaving(false);
    }
  };

  const handleFull = (e) => {
    e?.stopPropagation?.();
    setFullMethod(banks[0]?.name || "");
    setFullOpen(true);
  };

  const handleFullSubmit = async (e) => {
    e.preventDefault();
    await recordPayment(remaining, fullMethod || banks[0]?.name || "Cash", { withUndo: isExpense });
    setFullOpen(false);
    setFullMethod("");
  };

  const handlePartialSubmit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(partialAmount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (amt > remaining) { toast.error(`Maximum ₹${fmtAmount(remaining)}`); return; }
    await recordPayment(amt, partialMethod || banks[0]?.name, { withUndo: false });
    setPartialOpen(false);
    setPartialAmount("");
    setPartialMethod("");
  };

  const btnClass = compact
    ? "h-8 px-2.5 text-[11px] rounded-sm flex-1 sm:flex-none"
    : "h-8 px-3 text-xs rounded-sm flex-1 sm:flex-none";

  return (
    <>
      <div className="flex flex-wrap gap-2" onClick={e => e.stopPropagation()}>
        <Button
          type="button"
          size="sm"
          disabled={saving}
          onClick={handleFull}
          className={`${btnClass} ${isExpense ? "bg-red-600 hover:bg-red-700" : "bg-green-700 hover:bg-green-800"} text-white`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
          {fullLabel}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={(e) => { e.stopPropagation(); setPartialOpen(true); }}
          className={`${btnClass} border-zinc-300`}
        >
          <CircleDollarSign className="w-3.5 h-3.5 mr-1" />
          {partialLabel}
        </Button>
      </div>

      <Dialog open={fullOpen} onOpenChange={setFullOpen}>
        <DialogContent
          className="rounded-sm max-w-[calc(100vw-1rem)] sm:max-w-sm p-4 sm:p-6"
          onClick={e => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle className="font-heading text-base">
              {isExpense ? "Full Payment" : "Full Receipt"}
            </DialogTitle>
          </DialogHeader>
          <div className="rounded-sm border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm -mt-1">
            <div className="text-zinc-500 text-xs">Amount to {isExpense ? "pay" : "receive"}</div>
            <div className="font-bold text-lg tabular-nums mt-0.5">₹{fmtAmount(remaining)}</div>
          </div>
          <form onSubmit={handleFullSubmit} className="space-y-4">
            {banks.length > 0 && (
              <BankChipPicker
                banks={banks}
                selected={fullMethod || banks[0]?.name}
                onSelect={setFullMethod}
              />
            )}
            <Button type="submit" disabled={saving} className={`w-full rounded-sm h-11 text-white ${isExpense ? "bg-red-600 hover:bg-red-700" : "bg-green-700 hover:bg-green-800"}`}>
              {saving ? "Saving…" : `Record ₹${fmtAmount(remaining)}`}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={partialOpen} onOpenChange={setPartialOpen}>
        <DialogContent
          className="rounded-sm max-w-[calc(100vw-1rem)] sm:max-w-sm p-4 sm:p-6"
          onClick={e => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle className="font-heading text-base">
              {isExpense ? "Partial Payment" : "Partial Receipt"}
            </DialogTitle>
          </DialogHeader>

          <div className="rounded-sm border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm -mt-1">
            <div className="text-zinc-500 text-xs">Remaining balance</div>
            <div className="font-bold text-lg tabular-nums mt-0.5">
              ₹{fmtAmount(remaining)}
              <span className="text-zinc-400 font-normal text-sm"> / ₹{fmtAmount(txn.amount)}</span>
            </div>
          </div>

          <form onSubmit={handlePartialSubmit} className="space-y-4">
            <div>
              <Label className="kpi-label">Amount (₹)</Label>
              <Input
                value={partialAmount}
                onChange={e => setPartialAmount(e.target.value)}
                inputMode="decimal"
                placeholder={`Up to ${fmtAmount(remaining)}`}
                className="mt-1.5 rounded-sm border-zinc-300 h-12 text-xl font-bold tabular-nums"
                autoFocus
              />
            </div>
            {banks.length > 0 && (
              <BankChipPicker
                banks={banks}
                selected={partialMethod || banks[0]?.name}
                onSelect={setPartialMethod}
              />
            )}
            <Button type="submit" disabled={saving} className="w-full rounded-sm bg-zinc-950 hover:bg-zinc-800 h-11">
              {saving ? "Saving…" : "Record Payment"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
