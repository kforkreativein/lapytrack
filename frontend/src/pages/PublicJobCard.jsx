import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, Calendar, Tag, Phone, Mail, Monitor } from "lucide-react";

function fmt(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit", month: "long", year: "numeric",
    });
  } catch { return iso; }
}

function StatusPill({ status }) {
  const styles = {
    in_repair: "bg-amber-50 text-amber-700 border-amber-200",
    in_stock:  "bg-green-50 text-green-700 border-green-200",
    issued:    "bg-zinc-100 text-zinc-600 border-zinc-200",
    ready:     "bg-blue-50 text-blue-700 border-blue-200",
  };
  const labels = {
    in_repair: "In Repair",
    in_stock:  "In Stock",
    issued:    "Issued / Returned",
    ready:     "Ready for Pickup",
  };
  const cls = styles[status] || "bg-zinc-50 text-zinc-500 border-zinc-200";
  const label = labels[status] || (status || "").replace(/_/g, " ").toUpperCase();
  return (
    <span className={`inline-block border text-sm font-semibold px-4 py-1.5 rounded-full ${cls}`}>
      {label}
    </span>
  );
}

export default function PublicJobCard() {
  const { id } = useParams();
  const [device, setDevice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/public/job/${id}`);
        setDevice(data);
      } catch (err) {
        setError(err.response?.status === 404 ? "Job card not found" : "Failed to load");
      } finally { setLoading(false); }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
        <div className="text-center max-w-xs">
          <div className="w-14 h-14 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Monitor className="w-6 h-6 text-zinc-400" />
          </div>
          <h1 className="font-heading text-xl font-bold text-zinc-950 mb-2">{error}</h1>
          <p className="text-sm text-zinc-500">This QR code may be invalid or the device was removed.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media print {
          body { margin: 0; background: white; }
          .no-print { display: none !important; }
          .job-card { max-width: 190mm !important; margin: 0 auto !important;
                      padding: 8mm !important; box-shadow: none !important;
                      border: 1px solid #e4e4e7 !important; border-radius: 0 !important; }
        }
      `}</style>

      <div className="min-h-screen bg-zinc-100">

        {/* Sticky top bar (screen only) */}
        <div className="no-print sticky top-0 z-10 bg-white border-b border-zinc-200 px-4 py-3 flex items-center justify-between">
          <span className="font-heading font-bold text-sm tracking-tight text-zinc-950">
            {device.job_number}
          </span>
          <Button onClick={() => window.print()} variant="outline" size="sm"
            className="rounded-sm border-zinc-300 h-9 text-xs">
            <Printer className="w-3.5 h-3.5 mr-1.5" /> Print
          </Button>
        </div>

        <div className="max-w-xl mx-auto px-4 py-6 md:py-10">
          <div className="job-card bg-white border border-zinc-200 shadow-sm rounded-xl overflow-hidden">

            {/* ── Dark header ─────────────────────────────────────── */}
            <div className="bg-zinc-950 text-white px-6 py-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center
                                text-white font-black text-sm tracking-tight flex-shrink-0">
                  KC
                </div>
                <div>
                  <div className="font-heading font-bold text-base tracking-tight leading-tight">
                    KRISH COMPUTER
                  </div>
                  <div className="text-[10px] text-zinc-400 uppercase tracking-widest leading-tight">
                    Life Services · Repair Job Sheet
                  </div>
                </div>
              </div>
              <div className="font-heading text-4xl md:text-5xl font-black tracking-tight leading-none">
                {device.job_number}
              </div>
              <div className="text-xs text-zinc-400 mt-2 font-mono">
                ID: {device.device_id}
              </div>
            </div>

            {/* ── Status strip ────────────────────────────────────── */}
            <div className="px-6 py-4 border-b border-zinc-100 flex flex-wrap items-center gap-3">
              <StatusPill status={device.status} />
              <div className="flex items-center gap-1.5 text-sm text-zinc-500">
                <Calendar className="w-4 h-4 flex-shrink-0" />
                Inward: {fmt(device.inward_date)}
              </div>
              {device.outward_date && (
                <div className="flex items-center gap-1.5 text-sm text-zinc-500">
                  <Calendar className="w-4 h-4 flex-shrink-0" />
                  Outward: {fmt(device.outward_date)}
                </div>
              )}
            </div>

            {/* ── Customer ────────────────────────────────────────── */}
            <div className="px-6 py-5 border-b border-zinc-100">
              <div className="text-[10px] uppercase tracking-widest font-semibold text-zinc-400 mb-3">
                Customer
              </div>
              <div className="font-heading text-2xl font-bold text-zinc-950 mb-3">
                {device.customer_name || "—"}
              </div>
              <div className="space-y-2">
                {device.customer_phone && (
                  <a href={`tel:${device.customer_phone}`}
                    className="flex items-center gap-2.5 text-base text-zinc-700 hover:text-zinc-950 transition-colors">
                    <Phone className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                    {device.customer_phone}
                  </a>
                )}
                {device.customer_email && (
                  <div className="flex items-center gap-2.5 text-sm text-zinc-500 break-all">
                    <Mail className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                    {device.customer_email}
                  </div>
                )}
              </div>
            </div>

            {/* ── Device ──────────────────────────────────────────── */}
            <div className="px-6 py-5 border-b border-zinc-100">
              <div className="text-[10px] uppercase tracking-widest font-semibold text-zinc-400 mb-3 flex items-center gap-1.5">
                <Monitor className="w-3 h-3" /> Device
              </div>
              <div className="font-heading text-xl font-bold text-zinc-950 mb-1">
                {device.brand} {device.model}
              </div>
              <div className="text-sm text-zinc-500">
                {device.device_type} · {device.category}
              </div>
              {device.serial_number && (
                <div className="text-sm text-zinc-400 font-mono mt-1">S/N: {device.serial_number}</div>
              )}
              {device.condition && (
                <div className="mt-2 inline-block text-xs bg-zinc-100 text-zinc-600 px-2.5 py-1 rounded-full">
                  Condition on arrival: {device.condition}
                </div>
              )}
            </div>

            {/* ── Issues ──────────────────────────────────────────── */}
            {(device.issue_categories?.length > 0 || device.issue_description) && (
              <div className="px-6 py-5 border-b border-zinc-100">
                <div className="text-[10px] uppercase tracking-widest font-semibold text-zinc-400 mb-3">
                  Issues Reported
                </div>
                {device.issue_categories?.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {device.issue_categories.map(cat => (
                      <span key={cat}
                        className="inline-flex items-center gap-1.5 bg-zinc-100 text-zinc-700
                                   text-sm font-medium px-3 py-1.5 rounded-full">
                        <Tag className="w-3 h-3" /> {cat}
                      </span>
                    ))}
                  </div>
                )}
                {device.issue_description && (
                  <p className="text-sm text-zinc-600 leading-relaxed">{device.issue_description}</p>
                )}
              </div>
            )}

            {/* ── QR Code section ─────────────────────────────────── */}
            {device.qr_code ? (
              <div className="px-6 py-6 bg-zinc-50 border-t border-zinc-100">
                <div className="flex flex-col sm:flex-row items-center gap-5">
                  <div className="w-36 h-36 md:w-44 md:h-44 bg-white border border-zinc-200
                                  rounded-xl p-2.5 shadow-sm flex-shrink-0"
                    dangerouslySetInnerHTML={{ __html: device.qr_code }} />
                  <div className="text-center sm:text-left">
                    <div className="font-heading font-bold text-base text-zinc-950 mb-1">
                      Scan to check live status
                    </div>
	                    <p className="text-sm text-zinc-500 leading-relaxed">
	                      Share this QR with the customer. Scanning it opens this job sheet with the current repair status.
	                    </p>
	                  </div>
                </div>
              </div>
            ) : (
              <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100">
                <p className="text-xs text-zinc-400 text-center">
                  QR code available when device is active in the workshop.
                </p>
              </div>
            )}

            {/* ── Footer ──────────────────────────────────────────── */}
            <div className="px-6 py-4 border-t border-zinc-100 text-center">
              <p className="text-xs text-zinc-400">
                Krish Computer Life Services · {device.job_number}
              </p>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
