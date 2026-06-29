import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, downloadCsv } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus, Search, TrendingUp, TrendingDown, Minus, Users, X,
  UserPlus, IndianRupee, ChevronRight, Download,
  CalendarDays, Landmark, ArrowLeft, ArrowRight, Pencil, Trash2,
} from "lucide-react";

function avatarBg(name) {
  const colors = ["#E5E7EB","#FEE2E2","#D1FAE5","#DBEAFE","#EDE9FE","#FEF3C7","#FCE7F3"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}
function initials(name) {
  return name.split(" ").slice(0,2).map(w => w[0]).join("").toUpperCase();
}
function fmtAmount(n) { return Number(n).toLocaleString("en-IN"); }
function fmtDateTime(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}
function dateInputValue(date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
}
function dateBounds(value) {
  const [year, month, day] = value.split("-").map(Number);
  const start = new Date(year, month - 1, day);
  const end = new Date(year, month - 1, day + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}
function shiftDate(value, days) {
  const [year, month, day] = value.split("-").map(Number);
  return dateInputValue(new Date(year, month - 1, day + days));
}
function displayDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ── Customer picker ───────────────────────────────────────────────────────────
function CustomerPicker({ customers, value, onChange, onCreateNew }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(q.toLowerCase()) || (c.phone || "").includes(q)
  ).slice(0, 8);

  const noExactMatch = q.trim() && !customers.some(c => c.name.toLowerCase() === q.trim().toLowerCase());

  if (value) {
    return (
      <div className="flex items-center gap-2 border border-zinc-200 rounded-sm px-3 py-2.5 bg-zinc-50">
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-zinc-700 flex-shrink-0"
          style={{ background: avatarBg(value.name) }}>
          {initials(value.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{value.name}</div>
          {value.phone && <div className="text-xs text-zinc-400">{value.phone}</div>}
        </div>
        <button type="button" onClick={() => { onChange(null); setQ(""); }}
          className="text-zinc-400 hover:text-zinc-700 p-0.5">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
        <Input
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search by name or phone…"
          className="pl-9 rounded-sm border-zinc-300 h-10 text-sm"
          autoComplete="off"
        />
      </div>
      {open && (q || filtered.length > 0) && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 border border-zinc-200 bg-white rounded-sm shadow-lg max-h-48 overflow-y-auto">
          {filtered.map(c => (
            <button key={c.id} type="button"
              onMouseDown={() => { onChange(c); setOpen(false); setQ(""); }}
              className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 hover:bg-zinc-50 transition-colors">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-zinc-700 flex-shrink-0"
                style={{ background: avatarBg(c.name) }}>
                {initials(c.name)}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{c.name}</div>
                {c.phone && <div className="text-xs text-zinc-400">{c.phone}</div>}
              </div>
            </button>
          ))}
          {noExactMatch && (
            <button type="button"
              onMouseDown={() => { setOpen(false); onCreateNew(q.trim()); setQ(""); }}
              className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 hover:bg-zinc-50 transition-colors border-t border-zinc-100 text-green-700">
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border-2 border-dashed border-green-400 text-green-600">
                <Plus className="w-3.5 h-3.5" />
              </div>
              <div className="text-sm font-medium">Create "{q.trim()}"</div>
            </button>
          )}
          {filtered.length === 0 && !noExactMatch && (
            <div className="px-3 py-2.5 text-xs text-zinc-400">No customers match</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Add Customer dialog ───────────────────────────────────────────────────────
function AddCustomerDialog({ open, onClose, onSaved, initialName = "" }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", note: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(f => ({ ...f, name: initialName }));
  }, [open, initialName]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const { data } = await api.post("/customers", {
        name: form.name.trim(),
        phone: form.phone || null,
        email: form.email || null,
        note: form.note || null,
      });
      toast.success("Contact added");
      setForm({ name: "", phone: "", email: "", note: "" });
      onSaved(data);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="rounded-sm max-w-[calc(100vw-1.5rem)] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading">Add Contact</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <Label className="kpi-label">Name *</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Customer name" className="mt-1.5 rounded-sm border-zinc-300" autoFocus />
          </div>
          <div>
            <Label className="kpi-label">Phone <span className="text-zinc-400 font-normal">(optional)</span></Label>
            <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="Phone number" inputMode="tel" className="mt-1.5 rounded-sm border-zinc-300" />
          </div>
          <div>
            <Label className="kpi-label">Email <span className="text-zinc-400 font-normal">(optional)</span></Label>
            <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="email@example.com" type="email" className="mt-1.5 rounded-sm border-zinc-300" />
          </div>
          <div>
            <Label className="kpi-label">Note <span className="text-zinc-400 font-normal">(optional)</span></Label>
            <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              placeholder="Optional note" className="mt-1.5 rounded-sm border-zinc-300" />
          </div>
          <Button type="submit" disabled={saving} className="w-full rounded-sm bg-zinc-950 hover:bg-zinc-800 h-10">
            {saving ? "Saving…" : "Add Contact"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Entry dialog ──────────────────────────────────────────────────────────
function AddEntryDialog({ open, onClose, customers, categories, banks, onSaved, preSelectedCustomer, onCreateNew }) {
  const emptyForm = { type: "credit", amount: "", category: "", payment_method: "", note: "" };
  const [customer, setCustomer] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (preSelectedCustomer) setCustomer(preSelectedCustomer);
  }, [preSelectedCustomer]);

  const defaultCat = categories.filter(c => c.type === form.type || c.type === "both")[0]?.name || "Other";
  const typeCategories = categories.filter(c => c.type === form.type || c.type === "both");

  const reset = () => { setCustomer(null); setForm(emptyForm); };
  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!customer) { toast.error("Select a customer"); return; }
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    setSaving(true);
    try {
      await api.post("/transactions", {
        amount: amt,
        type: form.type,
        category: form.category || defaultCat,
        payment_method: form.payment_method || banks[0]?.name || "Cash",
        note: form.note || null,
        customer_id: customer.id,
      });
      toast.success(form.type === "credit"
        ? `₹${fmtAmount(amt)} received from ${customer.name}`
        : `₹${fmtAmount(amt)} paid to ${customer.name}`);
      reset();
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="rounded-sm max-w-[calc(100vw-1.5rem)] sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">Add Entry</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-1">
          <div>
            <Label className="kpi-label mb-1.5 block">Customer *</Label>
            <CustomerPicker customers={customers} value={customer} onChange={setCustomer}
              onCreateNew={name => { onCreateNew(name); }} />
          </div>

          <div>
            <Label className="kpi-label mb-1.5 block">Type *</Label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setForm(f => ({ ...f, type: "credit", category: "" }))}
                className={`flex items-center justify-center gap-2 h-10 rounded-sm border text-sm font-semibold transition-colors ${
                  form.type === "credit" ? "bg-green-700 text-white border-green-700" : "border-zinc-300 text-zinc-600 hover:border-green-300"}`}>
                <TrendingUp className="w-4 h-4" /> You Got
              </button>
              <button type="button" onClick={() => setForm(f => ({ ...f, type: "debit", category: "" }))}
                className={`flex items-center justify-center gap-2 h-10 rounded-sm border text-sm font-semibold transition-colors ${
                  form.type === "debit" ? "bg-red-600 text-white border-red-600" : "border-zinc-300 text-zinc-600 hover:border-red-300"}`}>
                <TrendingDown className="w-4 h-4" /> You Gave
              </button>
            </div>
          </div>

          <div>
            <Label className="kpi-label mb-1.5 block">Amount (₹) *</Label>
            <div className="relative">
              <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <Input value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                inputMode="decimal" placeholder="0"
                className="pl-9 rounded-sm border-zinc-300 h-12 text-xl font-bold tabular-nums" autoFocus />
            </div>
          </div>

          <div>
            <Label className="kpi-label mb-1.5 block">Category</Label>
            <select value={form.category || defaultCat}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full border border-zinc-300 rounded-sm px-3 h-10 text-sm bg-white">
              {typeCategories.map(c => <option key={c.id || c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>

          {banks.length > 0 && (
            <div>
              <Label className="kpi-label mb-1.5 block">Payment Method</Label>
              <div className="flex flex-wrap gap-2">
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
            <Label className="kpi-label mb-1.5 block">Note <span className="text-zinc-400 font-normal normal-case">(optional)</span></Label>
            <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              placeholder="e.g. Advance for repair" className="rounded-sm border-zinc-300" />
          </div>

          <Button type="submit" disabled={saving}
            className={`w-full rounded-sm h-11 text-white ${
              form.type === "credit" ? "bg-green-700 hover:bg-green-800" : "bg-red-600 hover:bg-red-700"}`}>
            {saving ? "Saving…" : form.type === "credit" ? "Record — You Got" : "Record — You Gave"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Transaction Dialog ───────────────────────────────────────────────────
function EditTransactionDialog({ txn, banks, categories, customers, onClose, onSaved, onDeleted }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (txn) setForm({ amount: String(txn.amount), type: txn.type, category: txn.category || "Other", payment_method: txn.payment_method || "Cash", note: txn.note || "" });
  }, [txn]);

  if (!txn) return null;

  const customer = customers.find(c => c.id === txn.customer_id);
  const typeCategories = categories.filter(c => c.type === form.type || c.type === "both");

  const handleSave = async (e) => {
    e.preventDefault();
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    setSaving(true);
    try {
      await api.put(`/transactions/${txn.id}`, { amount: amt, type: form.type, category: form.category, payment_method: form.payment_method, note: form.note || null });
      toast.success("Transaction updated");
      onSaved();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/transactions/${txn.id}`);
      toast.success("Transaction deleted");
      onDeleted();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
    finally { setDeleting(false); }
  };

  return (
    <Dialog open={!!txn} onOpenChange={open => !open && onClose()}>
      <DialogContent className="rounded-sm max-w-[calc(100vw-1.5rem)] sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">Edit Transaction</DialogTitle>
        </DialogHeader>
        {customer && <div className="text-sm text-zinc-500 -mt-2 mb-1">Customer: <span className="font-medium text-zinc-900">{customer.name}</span></div>}
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <Label className="kpi-label mb-1.5 block">Type *</Label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setForm(f => ({ ...f, type: "credit", category: "" }))}
                className={`flex items-center justify-center gap-2 h-10 rounded-sm border text-sm font-semibold transition-colors ${form.type === "credit" ? "bg-green-700 text-white border-green-700" : "border-zinc-300 text-zinc-600 hover:border-green-300"}`}>
                <TrendingUp className="w-4 h-4" /> You Got
              </button>
              <button type="button" onClick={() => setForm(f => ({ ...f, type: "debit", category: "" }))}
                className={`flex items-center justify-center gap-2 h-10 rounded-sm border text-sm font-semibold transition-colors ${form.type === "debit" ? "bg-red-600 text-white border-red-600" : "border-zinc-300 text-zinc-600 hover:border-red-300"}`}>
                <TrendingDown className="w-4 h-4" /> You Gave
              </button>
            </div>
          </div>
          <div>
            <Label className="kpi-label mb-1.5 block">Amount (₹) *</Label>
            <div className="relative">
              <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <Input value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                inputMode="decimal" placeholder="0" autoFocus
                className="pl-9 rounded-sm border-zinc-300 h-12 text-xl font-bold tabular-nums" />
            </div>
          </div>
          <div>
            <Label className="kpi-label mb-1.5 block">Category</Label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full border border-zinc-300 rounded-sm px-3 h-10 text-sm bg-white">
              {typeCategories.map(c => <option key={c.id || c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          {banks.length > 0 && (
            <div>
              <Label className="kpi-label mb-1.5 block">Payment Method</Label>
              <div className="flex flex-wrap gap-2">
                {banks.map(b => (
                  <button key={b.bank_id} type="button" onClick={() => setForm(f => ({ ...f, payment_method: b.name }))}
                    className={`px-3 py-1.5 text-xs rounded-sm border font-medium transition-colors ${form.payment_method === b.name ? "bg-zinc-950 text-white border-zinc-950" : "bg-white text-zinc-700 border-zinc-300 hover:border-zinc-600"}`}>
                    {b.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <Label className="kpi-label mb-1.5 block">Note</Label>
            <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              placeholder="Optional note" className="rounded-sm border-zinc-300" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={saving} className={`flex-1 rounded-sm h-11 text-white ${form.type === "credit" ? "bg-green-700 hover:bg-green-800" : "bg-red-600 hover:bg-red-700"}`}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
            <Button type="button" variant="outline" disabled={deleting} onClick={handleDelete}
              className="rounded-sm h-11 border-red-300 text-red-700 hover:bg-red-50 px-3">
              {deleting ? "…" : <Trash2 className="w-4 h-4" />}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Ledger page ──────────────────────────────────────────────────────────
export default function Ledger() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [banks, setBanks] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [selectedDate, setSelectedDate] = useState(() => dateInputValue(new Date()));
  const [transactionVersion, setTransactionVersion] = useState(0);
  const [showEntry, setShowEntry] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [quickCreateName, setQuickCreateName] = useState("");
  const [preSelectedCustomer, setPreSelectedCustomer] = useState(null);
  const [ledgerTotals, setLedgerTotals] = useState({ total_credit: 0, total_debit: 0 });
  const [editTxn, setEditTxn] = useState(null); // transaction being edited

  const load = async () => {
    try {
      const [{ data: c }, { data: cats }, { data: b }, { data: totals }] = await Promise.all([
        api.get("/customers"),
        api.get("/categories"),
        api.get("/catalog/banks"),
        api.get("/ledger/dashboard"),
      ]);
      setCustomers(c);
      setCategories(cats);
      setBanks(b);
      setLedgerTotals({ total_credit: totals.total_credit, total_debit: totals.total_debit });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const refreshTransactions = useCallback(() => {
    const bounds = dateBounds(selectedDate);
    api.get("/transactions", { params: { start_date: bounds.start, end_date: bounds.end, limit: 500 } })
      .then(({ data }) => setTransactions(data))
      .catch(() => setTransactions([]));
  }, [selectedDate]);

  useEffect(() => { refreshTransactions(); }, [refreshTransactions, transactionVersion]);

  const handleCreateNew = (name) => {
    setQuickCreateName(name);
    setShowAddContact(true);
  };

  const handleContactSaved = async (newCustomer) => {
    await load();
    if (newCustomer) {
      setPreSelectedCustomer(newCustomer);
      setShowEntry(true); // re-open if it was closed; no-op if still open
    }
  };

  const [exportPeriod, setExportPeriod] = useState("all");
  const [exportTarget, setExportTarget] = useState(null); // "contacts" | "ledger"

  const PERIODS = [
    { value: "all", label: "All Time" },
    { value: "daily", label: "Today" },
    { value: "weekly", label: "This Week" },
    { value: "monthly", label: "This Month" },
    { value: "annual", label: "This Year" },
  ];

  const doExport = async () => {
    const params = exportPeriod !== "all" ? `?period=${exportPeriod}` : "";
    try {
      if (exportTarget === "contacts") {
        await downloadCsv("/customers/export/csv", "contacts.csv");
      } else {
        await downloadCsv(`/transactions/export/csv${params}`, "ledger.csv");
      }
      setExportTarget(null);
    } catch (err) {
      toast.error(err.message || "Export failed");
    }
  };

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(q.toLowerCase()) ||
    (c.phone || "").includes(q)
  );

  const totalGet = customers.reduce((s, c) => s + Math.max(0, c.balance || 0), 0);
  const totalGive = customers.reduce((s, c) => s + Math.max(0, -(c.balance || 0)), 0);
  const customerById = Object.fromEntries(customers.map(c => [c.id, c]));
  const dayCredit = transactions.filter(t => t.type === "credit").reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const dayDebit = transactions.filter(t => t.type === "debit").reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const todayValue = dateInputValue(new Date());

  return (
    <div className="mobile-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-6 animate-fade-up">
        <div>
          <div className="kpi-label">Financial Ledger</div>
          <h1 className="font-heading text-2xl md:text-4xl font-bold tracking-tight mt-1">Khata Book</h1>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:w-auto">
          <Button variant="outline" onClick={() => setExportTarget("contacts")}
            className="w-full sm:w-auto rounded-sm border-zinc-300 h-10 text-xs">
            <Download className="w-3.5 h-3.5 mr-1.5" /> Contacts CSV
          </Button>
          <Button variant="outline" onClick={() => { setExportPeriod("all"); setExportTarget("ledger"); }}
            className="w-full sm:w-auto rounded-sm border-zinc-300 h-10 text-xs">
            <Download className="w-3.5 h-3.5 mr-1.5" /> Ledger CSV
          </Button>
          <Button variant="outline" onClick={() => setShowAddContact(true)}
            className="w-full sm:w-auto rounded-sm border-zinc-300 h-10">
            <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Add Contact
          </Button>
          <Button onClick={() => setShowEntry(true)} className="w-full sm:w-auto rounded-sm bg-zinc-950 hover:bg-zinc-800 h-10">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Entry
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 border border-zinc-200 mb-6 animate-fade-up">
        <div className="sm:border-r border-b sm:border-b-0 border-zinc-200 p-4 md:p-5">
          <div className="kpi-label text-[9px] md:text-[10px]">Total Income (All Time)</div>
          <div className="flex items-center gap-1.5 mt-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
            <span className="font-heading text-2xl md:text-3xl font-bold tabular-nums text-green-700">
              ₹{ledgerTotals.total_credit.toLocaleString("en-IN")}
            </span>
          </div>
        </div>
        <div className="sm:border-r border-b sm:border-b-0 border-zinc-200 p-4 md:p-5">
          <div className="kpi-label text-[9px] md:text-[10px]">Total Expenses (All Time)</div>
          <div className="flex items-center gap-1.5 mt-1.5">
            <TrendingDown className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
            <span className="font-heading text-2xl md:text-3xl font-bold tabular-nums text-red-600">
              ₹{ledgerTotals.total_debit.toLocaleString("en-IN")}
            </span>
          </div>
        </div>
        <div className="p-4 md:p-5">
          <div className="kpi-label text-[9px] md:text-[10px]">Customers Owe You (Outstanding)</div>
          <div className="flex items-center gap-1.5 mt-1.5">
            <Minus className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
            <span className={`font-heading text-2xl md:text-3xl font-bold tabular-nums ${totalGet - totalGive >= 0 ? "text-green-700" : "text-red-600"}`}>
              ₹{Math.abs(totalGet - totalGive).toLocaleString("en-IN")}
            </span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <Input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search by name or phone…"
          className="pl-9 rounded-sm border-zinc-300 h-10" />
        {q && <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2">
          <X className="w-3.5 h-3.5 text-zinc-400" />
        </button>}
      </div>

      {/* Period transactions */}
      <div className="border border-zinc-200 bg-white mb-6 animate-fade-up">
        <div className="px-4 md:px-5 py-3 border-b border-zinc-200 bg-zinc-50 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="kpi-label flex items-center gap-2">
              <CalendarDays className="w-3 h-3" />
              Today's Transactions
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              {displayDate(selectedDate)} · Credit ₹{fmtAmount(dayCredit)} · Debit ₹{fmtAmount(dayDebit)}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedDate(value => shiftDate(value, -1))}
                className="w-9 h-9 border border-zinc-300 bg-white flex items-center justify-center hover:border-zinc-950 transition-colors rounded-sm"
                aria-label="Previous day"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
              <Input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value || todayValue)}
                className="h-9 w-[140px] rounded-sm border-zinc-300 bg-white text-xs"
              />
              <button
                type="button"
                onClick={() => setSelectedDate(value => shiftDate(value, 1))}
                className="w-9 h-9 border border-zinc-300 bg-white flex items-center justify-center hover:border-zinc-950 transition-colors disabled:opacity-40 disabled:hover:border-zinc-300 rounded-sm"
                aria-label="Next day"
                disabled={selectedDate >= todayValue}
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            {selectedDate !== todayValue && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedDate(todayValue)}
                className="h-9 rounded-sm border-zinc-300 text-xs"
              >
                Today
              </Button>
            )}
          </div>
        </div>
        {transactions.length === 0 ? (
          <div className="p-6 text-sm text-zinc-500 text-center">No transactions for this date</div>
        ) : (
          <ul className="divide-y divide-zinc-200">
            {transactions.slice(0, 50).map(t => {
              const customer = customerById[t.customer_id];
              return (
                <li key={t.id}
                  onClick={() => setEditTxn(t)}
                  className="px-4 md:px-5 py-3 flex items-start gap-3 cursor-pointer hover:bg-zinc-50 transition-colors group">
                  <div className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-sm ${
                    t.type === "credit" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
                  }`}>
                    {t.type === "credit" ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold truncate">{customer?.name || "Personal / Other"}</span>
                      <span className="text-[10px] uppercase tracking-wider text-zinc-400">{t.category || "Other"}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 mt-0.5">
                      <span>{fmtDateTime(t.date)}</span>
                      {t.payment_method && (
                        <span className="inline-flex items-center gap-1 bg-zinc-100 px-1.5 py-0.5 rounded-sm">
                          <Landmark className="w-2.5 h-2.5" />{t.payment_method}
                        </span>
                      )}
                      {t.note && <span className="truncate">{t.note}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className={`font-mono text-sm font-bold text-right ${t.type === "credit" ? "text-green-700" : "text-red-600"}`}>
                      {t.type === "credit" ? "+" : "-"}₹{fmtAmount(t.amount)}
                    </div>
                    <Pencil className="w-3 h-3 text-zinc-300 group-hover:text-zinc-500 transition-colors" />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Customer list */}
      <div className="border border-zinc-200 bg-white animate-fade-up">
        {loading ? (
          <div className="p-10 text-center text-sm text-zinc-500">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <Users className="w-8 h-8 text-zinc-300 mx-auto mb-3" />
            <div className="text-sm text-zinc-500 mb-3">
              {q ? "No customers match your search" : "No contacts yet."}
            </div>
            {q ? (
              <Button size="sm" variant="outline" onClick={() => handleCreateNew(q)}
                className="rounded-sm border-zinc-300 text-xs">
                <Plus className="w-3 h-3 mr-1" /> Create "{q}"
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setShowAddContact(true)}
                className="rounded-sm border-zinc-300 text-xs">
                Add your first contact
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-zinc-200">
            {filtered.map(c => (
              <li key={c.id} onClick={() => navigate(`/ledger/${c.id}`)}
                className="flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-50 cursor-pointer transition-colors group">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-zinc-700 flex-shrink-0"
                  style={{ background: avatarBg(c.name) }}>
                  {initials(c.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{c.name}</div>
                  {c.phone && <div className="text-xs text-zinc-500">{c.phone}</div>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-right">
                    <div className={`font-mono text-sm font-semibold ${
                      (c.balance || 0) > 0 ? "text-green-700" : (c.balance || 0) < 0 ? "text-red-600" : "text-zinc-400"}`}>
                      {(c.balance || 0) === 0
                        ? <span className="flex items-center gap-1"><Minus className="w-3 h-3" />Settled</span>
                        : `₹${Math.abs(c.balance).toLocaleString("en-IN")}`}
                    </div>
                    {(c.balance || 0) !== 0 && (
                      <div className="text-[10px] text-zinc-500">
                        {(c.balance || 0) > 0 ? "You'll get" : "You'll give"}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-300 group-hover:text-zinc-500 transition-colors" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Edit Transaction Dialog */}
      <EditTransactionDialog
        txn={editTxn}
        banks={banks}
        categories={categories}
        customers={customers}
        onClose={() => setEditTxn(null)}
        onSaved={() => { setEditTxn(null); load(); setTransactionVersion(v => v + 1); }}
        onDeleted={() => { setEditTxn(null); load(); setTransactionVersion(v => v + 1); }}
      />

      <AddEntryDialog
        open={showEntry}
        onClose={() => { setShowEntry(false); setPreSelectedCustomer(null); }}
        customers={customers}
        categories={categories}
        banks={banks}
        onSaved={() => { load(); setTransactionVersion(v => v + 1); }}
        preSelectedCustomer={preSelectedCustomer}
        onCreateNew={handleCreateNew}
      />

      <AddCustomerDialog
        open={showAddContact}
        onClose={() => { setShowAddContact(false); setQuickCreateName(""); }}
        onSaved={handleContactSaved}
        initialName={quickCreateName}
      />

      {/* Export period picker */}
      <Dialog open={exportTarget === "ledger"} onOpenChange={open => !open && setExportTarget(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="font-heading text-base">Export Ledger CSV</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-zinc-500 -mt-2">Choose the date range to export.</p>
          <div className="grid grid-cols-1 gap-1.5">
            {PERIODS.map(p => (
              <button key={p.value} onClick={() => setExportPeriod(p.value)}
                className={`text-left px-3 py-2.5 rounded-sm text-sm border transition-colors ${exportPeriod === p.value ? "bg-zinc-950 text-white border-zinc-950" : "border-zinc-200 hover:border-zinc-400"}`}>
                {p.label}
              </button>
            ))}
          </div>
          <Button onClick={doExport} className="w-full rounded-sm bg-zinc-950 hover:bg-zinc-800 h-10 mt-1">
            <Download className="w-3.5 h-3.5 mr-1.5" /> Download CSV
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
