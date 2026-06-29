import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Trash2, ChevronDown, ChevronRight, Tag, Cpu, Landmark, Users, Upload, Receipt, Check } from "lucide-react";

function XIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ── Editable chip — click name to rename ─────────────────────────────────────
function EditableChip({ label, onDelete, onRename }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(label);
  const inputRef = useRef();

  const startEdit = () => { setEditing(true); setTimeout(() => inputRef.current?.focus(), 0); };
  const save = async () => {
    const trimmed = val.trim();
    if (!trimmed || trimmed === label) { setVal(label); setEditing(false); return; }
    await onRename(trimmed);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1 border border-zinc-400 bg-white rounded-sm px-1.5 py-0.5">
        <input ref={inputRef} value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") { setVal(label); setEditing(false); } }}
          className="text-xs outline-none w-28 bg-transparent" />
        <button type="button" onClick={save} className="text-green-600 hover:text-green-700 p-0.5">
          <Check className="w-3 h-3" />
        </button>
        <button type="button" onClick={() => { setVal(label); setEditing(false); }} className="text-zinc-400 hover:text-zinc-700 p-0.5">
          <XIcon className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 bg-white border border-zinc-200 px-3 py-1.5 rounded-sm text-xs group">
      <span className="cursor-pointer hover:text-zinc-600 transition-colors" onClick={startEdit} title="Click to rename">{label}</span>
      <button type="button" onClick={onDelete} className="text-zinc-400 hover:text-red-600 transition-colors ml-1 opacity-0 group-hover:opacity-100">
        <XIcon className="w-3 h-3" />
      </button>
    </div>
  );
}

