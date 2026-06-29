import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, getStepUpHeaders } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, TrendingUp, TrendingDown, Trash2, Landmark } from "lucide-react";

function fmt(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [txns, setTxns] = useState([]);
  const [tab, setTab] = useState("all");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(null); // "credit" | "debit" | null
  const [form, setForm] = useState({ amount: "", note: "", category: "Other", payment_method: "" });
  const [categories, setCategories] = useState([]);
  const [banks, setBanks] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ data: c }, { data: t }, { data: cats }, { data: b }] = await Promise.all([
        api.get(`/customers/${id}`),
        api.get("/transactions", { params: { customer_id: id } }),
        api.get("/categories"),
        api.get("/catalog/banks"),
      ]);
      setCustomer(c);
      setTxns(t);
      setCategories(cats);
      setBanks(b);
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const filtered = tab === "all" ? txns : txns.filter(t => t.type === tab);
  const balance = txns.reduce((s, t) => t.type === "credit" ? s + t.amount : s - t.amount, 0);

  const handleAdd = async (e) => {
    e.preventDefault();
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    setSaving(true);
    try {
      await api.post("/transactions", {
        amount: amt, type: showAdd, note: form.note || null,
        category: form.category,
        payment_method: form.payment_method || banks[0]?.name || "Cash",
        customer_id: id,
      });
      toast.success(showAdd === "credit" ? "Credit added" : "Debit added");
      setShowAdd(null);
      setForm({ amount: "", note: "", category: "Other", payment_method: "" });
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally { setSaving(false); }
  };

  const handleDelete = async (txnId) => {
    if (!window.confirm("Delete this transaction?")) return;
    const headers = getStepUpHeaders("delete this transaction");
    if (!headers) return;
    await api.delete(`/transactions/${txnId}`, { headers });
    toast.success("Deleted");
    load();
  };

  if (loading) return <div className="p-8 text-sm text-zinc-500">Loading…</div>;

  const typeCategories = categories.filter(c => c.type === showAdd || c.type === "both");

  return (
    <div className="mobile-page max-w-xl mx-auto">
      <button onClick={() => navigate("/ledger")} className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-950 mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Ledger
      </button>

      {/* Customer header */}
      <div className="border border-zinc-200 bg-white p-5 mb-4 animate-fade-up">
        <div className="text-lg font-heading font-bold">{customer?.name}</div>
        {customer?.phone && <div className="text-sm text-zinc-500 mt-0.5">{customer.phone}</div>}
        <div className={`mt-3 font-heading text-3xl font-bold tabular-nums ${balance > 0 ? "text-green-700" : balance < 0 ? "text-red-600" : "text-zinc-400"}`}>
          ₹{Math.abs(balance).toLocaleString("en-IN")}
        </div>
        <div className="text-xs text-zinc-500 mt-0.5">
          {balance > 0 ? "You'll get" : balance < 0 ? "You'll give" : "Settled up"}
        </div>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Button onClick={() => setShowAdd("credit")} variant="outline"
          className="h-11 rounded-sm border-green-200 text-green-700 hover:bg-green-50">
          <TrendingUp className="w-4 h-4 mr-2" /> You Got
        </Button>
        <Button onClick={() => setShowAdd("debit")} variant="outline"
          className="h-11 rounded-sm border-red-200 text-red-600 hover:bg-red-50">
          <TrendingDown className="w-4 h-4 mr-2" /> You Gave
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border border-zinc-200 mb-4 bg-white">
        {["all","credit","debit"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors touch-target ${tab === t ? "bg-zinc-950 text-white" : "text-zinc-500 hover:text-zinc-950"}`}>
            {t === "credit" ? "You'll Get" : t === "debit" ? "You'll Give" : "All"}
          </button>
        ))}
      </div>

      {/* Transaction list */}
      <div className="border border-zinc-200 bg-white">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-zinc-500">No transactions</div>
        ) : (
          <ul className="divide-y divide-zinc-200">
            {filtered.map(t => (
              <li key={t.id} className="flex items-start gap-3 px-4 py-3.5 group hover:bg-zinc-50">
                <div className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-sm mt-0.5 ${
                  t.type === "credit" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                  {t.type === "credit" ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-zinc-500">{t.category}</span>
                    {t.payment_method && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded-sm">
                        <Landmark className="w-2.5 h-2.5" />{t.payment_method}
                      </span>
                    )}
                  </div>
                  {t.note && <div className="text-sm text-zinc-800 truncate">{t.note}</div>}
                  <div className="text-[11px] text-zinc-400 mt-0.5">{fmt(t.date)}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`font-mono text-sm font-bold ${t.type === "credit" ? "text-green-700" : "text-red-600"}`}>
                    {t.type === "credit" ? "+" : "-"}₹{t.amount.toLocaleString("en-IN")}
                  </span>
                  <button onClick={() => handleDelete(t.id)}
                    className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity p-2 hover:text-red-600 touch-target">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add transaction dialog */}
      <Dialog open={!!showAdd} onOpenChange={() => setShowAdd(null)}>
        <DialogContent className="rounded-sm max-w-[calc(100vw-1.5rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {showAdd === "credit" ? "You Got (Credit)" : "You Gave (Debit)"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4 mt-2">
            <div>
              <Label className="kpi-label">Amount (₹) *</Label>
              <Input value={form.amount} onChange={e => setForm(f => ({...f, amount: e.target.value}))}
                inputMode="decimal" placeholder="0" className="mt-1.5 rounded-sm border-zinc-300 text-lg h-12" autoFocus />
            </div>
            <div>
              <Label className="kpi-label">Category</Label>
              <select value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))}
                className="mt-1.5 w-full border border-zinc-300 rounded-sm px-3 h-10 text-sm bg-white">
                {typeCategories.map(c => <option key={c.id || c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            {banks.length > 0 && (
              <div>
                <Label className="kpi-label">Payment Method</Label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {banks.map(b => (
                    <button key={b.bank_id} type="button"
                      onClick={() => setForm(f => ({ ...f, payment_method: b.name }))}
                      className={`px-3 py-1.5 text-xs rounded-sm border font-medium transition-colors ${
                        (form.payment_method || banks[0]?.name) === b.name
                          ? "bg-zinc-950 text-white border-zinc-950"
                          : "bg-white text-zinc-700 border-zinc-300 hover:border-zinc-600"
                      }`}>{b.name}</button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label className="kpi-label">Note</Label>
              <Input value={form.note} onChange={e => setForm(f => ({...f, note: e.target.value}))}
                placeholder="Optional note" className="mt-1.5 rounded-sm border-zinc-300" />
            </div>
            <Button type="submit" disabled={saving}
              className={`w-full rounded-sm h-10 ${showAdd === "credit" ? "bg-green-700 hover:bg-green-800" : "bg-red-600 hover:bg-red-700"} text-white`}>
              {saving ? "Saving…" : showAdd === "credit" ? "Add Credit" : "Add Debit"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
