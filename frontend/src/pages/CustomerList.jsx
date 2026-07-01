import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
import { ArrowLeft, Search, Trash2, Plus, X, Users } from "lucide-react";

function initials(name) {
  return name.split(" ").slice(0,2).map(w => w[0]).join("").toUpperCase();
}
function avatarBg(name) {
  const colors = ["#E5E7EB","#FEE2E2","#D1FAE5","#DBEAFE","#EDE9FE","#FEF3C7","#FCE7F3"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}

export default function CustomerList() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [toDelete, setToDelete] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/customers");
      setCustomers(data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await api.delete(`/customers/${toDelete.id}`);
      toast.success(`"${toDelete.name}" deleted`);
      setToDelete(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to delete");
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      await api.post("/customers", {
        name: form.name.trim(),
        phone: form.phone || null,
        email: form.email || null,
      });
      toast.success("Contact added");
      setShowAdd(false);
      setForm({ name: "", phone: "", email: "" });
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally { setSaving(false); }
  };

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(q.toLowerCase()) ||
    (c.phone || "").includes(q)
  );

  return (
    <div className="mobile-page max-w-2xl">
      <button onClick={() => navigate("/catalog")}
        className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-950 mb-6 transition-colors touch-target">
        <ArrowLeft className="w-4 h-4" /> Back to Customize
      </button>

      <div className="flex items-end justify-between gap-4 mb-6 animate-fade-up">
        <div>
          <div className="kpi-label flex items-center gap-2"><Users className="w-3 h-3" />Contacts</div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold tracking-tight mt-1">
            Manage Contacts
          </h1>
          <p className="text-sm text-zinc-500 mt-1">{customers.length} total</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="rounded-sm bg-zinc-950 hover:bg-zinc-800 h-10 flex-shrink-0">
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Contact
        </Button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <Input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search by name or phone…"
          className="pl-9 rounded-sm border-zinc-300 h-10" />
        {q && <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2">
          <X className="w-3.5 h-3.5 text-zinc-400" />
        </button>}
      </div>

      <div className="border border-zinc-200 bg-white animate-fade-up">
        {loading ? (
          <div className="p-10 text-center text-sm text-zinc-500">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-zinc-500">
            {q ? `No contacts match "${q}"` : "No contacts yet."}
          </div>
        ) : (
          <ul className="divide-y divide-zinc-200">
            {filtered.map(c => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-zinc-700 flex-shrink-0"
                  style={{ background: avatarBg(c.name) }}>
                  {initials(c.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{c.name}</div>
                  {c.phone && <div className="text-xs text-zinc-500 font-mono">{c.phone}</div>}
                </div>
                {(c.balance || 0) !== 0 && (
                  <div className={`text-xs font-semibold font-mono flex-shrink-0 ${(c.balance || 0) > 0 ? "text-green-700" : "text-red-600"}`}>
                    ₹{Math.abs(c.balance).toLocaleString("en-IN")}
                  </div>
                )}
                <button type="button" onClick={() => setToDelete(c)}
                  className="text-zinc-300 hover:text-red-600 transition-colors p-1 flex-shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="rounded-sm max-w-[calc(100vw-1rem)] sm:max-w-sm p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="font-heading">Add Contact</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4 mt-2">
            <div>
              <Label className="kpi-label">Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Customer name" className="mt-1.5 rounded-sm border-zinc-300" autoFocus />
            </div>
            <div>
              <Label className="kpi-label">Phone</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+91 98765 43210" inputMode="tel" className="mt-1.5 rounded-sm border-zinc-300" />
            </div>
            <div>
              <Label className="kpi-label">Email</Label>
              <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="optional" type="email" className="mt-1.5 rounded-sm border-zinc-300" />
            </div>
            <Button type="submit" disabled={saving} className="w-full rounded-sm bg-zinc-950 hover:bg-zinc-800 h-10">
              {saving ? "Saving…" : "Add Contact"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!toDelete} onOpenChange={open => !open && setToDelete(null)}>
        <AlertDialogContent className="rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{toDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This also removes all their transaction history. Cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-sm">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="rounded-sm bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