// ── Brand accordion row ───────────────────────────────────────────────────────
function BrandRow({ brand, onDelete, onAddModel, onDeleteModel }) {
  const [open, setOpen] = useState(false);
  const [newModel, setNewModel] = useState("");
  const [adding, setAdding] = useState(false);

  const submitModel = async (e) => {
    e.preventDefault();
    if (!newModel.trim()) return;
    setAdding(true);
    try { await onAddModel(brand.brand_id, newModel.trim()); setNewModel(""); }
    finally { setAdding(false); }
  };

  return (
    <div className="border border-zinc-200 bg-white mb-2">
      <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-zinc-50 transition-colors"
        onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="w-3.5 h-3.5 text-zinc-400" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />}
          <span className="font-semibold text-sm">{brand.name}</span>
          <span className="text-xs text-zinc-400">{brand.models?.length || 0} models</span>
        </div>
        <button type="button" onClick={e => { e.stopPropagation(); onDelete(brand.brand_id, brand.name); }}
          className="text-zinc-400 hover:text-red-600 transition-colors p-1">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {open && (
        <div className="border-t border-zinc-200 px-4 py-3 space-y-2">
          <div className="flex flex-wrap gap-2 mb-3">
            {(brand.models || []).map(m => (
              <div key={m} className="flex items-center gap-1 bg-zinc-100 border border-zinc-200 px-2.5 py-1 rounded-sm text-xs">
                <span>{m}</span>
                {m !== "Other" && (
                  <button type="button" onClick={() => onDeleteModel(brand.brand_id, m)}
                    className="ml-1 text-zinc-400 hover:text-red-600">
                    <XIcon className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <form onSubmit={submitModel} className="flex gap-2">
            <Input value={newModel} onChange={e => setNewModel(e.target.value)}
              placeholder="Add model name…" className="h-8 text-xs rounded-sm border-zinc-300 flex-1" />
            <Button type="submit" disabled={adding} className="h-8 rounded-sm bg-zinc-950 text-xs px-3">
              {adding ? "Adding…" : "Add"}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ icon: Icon, title, children }) {
  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-zinc-200">
        <Icon className="w-4 h-4 text-zinc-500" />
        <h2 className="font-heading font-bold text-base">{title}</h2>
      </div>
      {children}
    </section>
  );
}

// ── Main Catalog/Customize page ───────────────────────────────────────────────
export default function Catalog() {
  const [brands, setBrands] = useState([]);
  const [issueCategories, setIssueCategories] = useState([]);
  const [banks, setBanks] = useState([]);
  const [ledgerCategories, setLedgerCategories] = useState([]);
  const [newBrand, setNewBrand] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newBank, setNewBank] = useState("");
  const [newLedgerCat, setNewLedgerCat] = useState("");
  const [addingBrand, setAddingBrand] = useState(false);
  const [addingCat, setAddingCat] = useState(false);
  const [addingBank, setAddingBank] = useState(false);
  const [addingLedgerCat, setAddingLedgerCat] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef();

  const load = async () => {
    try {
      const [b, ic, bk, lc] = await Promise.all([
        api.get("/catalog/brands"),
        api.get("/catalog/issue-categories"),
        api.get("/catalog/banks"),
        api.get("/categories"),
      ]);
      setBrands(b.data);
      setIssueCategories(ic.data);
      setBanks(bk.data);
      setLedgerCategories(lc.data);
    } catch { toast.error("Failed to load"); }
  };

  useEffect(() => { load(); }, []);

  // ── Brand handlers ────────────────────────────────────────────────────────
  const handleAddBrand = async (e) => {
    e.preventDefault();
    if (!newBrand.trim()) return;
    setAddingBrand(true);
    try { await api.post("/catalog/brands", { name: newBrand.trim() }); setNewBrand(""); toast.success("Brand added"); load(); }
    catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
    finally { setAddingBrand(false); }
  };
  const handleDeleteBrand = async (brand_id, name) => {
    if (!window.confirm(`Delete brand "${name}" and all its models?`)) return;
    try { await api.delete(`/catalog/brands/${brand_id}`); toast.success("Brand deleted"); load(); }
    catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };
  const handleAddModel = async (brand_id, model_name) => {
    try { await api.post(`/catalog/brands/${brand_id}/models`, { model_name }); toast.success("Model added"); load(); }
    catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };
  const handleDeleteModel = async (brand_id, model_name) => {
    try { await api.delete(`/catalog/brands/${brand_id}/models/${encodeURIComponent(model_name)}`); load(); }
    catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };

  // ── Issue category handlers ───────────────────────────────────────────────
  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCategory.trim()) return;
    setAddingCat(true);
    try { await api.post("/catalog/issue-categories", { name: newCategory.trim() }); setNewCategory(""); toast.success("Category added"); load(); }
    catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
    finally { setAddingCat(false); }
  };
  const handleDeleteCategory = async (category_id, name) => {
    try { await api.delete(`/catalog/issue-categories/${category_id}`); toast.success(`"${name}" removed`); load(); }
    catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };

  // ── Bank handlers ─────────────────────────────────────────────────────────
  const handleAddBank = async (e) => {
    e.preventDefault();
    if (!newBank.trim()) return;
    setAddingBank(true);
    try { await api.post("/catalog/banks", { name: newBank.trim() }); setNewBank(""); toast.success("Bank added"); load(); }
    catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
    finally { setAddingBank(false); }
  };
  const handleDeleteBank = async (bank_id, name) => {
    try { await api.delete(`/catalog/banks/${bank_id}`); toast.success(`"${name}" removed`); load(); }
    catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };
  const handleRenameBank = async (bank_id, newName) => {
    try { await api.put(`/catalog/banks/${bank_id}`, { name: newName }); load(); }
    catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };

  // ── Ledger category handlers ──────────────────────────────────────────────
  const handleAddLedgerCat = async (e) => {
    e.preventDefault();
    if (!newLedgerCat.trim()) return;
    setAddingLedgerCat(true);
    try { await api.post("/categories", { name: newLedgerCat.trim(), type: "both", icon: "", color: "" }); setNewLedgerCat(""); toast.success("Category added"); load(); }
    catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
    finally { setAddingLedgerCat(false); }
  };
  const handleDeleteLedgerCat = async (id, name) => {
    try { await api.delete(`/categories/${id}`); toast.success(`"${name}" removed`); load(); }
    catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };
  const handleRenameLedgerCat = async (id, newName) => {
    try { await api.put(`/categories/${id}`, { name: newName, type: "both", icon: "", color: "" }); load(); }
    catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };

  // ── Contact import ────────────────────────────────────────────────────────
  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/customers/import-file", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportResult(data);
      toast.success(`Imported ${data.added} contacts (${data.skipped} skipped as duplicates)`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Import failed");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="mobile-page max-w-3xl">
      <div className="mb-8 animate-fade-up">
        <div className="kpi-label">Settings</div>
        <h1 className="font-heading text-2xl md:text-4xl font-bold tracking-tight mt-1">Customize</h1>
        <p className="text-sm text-zinc-500 mt-2">
          Manage brands, payment methods, categories, and contacts. Changes reflect instantly in forms.
        </p>
      </div>

      {/* ── Contact Import ── */}
      <Section icon={Users} title="Import Contacts">
        <div className="border border-dashed border-zinc-300 rounded-sm p-5 text-center mb-3">
          <Upload className="w-6 h-6 text-zinc-400 mx-auto mb-2" />
          <p className="text-sm text-zinc-600 mb-1">Upload contacts from your phone</p>
          <p className="text-xs text-zinc-400 mb-3">
            Supports <strong>.vcf</strong> (vCard — export from iPhone / Android) and <strong>.csv</strong> (Name, Phone columns)
          </p>
          <Button type="button" variant="outline" disabled={importing}
            onClick={() => fileRef.current?.click()}
            className="rounded-sm border-zinc-300 h-9 text-sm">
            {importing ? "Importing…" : "Choose File (.vcf or .csv)"}
          </Button>
          <input ref={fileRef} type="file" accept=".vcf,.vcard,.csv" className="hidden" onChange={handleImport} />
        </div>
        {importResult && (
          <div className="text-xs text-zinc-600 bg-green-50 border border-green-200 px-3 py-2 rounded-sm">
            ✓ Added <strong>{importResult.added}</strong> new contacts from {importResult.total} total
            {importResult.skipped > 0 && ` (${importResult.skipped} already existed)`}
          </div>
        )}
        <p className="text-xs text-zinc-400 mt-2">
          iPhone: Contacts app → select all → Share → Export vCard (.vcf)
        </p>
      </Section>

      {/* ── Payment Methods / Banks ── */}
      <Section icon={Landmark} title="Payment Methods">
        <p className="text-xs text-zinc-400 mb-3">Click a name to rename it. Hover to delete.</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {banks.map(b => (
            <EditableChip key={b.bank_id} label={b.name}
              onDelete={() => handleDeleteBank(b.bank_id, b.name)}
              onRename={newName => handleRenameBank(b.bank_id, newName)} />
          ))}
          {banks.length === 0 && (
            <div className="text-sm text-zinc-400 py-4 w-full text-center border border-dashed border-zinc-200 rounded-sm">
              No payment methods yet
            </div>
          )}
        </div>
        <form onSubmit={handleAddBank} className="flex flex-col sm:flex-row gap-2">
          <Input value={newBank} onChange={e => setNewBank(e.target.value)}
            placeholder="e.g. ICICI Bank, PayTM, UPI…" className="h-10 rounded-sm border-zinc-300 flex-1" />
          <Button type="submit" disabled={addingBank} className="h-10 rounded-sm bg-zinc-950 px-4 sm:w-auto">
            <Plus className="w-4 h-4 mr-1" />{addingBank ? "Adding…" : "Add"}
          </Button>
        </form>
      </Section>

      {/* ── Ledger / Transaction Categories ── */}
      <Section icon={Receipt} title="Ledger Categories">
        <p className="text-xs text-zinc-400 mb-3">Click a name to rename. These appear in Add Entry → Category.</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {ledgerCategories.map(cat => (
            <EditableChip key={cat.id} label={cat.name}
              onDelete={() => handleDeleteLedgerCat(cat.id, cat.name)}
              onRename={newName => handleRenameLedgerCat(cat.id, newName)} />
          ))}
          {ledgerCategories.length === 0 && (
            <div className="text-sm text-zinc-400 py-4 w-full text-center border border-dashed border-zinc-200 rounded-sm">
              No categories yet
            </div>
          )}
        </div>
        <form onSubmit={handleAddLedgerCat} className="flex flex-col sm:flex-row gap-2">
          <Input value={newLedgerCat} onChange={e => setNewLedgerCat(e.target.value)}
            placeholder="e.g. Advance, Repair, Parts…" className="h-10 rounded-sm border-zinc-300 flex-1" />
          <Button type="submit" disabled={addingLedgerCat} className="h-10 rounded-sm bg-zinc-950 px-4 sm:w-auto">
            <Plus className="w-4 h-4 mr-1" />{addingLedgerCat ? "Adding…" : "Add"}
          </Button>
        </form>
      </Section>

      {/* ── Issue Categories ── */}
      <Section icon={Tag} title="Issue Categories (Repair)">
        <p className="text-xs text-zinc-400 mb-3">These appear as chips in the Inward form when registering a device.</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {issueCategories.map(cat => (
            <div key={cat.category_id} className="flex items-center gap-1.5 bg-white border border-zinc-200 px-3 py-1.5 rounded-sm text-xs group">
              <span>{cat.name}</span>
              <button type="button" onClick={() => handleDeleteCategory(cat.category_id, cat.name)}
                className="text-zinc-400 hover:text-red-600 transition-colors ml-1 opacity-0 group-hover:opacity-100">
                <XIcon className="w-3 h-3" />
              </button>
            </div>
          ))}
          {issueCategories.length === 0 && (
            <div className="text-sm text-zinc-400 py-4 w-full text-center border border-dashed border-zinc-200 rounded-sm">
              No issue categories yet
            </div>
          )}
        </div>
        <form onSubmit={handleAddCategory} className="flex flex-col sm:flex-row gap-2">
          <Input value={newCategory} onChange={e => setNewCategory(e.target.value)}
            placeholder="e.g. Screen Crack, Water Damage…" className="h-10 rounded-sm border-zinc-300 flex-1" />
          <Button type="submit" disabled={addingCat} className="h-10 rounded-sm bg-zinc-950 px-4 sm:w-auto">
            <Plus className="w-4 h-4 mr-1" />{addingCat ? "Adding…" : "Add"}
          </Button>
        </form>
      </Section>

      {/* ── Brands & Models ── */}
      <Section icon={Cpu} title="Device Brands & Models">
        <div className="mb-4">
          {brands.map(brand => (
            <BrandRow key={brand.brand_id} brand={brand}
              onDelete={handleDeleteBrand} onAddModel={handleAddModel} onDeleteModel={handleDeleteModel} />
          ))}
          {brands.length === 0 && (
            <div className="text-sm text-zinc-400 py-4 text-center border border-dashed border-zinc-200 rounded-sm">
              No brands yet
            </div>
          )}
        </div>
        <form onSubmit={handleAddBrand} className="flex flex-col sm:flex-row gap-2">
          <Input value={newBrand} onChange={e => setNewBrand(e.target.value)}
            placeholder="New brand name (e.g. Razer)…" className="h-10 rounded-sm border-zinc-300 flex-1" />
          <Button type="submit" disabled={addingBrand} className="h-10 rounded-sm bg-zinc-950 px-4 sm:w-auto">
            <Plus className="w-4 h-4 mr-1" />{addingBrand ? "Adding…" : "Add Brand"}
          </Button>
        </form>
      </Section>
    </div>
  );
}
