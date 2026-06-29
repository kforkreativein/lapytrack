import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowDownToLine, X, Loader2, User, Phone, Mail, Check, PlusCircle } from "lucide-react";

export default function InwardForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const existingDeviceId = searchParams.get("device");
  // Customer
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");

  // Device
  const [deviceType, setDeviceType] = useState("Laptop");
  const [category, setCategory] = useState("repair");
  const [condition, setCondition] = useState("Good");
  const [serialNumber, setSerialNumber] = useState("");

  // Brand — cascading select
  const [brands, setBrands] = useState([]);
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [brandModels, setBrandModels] = useState([]);
  const [brandCustom, setBrandCustom] = useState(""); // shown when "Other" chosen
  const [brandIsOther, setBrandIsOther] = useState(false);

  // Model — cascading select
  const [selectedModel, setSelectedModel] = useState("");
  const [modelIsOther, setModelIsOther] = useState(false);
  const [modelCustom, setModelCustom] = useState("");

  // Issue categories
  const [issueCategories, setIssueCategories] = useState([]);
  const [selectedIssues, setSelectedIssues] = useState([]);
  const [customIssue, setCustomIssue] = useState("");
  const [issueNotes, setIssueNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [existingDevice, setExistingDevice] = useState(null);
  const [remarks, setRemarks] = useState("");

  // Derived values
  const brand = brandIsOther ? brandCustom : (brands.find(b => b.brand_id === selectedBrandId)?.name || "");
  const model = modelIsOther ? modelCustom : selectedModel;

  useEffect(() => {
    Promise.all([api.get("/catalog/brands"), api.get("/catalog/issue-categories")])
      .then(([b, ic]) => {
        setBrands(b.data);
        setIssueCategories(ic.data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (existingDeviceId) {
      api.get(`/devices/${existingDeviceId}`)
        .then(({ data }) => setExistingDevice(data))
        .catch(() => toast.error("Could not load device"));
    }
  }, [existingDeviceId]);

  const handleBrandChange = (val) => {
    if (val === "__other__") {
      setBrandIsOther(true);
      setSelectedBrandId("");
      setBrandModels([]);
    } else {
      setBrandIsOther(false);
      setSelectedBrandId(val);
      const found = brands.find(b => b.brand_id === val);
      setBrandModels(found?.models || []);
    }
    setSelectedModel("");
    setModelIsOther(false);
    setModelCustom("");
  };

  const handleModelChange = (val) => {
    if (val === "__other__") {
      setModelIsOther(true);
      setSelectedModel("");
    } else {
      setModelIsOther(false);
      setSelectedModel(val);
    }
  };

  const toggleIssue = (name) => {
    setSelectedIssues(prev =>
      prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]
    );
  };

  const addCustomIssue = () => {
    const next = customIssue.trim();
    if (!next) return;
    if (selectedIssues.some(issue => issue.toLowerCase() === next.toLowerCase())) {
      toast.error("Problem already added");
      return;
    }
    setSelectedIssues(prev => [...prev, next]);
    setCustomIssue("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (existingDeviceId) {
      setSubmitting(true);
      try {
        await api.post("/movements", { device_id: existingDeviceId, movement_type: "inward", remarks });
        toast.success("Device received back");
        navigate(`/devices/${existingDeviceId}`);
      } catch (err) {
        toast.error(err.response?.data?.detail || "Failed");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!customerName.trim()) { toast.error("Customer name is required"); return; }
    if (!customerPhone.trim()) { toast.error("Customer phone is required"); return; }
    if (!brand.trim()) { toast.error("Brand is required"); return; }
    if (!model.trim()) { toast.error("Model is required"); return; }
    if (selectedIssues.length === 0 && !issueNotes.trim()) {
      toast.error("Select at least one issue category or add notes");
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post("/devices", {
        device_type: deviceType, brand, model,
        serial_number: serialNumber.trim() || null,
        condition, category,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        issue_categories: selectedIssues,
        issue_description: issueNotes,
      });
      toast.success(`Inward logged · ${data.job_number}`);
      navigate(`/devices/${data.device_id}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mobile-page max-w-3xl" data-testid="inward-form-page">
      <div className="mb-6 md:mb-8 animate-fade-up">
        <div className="kpi-label flex items-center gap-2">
          <ArrowDownToLine className="w-3 h-3" />
          {existingDeviceId ? "Receive Back" : "Inward Entry"}
        </div>
        <h1 className="font-heading text-2xl md:text-4xl font-bold tracking-tight mt-1">
          {existingDeviceId ? "Receive device back" : "New Inward"}
        </h1>
        <p className="text-sm text-zinc-500 mt-2">
          {existingDeviceId
            ? `Receiving ${existingDevice?.brand} ${existingDevice?.model} (${existingDevice?.job_number || existingDevice?.serial_number}) back.`
            : "Log a customer dropping off a device. A job number will be auto-generated."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" data-testid="inward-form">
        {existingDeviceId ? (
          <div>
            <Label className="kpi-label">Remarks (condition on return)</Label>
            <Textarea
              data-testid="inward-remarks"
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              className="mt-1.5 rounded-sm border-zinc-300"
              placeholder="Any damages or notes…"
              rows={4}
            />
          </div>
        ) : (
          <>
            {/* ── Customer ── */}
            <section className="border border-zinc-200 bg-white">
              <div className="px-4 md:px-5 py-3 border-b border-zinc-200 bg-zinc-50 flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-zinc-500" />
                <span className="kpi-label">Customer Details</span>
              </div>
              <div className="p-4 md:p-5 space-y-4">
                <div>
                  <Label className="kpi-label">Full name *</Label>
                  <Input
                    data-testid="customer-name-input"
                    required value={customerName} onChange={e => setCustomerName(e.target.value)}
                    className="mt-1.5 rounded-sm border-zinc-300 h-10"
                    placeholder="Rahul Sharma"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="kpi-label flex items-center gap-1.5"><Phone className="w-3 h-3" />Phone *</Label>
                    <Input
                      data-testid="customer-phone-input"
                      required type="tel" inputMode="tel" value={customerPhone}
                      onChange={e => setCustomerPhone(e.target.value)}
                      className="mt-1.5 rounded-sm border-zinc-300 h-10 font-mono"
                      placeholder="+91 98765 43210"
                    />
                  </div>
                  <div>
                    <Label className="kpi-label flex items-center gap-1.5"><Mail className="w-3 h-3" />Email</Label>
                    <Input
                      data-testid="customer-email-input"
                      type="email" value={customerEmail}
                      onChange={e => setCustomerEmail(e.target.value)}
                      className="mt-1.5 rounded-sm border-zinc-300 h-10"
                      placeholder="optional"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* ── Device ── */}
            <section className="border border-zinc-200 bg-white">
              <div className="px-4 md:px-5 py-3 border-b border-zinc-200 bg-zinc-50">
                <span className="kpi-label">Device Details</span>
              </div>
              <div className="p-4 md:p-5 space-y-4">

                {/* Type + Category */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="kpi-label">Device Type *</Label>
                    <Select value={deviceType} onValueChange={setDeviceType}>
                      <SelectTrigger data-testid="device-type-select" className="mt-1.5 rounded-sm border-zinc-300 h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Laptop">Laptop</SelectItem>
                        <SelectItem value="Desktop">Desktop</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="kpi-label">Category *</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger data-testid="category-select" className="mt-1.5 rounded-sm border-zinc-300 h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="repair">For Repair</SelectItem>
                        <SelectItem value="stock">Warehouse Stock</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Brand */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="kpi-label">Brand *</Label>
                    <Select onValueChange={handleBrandChange}>
                      <SelectTrigger data-testid="brand-select" className="mt-1.5 rounded-sm border-zinc-300 h-10">
                        <SelectValue placeholder="Select brand…" />
                      </SelectTrigger>
                      <SelectContent>
                        {brands.map(b => (
                          <SelectItem key={b.brand_id} value={b.brand_id}>{b.name}</SelectItem>
                        ))}
                        <SelectItem value="__other__">Other (type manually)</SelectItem>
                      </SelectContent>
                    </Select>
                    {brandIsOther && (
                      <Input
                        className="mt-2 rounded-sm border-zinc-300 h-10"
                        placeholder="Enter brand name"
                        value={brandCustom}
                        onChange={e => setBrandCustom(e.target.value)}
                        autoFocus
                      />
                    )}
                  </div>

                  {/* Model */}
                  <div>
                    <Label className="kpi-label">Model *</Label>
                    {!brandIsOther && brandModels.length > 0 ? (
                      <Select onValueChange={handleModelChange} value={modelIsOther ? "__other__" : selectedModel}>
                        <SelectTrigger data-testid="model-select" className="mt-1.5 rounded-sm border-zinc-300 h-10">
                          <SelectValue placeholder="Select model…" />
                        </SelectTrigger>
                        <SelectContent>
                          {brandModels.map(m => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                          <SelectItem value="__other__">Other (type manually)</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        data-testid="model-input"
                        className="mt-1.5 rounded-sm border-zinc-300 h-10"
                        placeholder="e.g. MacBook Pro 14&quot; M3"
                        value={brandIsOther ? modelCustom : ""}
                        onChange={e => setModelCustom(e.target.value)}
                      />
                    )}
                    {modelIsOther && !brandIsOther && (
                      <Input
                        className="mt-2 rounded-sm border-zinc-300 h-10"
                        placeholder="Enter model name"
                        value={modelCustom}
                        onChange={e => setModelCustom(e.target.value)}
                        autoFocus
                      />
                    )}
                  </div>
                </div>

                {/* Serial + Condition */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="kpi-label">Serial Number <span className="text-zinc-400 font-normal normal-case">(optional)</span></Label>
                    <Input
                      data-testid="serial-input"
                      value={serialNumber} onChange={e => setSerialNumber(e.target.value)}
                      className="mt-1.5 rounded-sm border-zinc-300 h-10 font-mono uppercase"
                      placeholder="Leave blank if unknown"
                    />
                  </div>
                  <div>
                    <Label className="kpi-label">Condition *</Label>
                    <Select value={condition} onValueChange={setCondition}>
                      <SelectTrigger data-testid="condition-select" className="mt-1.5 rounded-sm border-zinc-300 h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Good">Good</SelectItem>
                        <SelectItem value="Fair">Fair</SelectItem>
                        <SelectItem value="Damaged">Damaged</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Issue Categories */}
                <div>
                  <Label className="kpi-label">Issue / Service Required *</Label>
                  <p className="text-[11px] text-zinc-400 mt-0.5 mb-2">Select all that apply</p>
                  {issueCategories.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {issueCategories.map(cat => {
                        const active = selectedIssues.includes(cat.name);
                        return (
                          <button
                            type="button"
                            key={cat.category_id}
                            onClick={() => toggleIssue(cat.name)}
                            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-sm border transition-colors touch-target ${
                              active
                                ? "bg-zinc-950 text-white border-zinc-950"
                                : "bg-white text-zinc-700 border-zinc-300 hover:border-zinc-600"
                            }`}
                          >
                            {active && <Check className="w-3 h-3" />}
                            {cat.name}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-400">Loading categories…</div>
                  )}
                  {selectedIssues.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedIssues.map(issue => (
                        <span
                          key={issue}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-sm bg-zinc-100 border border-zinc-200 font-medium"
                        >
                          {issue}
                          <button
                            type="button"
                            onClick={() => setSelectedIssues(prev => prev.filter(item => item !== issue))}
                            className="text-zinc-400 hover:text-zinc-950"
                            aria-label={`Remove ${issue}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    <Input
                      value={customIssue}
                      onChange={e => setCustomIssue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCustomIssue();
                        }
                      }}
                      className="rounded-sm border-zinc-300 h-10"
                      placeholder="Add another problem"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addCustomIssue}
                      className="rounded-sm border-zinc-300 h-10"
                    >
                      <PlusCircle className="w-3.5 h-3.5 mr-1.5" />
                      Add Problem
                    </Button>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <Label className="kpi-label">Additional Notes <span className="text-zinc-400 font-normal normal-case">(optional)</span></Label>
                  <Textarea
                    data-testid="issue-input"
                    value={issueNotes} onChange={e => setIssueNotes(e.target.value)}
                    className="mt-1.5 rounded-sm border-zinc-300"
                    rows={3}
                    placeholder="Any extra details about the issue…"
                  />
                </div>

              </div>
            </section>
          </>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => navigate(-1)} className="rounded-sm border-zinc-300 h-11">
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting}
            data-testid="submit-inward-button"
            className="rounded-sm bg-zinc-950 hover:bg-zinc-800 h-11 px-6 flex-1 sm:flex-none"
          >
            {submitting ? "Saving…" : (existingDeviceId ? "Confirm Return" : "Generate Job & Save")}
          </Button>
        </div>
      </form>
    </div>
  );
}
