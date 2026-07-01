import { useCallback, useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, ArrowDownToLine, ArrowUpFromLine, Trash2, User, Phone, Mail,
  Printer, QrCode, ExternalLink, CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

function formatDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); }
  catch { return iso; }
}

export default function DeviceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [device, setDevice] = useState(null);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, m] = await Promise.all([
        api.get(`/devices/${id}`),
        api.get(`/movements?device_id=${id}`),
      ]);
      setDevice(d.data);
      setMovements(m.data);
    } catch {
      toast.error("Failed to load device");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleRepairStatus = async (rs) => {
    try {
      await api.patch(`/devices/${id}`, { repair_status: rs });
      setDevice(d => ({ ...d, repair_status: rs }));
      toast.success("Status updated");
    } catch { toast.error("Failed to update status"); }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/devices/${id}`);
      toast.success("Device deleted");
      navigate("/devices");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Delete failed");
    }
  };

  const publicJobUrl = `${window.location.origin}/job/${device?.device_id || id}`;
  const openPrintSheet = () => window.open(`/job/${device.device_id}`, "_blank", "noopener,noreferrer");

  if (loading) return <div className="p-8 text-sm text-zinc-500">Loading…</div>;
  if (!device) return <div className="p-8 text-sm text-zinc-500">Device not found</div>;

  return (
    <div className="mobile-page" data-testid="device-detail-page">
      <Link to="/devices" className="inline-flex items-center text-xs text-zinc-500 hover:text-zinc-950 mb-4 transition-colors">
        <ArrowLeft className="w-3 h-3 mr-1" /> Back to devices
      </Link>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6 md:mb-8 animate-fade-up">
        <div className="min-w-0">
          <div className="kpi-label flex items-center gap-2 flex-wrap">
            <span className="font-mono text-zinc-950 font-bold text-xs tracking-wide bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-sm">
              {device.job_number || "—"}
            </span>
            <span>{device.device_type} · {device.category}</span>
          </div>
          <h1 className="font-heading text-2xl md:text-4xl font-bold tracking-tight mt-2 break-words">
            {device.brand} {device.model}
          </h1>
          <div className="flex flex-wrap items-center gap-2 md:gap-3 mt-3">
            <span className="font-mono text-sm font-semibold text-zinc-950">{device.serial_number}</span>
            {device.status === "in_repair" && device.repair_status && device.repair_status !== "not_started" ? (() => {
              const map = { in_progress: ["In Progress", "bg-amber-50 text-amber-700 border-amber-200"], completed: ["Completed", "bg-blue-50 text-blue-700 border-blue-200"], delivered: ["Delivered", "bg-green-50 text-green-700 border-green-200"] };
              const [label, cls] = map[device.repair_status] || ["In Progress", "bg-amber-50 text-amber-700 border-amber-200"];
              return <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-sm border ${cls}`}>{label}</span>;
            })() : <StatusBadge status={device.status} expectedReturnDate={device.expected_return_date} />}
            <span className="text-xs text-zinc-500">{device.condition}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:w-auto">
          {device.status !== "issued" && (
            <Link to={`/outward/${device.device_id}`} className="flex-1 md:flex-none">
              <Button data-testid="quick-outward-button" className="w-full md:w-auto rounded-sm bg-zinc-950 hover:bg-zinc-800 h-10">
                <ArrowUpFromLine className="w-3.5 h-3.5 mr-1.5" />
                Outward
              </Button>
            </Link>
          )}
          {device.status === "issued" && (
            <Link to={`/inward?device=${device.device_id}`} className="flex-1 md:flex-none">
              <Button data-testid="quick-inward-button" className="w-full md:w-auto rounded-sm bg-zinc-950 hover:bg-zinc-800 h-10">
                <ArrowDownToLine className="w-3.5 h-3.5 mr-1.5" />
                Receive Back
              </Button>
            </Link>
          )}
          {user?.role === "admin" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" data-testid="delete-device-button"
                className="w-full sm:w-auto rounded-sm border-red-300 text-red-700 hover:bg-red-50 h-10">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-sm">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this device?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently remove the device and its movement history.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-sm">Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} data-testid="confirm-delete-button"
                    className="rounded-sm bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={openPrintSheet}
            className="w-full sm:w-auto rounded-sm border-zinc-300 h-10"
          >
            <Printer className="w-3.5 h-3.5 mr-1.5" />
            Job Sheet
          </Button>
        </div>
      </div>

      {/* QR / print card */}
      <div className="border border-zinc-200 mb-6 md:mb-8 bg-white">
        <div className="px-4 md:px-5 py-3 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between gap-3">
          <span className="kpi-label flex items-center gap-2"><QrCode className="w-3 h-3" />QR Job Sheet</span>
          <a
            href={`/job/${device.device_id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-950"
          >
            Open <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <div className="p-4 md:p-5 grid grid-cols-1 md:grid-cols-[160px_1fr] gap-5">
          {device.qr_code
            ? <div className="w-36 h-36 border border-zinc-200 p-2 bg-white mx-auto md:mx-0 [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: device.qr_code }} />
            : <div className="w-36 h-36 border border-zinc-200 p-3 bg-zinc-50 mx-auto md:mx-0 flex items-center justify-center text-center">
                <span className="text-xs text-zinc-400 leading-relaxed">QR available<br/>when device<br/>is in repair</span>
              </div>
          }
          <div className="min-w-0 space-y-3">
            <div>
              <div className="kpi-label">Scan Link</div>
              <a
                href={publicJobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block text-sm font-mono break-all text-blue-700 hover:text-blue-900 hover:underline"
              >
                {publicJobUrl}
              </a>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <div className="kpi-label">Job ID</div>
                <div className="font-semibold mt-1">{device.job_number || "—"}</div>
              </div>
              <div>
                <div className="kpi-label">Customer</div>
                <div className="font-semibold mt-1">{device.customer_name || "—"}</div>
              </div>
            </div>
            <Button
              type="button"
              onClick={openPrintSheet}
              className="rounded-sm bg-zinc-950 hover:bg-zinc-800 h-10"
            >
              <Printer className="w-3.5 h-3.5 mr-1.5" />
              Open Job Sheet
            </Button>
          </div>
        </div>
      </div>

      {/* Customer card */}
      <div className="border border-zinc-200 mb-6 md:mb-8 bg-white">
        <div className="px-4 md:px-5 py-3 border-b border-zinc-200 bg-zinc-50">
          <span className="kpi-label flex items-center gap-2"><User className="w-3 h-3" />Customer</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3">
          <div className="p-4 md:p-5 md:border-r border-b md:border-b-0 border-zinc-200">
            <div className="kpi-label">Name</div>
            <div className="text-sm font-semibold mt-1.5 break-words">{device.customer_name || "—"}</div>
          </div>
          <div className="p-4 md:p-5 md:border-r border-b md:border-b-0 border-zinc-200">
            <div className="kpi-label flex items-center gap-1"><Phone className="w-3 h-3" />Phone</div>
            <a
              href={device.customer_phone ? `tel:${device.customer_phone}` : undefined}
              className="text-sm font-mono font-semibold mt-1.5 block hover:text-zinc-950"
            >
              {device.customer_phone || "—"}
            </a>
          </div>
          <div className="p-4 md:p-5">
            <div className="kpi-label flex items-center gap-1"><Mail className="w-3 h-3" />Email</div>
            <div className="text-sm mt-1.5 break-all">{device.customer_email || "—"}</div>
          </div>
        </div>
      </div>

      {/* Properties grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 border border-zinc-200 mb-6 md:mb-8 bg-white">
        {[
          ["Inward Date", formatDate(device.inward_date || device.created_at)],
          ["Outward Date", formatDate(device.outward_date)],
          ["Expected Return", device.expected_return_date ? new Date(device.expected_return_date).toLocaleDateString() : "—"],
          ["Picked Up By", device.picked_up_by_name ? (
            <div>
              <div className="font-medium">{device.picked_up_by_name}</div>
              <div className="text-xs text-zinc-500 font-mono">{device.picked_up_by_phone}</div>
              {device.pickup_relationship === "delegate" && (
                <div className="text-[10px] uppercase tracking-wider text-amber-700 mt-0.5">Delegate</div>
              )}
            </div>
          ) : "—"],
        ].map(([k, v], i) => (
          <div key={k} className={`p-4 border-b sm:border-b-0 ${i % 2 === 0 ? "sm:border-r" : "md:border-r"} ${i < 2 ? "md:border-b-0" : ""} border-zinc-200 ${i === 3 ? "md:border-r-0 border-b-0" : ""}`}>
            <div className="kpi-label">{k}</div>
            <div className="text-sm font-medium mt-1.5 break-words">{v}</div>
          </div>
        ))}
      </div>

      {/* Issue */}
      <div className="border border-zinc-200 mb-6 md:mb-8 bg-white">
        <div className="px-4 md:px-5 py-3 border-b border-zinc-200 bg-zinc-50">
          <span className="kpi-label">Issue / Repair Notes</span>
        </div>
        <div className="p-4 md:p-5 space-y-3">
          {device.issue_categories?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {device.issue_categories.map(cat => (
                <span key={cat} className="px-2.5 py-1 text-xs rounded-sm bg-zinc-100 border border-zinc-200 font-medium">
                  {cat}
                </span>
              ))}
            </div>
          )}
          {device.issue_description && (
            <p className="text-sm whitespace-pre-wrap text-zinc-700">{device.issue_description}</p>
          )}
          {!device.issue_categories?.length && !device.issue_description && (
            <p className="text-sm text-zinc-400">—</p>
          )}
        </div>
      </div>

      {/* Repair status */}
      {true && (
        <div className="border border-zinc-200 mb-6 md:mb-8 bg-white">
          <div className="px-4 md:px-5 py-3 border-b border-zinc-200 bg-zinc-50 flex items-center gap-2">
            <CheckCircle2 className="w-3 h-3" />
            <span className="kpi-label">Repair Status</span>
          </div>
          <div className="p-4 md:p-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { value: "not_started", label: "Not Started", color: "text-zinc-500 border-zinc-300 bg-zinc-50" },
                { value: "in_progress", label: "In Progress", color: "text-amber-700 border-amber-300 bg-amber-50" },
                { value: "completed", label: "Completed", color: "text-blue-700 border-blue-300 bg-blue-50" },
                { value: "delivered", label: "Delivered", color: "text-green-700 border-green-300 bg-green-50" },
              ].map(s => (
                <button key={s.value} type="button"
                  onClick={() => handleRepairStatus(s.value)}
                  className={`px-3 py-2.5 text-xs font-semibold rounded-sm border transition-colors ${
                    (device.repair_status || "not_started") === s.value
                      ? `ring-2 ring-offset-1 ring-zinc-950 ${s.color}`
                      : `border-zinc-200 text-zinc-500 hover:border-zinc-400 bg-white`
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Movement history */}
      <div className="border border-zinc-200 bg-white">
        <div className="px-4 md:px-5 py-3 border-b border-zinc-200 bg-zinc-50">
          <span className="kpi-label">Timeline</span>
          <h3 className="font-heading text-base font-semibold mt-0.5">Movement History</h3>
        </div>
        {movements.length === 0 ? (
          <div className="p-8 text-sm text-zinc-500 text-center">No movements yet</div>
        ) : (
          <ul className="divide-y divide-zinc-200" data-testid="movements-timeline">
            {movements.map((m) => (
              <li key={m.movement_id} className="px-4 md:px-5 py-4 flex items-start gap-3 hover:bg-zinc-50 transition-colors">
                <div className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-sm ${
                  m.movement_type === "outward" ? "bg-zinc-100 text-zinc-700" : "bg-blue-50 text-blue-700"
                }`}>
                  {m.movement_type === "outward"
                    ? <ArrowUpFromLine className="w-4 h-4" />
                    : <ArrowDownToLine className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">{m.movement_type}</span>
                    <span className="text-xs text-zinc-500 font-mono">{formatDate(m.created_at)}</span>
                  </div>
                  {m.movement_type === "outward" && m.picked_up_by_name && (
                    <div className="text-sm font-medium mt-1">
                      <span>{m.picked_up_by_name}</span>{" "}
                      <span className="text-xs font-mono text-zinc-500 break-all">({m.picked_up_by_phone})</span>
                      {m.pickup_relationship === "delegate" && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-700">Delegate</span>
                      )}
                    </div>
                  )}
                  {m.movement_type === "inward" && m.customer_name && (
                    <div className="text-sm mt-1">{m.customer_name} · <span className="font-mono text-xs">{m.customer_phone}</span></div>
                  )}
                  {m.issue_description && <div className="text-xs text-zinc-600 mt-1">{m.issue_description}</div>}
                  {m.remarks && <div className="text-xs text-zinc-500 mt-1 italic">"{m.remarks}"</div>}
                  <div className="text-xs text-zinc-400 mt-1">by {m.performed_by_name || "—"}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
