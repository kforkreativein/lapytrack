import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { ArrowUpFromLine, CalendarIcon, User, IndianRupee } from "lucide-react";
import { cn } from "@/lib/utils";

export default function OutwardForm() {
  const navigate = useNavigate();
  const { id: paramId } = useParams();
  const [searchParams] = useSearchParams();
  const preselect = paramId || searchParams.get("device") || "";

  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(preselect);
  const [pickupMode, setPickupMode] = useState("self"); // self | delegate
  const [pickerName, setPickerName] = useState("");
  const [pickerPhone, setPickerPhone] = useState("");
  const [expectedReturn, setExpectedReturn] = useState(null);
  const [remarks, setRemarks] = useState("");
  const [repairCharge, setRepairCharge] = useState("");
  const [repairPayment, setRepairPayment] = useState("Cash");
  const [banks, setBanks] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: devs }, { data: b }] = await Promise.all([
        api.get("/devices"),
        api.get("/catalog/banks"),
      ]);
      setDevices(devs.filter(d => d.status !== "issued"));
      setBanks(b);
      if (b.length > 0) setRepairPayment(b[0].name);
    })();
  }, []);

  const selectedDevice = devices.find(d => d.device_id === deviceId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!deviceId) { toast.error("Select a device"); return; }
    if (pickupMode === "delegate") {
      if (!pickerName.trim()) { toast.error("Picker name is required"); return; }
      if (!pickerPhone.trim()) { toast.error("Picker phone is required"); return; }
    }
    setSubmitting(true);
    try {
      await api.post("/movements", {
        device_id: deviceId,
        movement_type: "outward",
        pickup_self: pickupMode === "self",
        picked_up_by_name: pickerName,
        picked_up_by_phone: pickerPhone,
        expected_return_date: expectedReturn ? expectedReturn.toISOString() : null,
        remarks,
        repair_charge: repairCharge ? parseFloat(repairCharge) : null,
        repair_payment_method: repairPayment,
      });
      toast.success("Device handed over");
      navigate(`/devices/${deviceId}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mobile-page max-w-3xl" data-testid="outward-form-page">
      <div className="mb-6 md:mb-8 animate-fade-up">
        <div className="kpi-label flex items-center gap-2">
          <ArrowUpFromLine className="w-3 h-3" />
          Outward / Handover
        </div>
        <h1 className="font-heading text-2xl md:text-4xl font-bold tracking-tight mt-1">Hand over device</h1>
        <p className="text-sm text-zinc-500 mt-2">
          Mark a device as picked up. Choose whether the original customer or someone else is collecting it.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" data-testid="outward-form">
        {/* Device picker */}
        <section className="border border-zinc-200 bg-white">
          <div className="px-4 md:px-5 py-3 border-b border-zinc-200 bg-zinc-50">
            <span className="kpi-label">Device</span>
          </div>
          <div className="p-4 md:p-5">
            <Select value={deviceId} onValueChange={setDeviceId}>
              <SelectTrigger data-testid="device-select" className="rounded-sm border-zinc-300 h-10">
                <SelectValue placeholder="Select a device to hand over" />
              </SelectTrigger>
              <SelectContent>
                {devices.length === 0 && (
                  <div className="text-xs text-zinc-500 p-3">No available devices. Register an inward first.</div>
                )}
                {devices.map(d => (
                  <SelectItem key={d.device_id} value={d.device_id}>
                    <span className="font-mono text-xs font-semibold">{d.job_number || d.serial_number}</span>
                  <span className="ml-2 text-zinc-600 text-xs">{d.brand} {d.model} · {d.customer_name || "—"}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedDevice && (
              <div className="mt-3 p-3 bg-zinc-50 border border-zinc-200 rounded-sm text-xs space-y-1">
                <div className="flex gap-2"><span className="text-zinc-500 w-20">Customer:</span><span className="font-semibold">{selectedDevice.customer_name || "—"}</span></div>
                <div className="flex gap-2"><span className="text-zinc-500 w-20">Phone:</span><span className="font-mono">{selectedDevice.customer_phone || "—"}</span></div>
                <div className="flex gap-2"><span className="text-zinc-500 w-20">Issue:</span><span className="text-zinc-700">{selectedDevice.issue_description || "—"}</span></div>
              </div>
            )}
          </div>
        </section>

        {/* Pickup section */}
        <section className="border border-zinc-200 bg-white">
          <div className="px-4 md:px-5 py-3 border-b border-zinc-200 bg-zinc-50 flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-zinc-500" />
            <span className="kpi-label">Who is picking up?</span>
          </div>
          <div className="p-4 md:p-5 space-y-4">
            <RadioGroup
              value={pickupMode}
              onValueChange={setPickupMode}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              <label
                htmlFor="pickup-self"
                data-testid="pickup-self-option"
                className={cn(
                    "flex items-start gap-3 border rounded-sm p-3 cursor-pointer transition-colors touch-target",
                  pickupMode === "self" ? "border-zinc-950 bg-zinc-50" : "border-zinc-200 hover:bg-zinc-50"
                )}
              >
                <RadioGroupItem value="self" id="pickup-self" className="mt-0.5" />
                <div>
                  <div className="text-sm font-semibold">Same customer</div>
                  <div className="text-xs text-zinc-500 mt-0.5">The original customer is collecting</div>
                </div>
              </label>
              <label
                htmlFor="pickup-delegate"
                data-testid="pickup-delegate-option"
                className={cn(
                    "flex items-start gap-3 border rounded-sm p-3 cursor-pointer transition-colors touch-target",
                  pickupMode === "delegate" ? "border-zinc-950 bg-zinc-50" : "border-zinc-200 hover:bg-zinc-50"
                )}
              >
                <RadioGroupItem value="delegate" id="pickup-delegate" className="mt-0.5" />
                <div>
                  <div className="text-sm font-semibold">Someone else</div>
                  <div className="text-xs text-zinc-500 mt-0.5">Family / colleague picking up</div>
                </div>
              </label>
            </RadioGroup>

            {pickupMode === "delegate" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 animate-fade-up">
                <div>
                  <Label className="kpi-label">Picker name *</Label>
                  <Input
                    data-testid="picker-name-input"
                    value={pickerName}
                    onChange={(e) => setPickerName(e.target.value)}
                    className="mt-1.5 rounded-sm border-zinc-300 h-10"
                    placeholder="Name of person picking up"
                  />
                </div>
                <div>
                  <Label className="kpi-label">Picker phone *</Label>
                  <Input
                    data-testid="picker-phone-input"
                    type="tel" inputMode="tel"
                    value={pickerPhone}
                    onChange={(e) => setPickerPhone(e.target.value)}
                    className="mt-1.5 rounded-sm border-zinc-300 h-10 font-mono"
                    placeholder="+91 98765 43210"
                  />
                </div>
              </div>
            )}

            <div>
              <Label className="kpi-label">Expected return date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="expected-return-button"
                    className={cn(
                      "mt-1.5 w-full sm:w-auto rounded-sm border-zinc-300 h-10 justify-start font-normal text-sm",
                      !expectedReturn && "text-zinc-400"
                    )}
                  >
                    <CalendarIcon className="w-3.5 h-3.5 mr-2" />
                    {expectedReturn ? expectedReturn.toLocaleDateString() : "Optional"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-sm" align="start">
                  <Calendar
                    mode="single"
                    selected={expectedReturn}
                    onSelect={setExpectedReturn}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label className="kpi-label">Remarks</Label>
              <Textarea
                data-testid="remarks-input"
                value={remarks} onChange={(e) => setRemarks(e.target.value)}
                className="mt-1.5 rounded-sm border-zinc-300"
                rows={3}
                placeholder="Repair work done, parts replaced, etc."
              />
            </div>
          </div>
        </section>

        {/* Repair charge */}
        <section className="border border-zinc-200 bg-white">
          <div className="px-4 md:px-5 py-3 border-b border-zinc-200 bg-zinc-50 flex items-center gap-2">
            <IndianRupee className="w-3.5 h-3.5 text-zinc-500" />
            <span className="kpi-label">Repair Charge <span className="text-zinc-400 font-normal normal-case">(optional)</span></span>
          </div>
          <div className="p-4 md:p-5 space-y-4">
            <div>
              <Label className="kpi-label">Amount charged (₹)</Label>
              <div className="relative mt-1.5">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <Input
                  value={repairCharge}
                  onChange={e => setRepairCharge(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  className="pl-9 rounded-sm border-zinc-300 h-11 text-xl font-bold tabular-nums"
                />
              </div>
              <p className="text-xs text-zinc-400 mt-1.5">Will auto-create an income entry in the Khata Book for this customer.</p>
            </div>
            {repairCharge && parseFloat(repairCharge) > 0 && banks.length > 0 && (
              <div>
                <Label className="kpi-label">Payment method</Label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {banks.map(b => (
                    <button key={b.bank_id} type="button"
                      onClick={() => setRepairPayment(b.name)}
                      className={`px-3 py-1.5 text-xs rounded-sm border font-medium transition-colors ${
                        repairPayment === b.name
                          ? "bg-zinc-950 text-white border-zinc-950"
                          : "bg-white text-zinc-700 border-zinc-300 hover:border-zinc-600"
                      }`}>{b.name}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(-1)}
            className="rounded-sm border-zinc-300 h-11"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting}
            data-testid="submit-outward-button"
            className="rounded-sm bg-zinc-950 hover:bg-zinc-800 h-11 px-6 flex-1 sm:flex-none"
          >
            {submitting ? "Saving…" : "Confirm Handover"}
          </Button>
        </div>
      </form>
    </div>
  );
}
