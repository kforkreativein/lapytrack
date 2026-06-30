import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle2, CircleDollarSign } from "lucide-react";
import PaymentMethodPicker, { txnRemaining } from "@/components/PaymentMethodPicker";

function fmtAmount(n) { return Number(n).toLocaleString("en-IN"); }

/**
 * Full payment, partial payment, and 5-second undo for on-credit transactions.
 */
export default function CreditPaymentActions({ txn, banks, onUpdated, showUndo = true }) {
  const [partialOpen, setPartialOpen] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const [partialMethod, setPartialMethod] = useState("");
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
        const undoId = toast("Payment recorded", {
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
        void undoId;
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
    e.stopPropagation();
    recordPayment(remaining, txn.payment_method, { withUndo: isExpense });
  };

  const handlePartialSubmit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(partialAmount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (amt > remaining) { toast.error(`Maximum ₹${fmtAmount(remaining)}`); return; }
    await recordPayment(amt, partialMethod, { withUndo: isExpense });
    setPartialOpen(false);
    setPartialAmount("");
  };

  return (
    <>
      <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
        <Button
          type="button"
          size="sm"
          disabled={saving}
          onClick={handleFull}
          className={`h-7 px-2 text-[10px] rounded-sm ${
            isExpense ? "bg-red-600 hover:bg-red-700" : "bg-green-700 hover:bg-green-800"
          } text-white`}
        >
          <CheckCircle2 className="w-3 h-3 mr-0.5" />
          {fullLabel}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={(e) => { e.stopPropagation(); setPartialOpen(true); }}
          className="h-7 px-2 text-[10px] rounded-sm border-zinc-300"
        >
          <CircleDollarSign className="w-3 h-3 mr-0.5" />
          {partialLabel}
        </Button>
      </div>

      <Dialog open={partialOpen} onOpenChange={setPartialOpen}>
        <DialogContent className="rounded-sm max-w-[calc(100vw-1.5rem)] sm:max-w-sm" onClick={e => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="font-heading text-base">
              {isExpense ? "Record Partial Payment" : "Record Partial Receipt"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-zinc-500 -mt-2">
            Remaining: ₹{fmtAmount(remaining)} of ₹{fmtAmount(txn.amount)}
          </p>
          <form onSubmit={handlePartialSubmit} className="space-y-4 mt-2">
            <div>
              <Label className="kpi-label">Amount (₹) *</Label>
              <Input
                value={partialAmount}
                onChange={e => setPartialAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                className="mt-1.5 rounded-sm border-zinc-300 h-11 text-lg font-bold"
                autoFocus
              />
            </div>
            {banks.length > 0 && (
              <PaymentMethodPicker
                banks={banks}
                selected={partialMethod || banks[0]?.name}
                onSelect={setPartialMethod}
                onCredit={false}
                onCreditChange={() => {}}
              />
            )}
            <Button type="submit" disabled={saving} className="w-full rounded-sm bg-zinc-950 hover:bg-zinc-800 h-10">
              {saving ? "Saving…" : "Record Payment"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
