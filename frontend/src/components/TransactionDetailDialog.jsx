import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  TrendingUp, TrendingDown, Landmark, Clock, Trash2, IndianRupee, Pencil,
} from "lucide-react";
import { txnRemaining, BankChipPicker } from "@/components/PaymentMethodPicker";
import CreditPaymentActions from "@/components/CreditPaymentActions";

function fmtAmount(n) { return Number(n).toLocaleString("en-IN"); }

function fmtDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export default function TransactionDetailDialog({
  txnId,
  customerName,
  banks = [],
  categories = [],
  onClose,
  onUpdated,
  onDeleted,
}) {
  const [txn, setTxn] = useState(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!txnId) { setTxn(null); setEditing(false); return; }
    setLoading(true);
    setEditing(false);
    api.get(`/transactions/${txnId}`)
      .then(({ data }) => setTxn(data))
      .catch(() => toast.error("Could not load transaction"))
      .finally(() => setLoading(false));
  }, [txnId]);

  const refresh = () => {
    if (!txnId) return;
    api.get(`/transactions/${txnId}`)
      .then(({ data }) => { setTxn(data); onUpdated?.(); })
      .catch(() => {});
  };

  const startEdit = () => {
    setForm({
      amount: String(txn.amount),
      type: txn.type,
      category: txn.category || "Other",
      payment_method: txn.payment_method || banks[0]?.name || "Cash",
      note: txn.note || "",
    });
    setEditing(true);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    setSaving(true);
    try {
      await api.put(`/transactions/${txnId}`, {
        amount: amt,
        type: form.type,
        category: form.category,
        payment_method: form.payment_method,
        note: form.note || null,
      });
      toast.success("Transaction updated");
      setEditing(false);
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update");
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/transactions/${txnId}`);
      toast.success("Transaction deleted");
      onDeleted?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to delete");
    } finally { setDeleting(false); setConfirmDelete(false); }
  };

  const remaining = txn ? txnRemaining(txn) : 0;
  const payments = txn?.payments || [];
  const isCredit = txn?.type === "credit";
  const typeCategories = categories.filter(c => c.type === form?.type || c.type === "both");

  return (
    <>
    <Dialog open={!!txnId} onOpenChange={open => !open && onClose()}>
      <DialogContent className="rounded-sm max-w-[calc(100vw-1rem)] sm:max-w-md max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg pr-6">
            {editing ? "Edit Transaction" : "Transaction Details"}
          </DialogTitle>
        </DialogHeader>

        {loading && <div className="py-8 text-center text-sm text-zinc-500">Loading…</div>}

        {/* ── Edit mode ── */}
        {!loading && txn && editing && (
          <form onSubmit={handleSaveEdit} className="space-y-4 -mt-1">
            <div>
              <Label className="kpi-label mb-1.5 block">Type</Label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setForm(f => ({ ...f, type: "credit" }))}
                  className={`flex items-center justify-center gap-2 h-10 rounded-sm border text-sm font-semibold transition-colors ${form.type === "credit" ? "bg-green-700 text-white border-green-700" : "border-zinc-300 text-zinc-600"}`}>
                  <TrendingUp className="w-4 h-4" /> You Got
                </button>
                <button type="button" onClick={() => setForm(f => ({ ...f, type: "debit" }))}
                  className={`flex items-center justify-center gap-2 h-10 rounded-sm border text-sm font-semibold transition-colors ${form.type === "debit" ? "bg-red-600 text-white border-red-600" : "border-zinc-300 text-zinc-600"}`}>
                  <TrendingDown className="w-4 h-4" /> You Gave
                </button>
              </div>
            </div>
            <div>
              <Label className="kpi-label mb-1.5 block">Amount (₹)</Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <Input value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  inputMode="decimal" placeholder="0"
                  className="pl-9 rounded-sm border-zinc-300 h-12 text-xl font-bold tabular-nums" />
              </div>
            </div>
            {categories.length > 0 && (
              <div>
                <Label className="kpi-label mb-1.5 block">Category</Label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-zinc-300 rounded-sm px-3 h-10 text-sm bg-white">
                  {typeCategories.map(c => <option key={c.id || c.name} value={c.name}>{c.name}</option>)}
                </select>
              </div>
            )}
            {banks.length > 0 && (
              <BankChipPicker
                banks={banks}
                selected={form.payment_method}
                onSelect={name => setForm(f => ({ ...f, payment_method: name }))}
              />
            )}
            <div>
              <Label className="kpi-label mb-1.5 block">Note</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                placeholder="Optional note" className="rounded-sm border-zinc-300" />
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setEditing(false)}
                className="rounded-sm h-11 border-zinc-300 flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={saving}
                className={`flex-1 rounded-sm h-11 text-white ${form.type === "credit" ? "bg-green-700 hover:bg-green-800" : "bg-red-600 hover:bg-red-700"}`}>
                {saving ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </form>
        )}

        {/* ── Read-only detail ── */}
        {!loading && txn && !editing && (
          <div className="space-y-4 -mt-1">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-sm ${
                isCredit ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
              }`}>
                {isCredit ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-base truncate">{customerName || "Personal / Other"}</div>
                <div className="text-xs text-zinc-500 mt-0.5">{txn.category || "Other"} · {fmtDateTime(txn.date)}</div>
                {txn.note && <div className="text-sm text-zinc-600 mt-1">{txn.note}</div>}
              </div>
              <div className={`font-mono text-lg font-bold flex-shrink-0 ${isCredit ? "text-green-700" : "text-red-600"}`}>
                {isCredit ? "+" : "-"}₹{fmtAmount(txn.amount)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="border border-zinc-200 rounded-sm p-2.5">
                <div className="kpi-label text-[9px]">Type</div>
                <div className="font-medium mt-0.5">{isCredit ? "You Got" : "You Gave"}</div>
              </div>
              <div className="border border-zinc-200 rounded-sm p-2.5">
                <div className="kpi-label text-[9px]">Payment</div>
                <div className="font-medium mt-0.5 flex items-center gap-1">
                  <Landmark className="w-3 h-3 text-zinc-400" />
                  {txn.payment_method || "Cash"}
                </div>
              </div>
            </div>

            {txn.on_credit && (
              <div className={`rounded-sm border px-3 py-2.5 text-sm ${
                remaining > 0
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-green-200 bg-green-50 text-green-800"
              }`}>
                <div className="flex items-center gap-1.5 font-semibold text-xs uppercase tracking-wide">
                  <Clock className="w-3.5 h-3.5" />
                  {remaining > 0 ? "On Credit" : "Fully Paid"}
                </div>
                <div className="mt-1 tabular-nums">
                  Paid ₹{fmtAmount(txn.amount_paid || 0)} of ₹{fmtAmount(txn.amount)}
                  {remaining > 0 && <span className="font-semibold"> · ₹{fmtAmount(remaining)} due</span>}
                </div>
              </div>
            )}

            {txn.on_credit && payments.length > 0 && (
              <div>
                <div className="kpi-label mb-2">Payment History</div>
                <ul className="border border-zinc-200 divide-y divide-zinc-200 rounded-sm">
                  {payments.map((p, i) => (
                    <li key={p.id || i} className="flex items-center justify-between px-3 py-2.5 text-sm gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-green-700 flex items-center gap-1">
                          <IndianRupee className="w-3 h-3" />
                          {fmtAmount(p.amount)}
                        </div>
                        <div className="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-1 flex-wrap">
                          <span>{fmtDateTime(p.date)}</span>
                          {p.payment_method && (
                            <span className="inline-flex items-center gap-0.5 bg-zinc-100 px-1.5 py-0.5 rounded-sm">
                              <Landmark className="w-2.5 h-2.5" />{p.payment_method}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-zinc-400 flex-shrink-0">#{i + 1}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {txn.on_credit && remaining > 0 && (
              <div className="flex flex-wrap gap-2">
                <CreditPaymentActions
                  txn={txn}
                  banks={banks}
                  onUpdated={refresh}
                  showUndo={txn.type === "debit"}
                />
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" onClick={startEdit}
                className="flex-1 rounded-sm h-10 border-zinc-300">
                <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
              </Button>
              <Button type="button" variant="outline" disabled={deleting} onClick={() => setConfirmDelete(true)}
                className="rounded-sm h-10 border-red-300 text-red-700 hover:bg-red-50 px-3">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>

    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <AlertDialogContent className="rounded-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-sm">Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} className="rounded-sm bg-red-600 hover:bg-red-700">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
