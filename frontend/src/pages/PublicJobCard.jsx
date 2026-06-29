import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, publicFileUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, Calendar, Tag, Info, Phone, Mail, Monitor } from "lucide-react";

function fmt(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
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

  const handlePrint = () => window.print();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
              <div className="text-center max-w-sm">
          <h1 className="font-heading text-xl font-bold mb-2">{error}</h1>
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
          .print-only { display: block !important; }
          .job-card { max-width: 190mm !important; margin: 0 auto; padding: 8mm; box-shadow: none !important; border: 0 !important; }
        }
        .print-only { display: none; }
      `}</style>

      <div className="min-h-screen bg-zinc-50 p-4 md:p-8">
        <div className="max-w-3xl mx-auto">
          {/* Print button */}
          <div className="no-print mb-4 flex justify-end">
            <Button onClick={handlePrint} variant="outline" className="rounded-sm border-zinc-300 h-10">
              <Printer className="w-4 h-4 mr-2" /> Print Job Card
            </Button>
          </div>

          {/* Job card */}
          <div className="job-card bg-white border border-zinc-200 shadow-sm">
            {/* Header */}
            <div className="border-b border-zinc-200 pb-5 mb-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 bg-zinc-950 flex items-center justify-center text-white text-xs font-bold">
                  KC
                  </div>
                  <div>
                    <div className="font-heading text-xs font-bold tracking-tight">KRISH COMPUTER</div>
                    <div className="text-[8px] text-zinc-500 uppercase tracking-wider">Repair Job Sheet</div>
                  </div>
                </div>
                <div className="font-heading text-3xl font-bold">{device.job_number}</div>
                <div className="text-xs text-zinc-500 mt-0.5">Device ID: {device.device_id}</div>
              </div>
              <div className="w-32 h-32 border border-zinc-200 p-2 bg-white" dangerouslySetInnerHTML={{ __html: device.qr_code }} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
              {/* Customer */}
              <section className="border border-zinc-200">
                <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50">
                  <div className="kpi-label">Customer</div>
                </div>
                <div className="p-4 space-y-2">
                  <div className="font-semibold text-sm">{device.customer_name || "—"}</div>
                  {device.customer_phone && (
                    <div className="flex items-center gap-1.5 text-xs text-zinc-600">
                      <Phone className="w-3 h-3" /> {device.customer_phone}
                    </div>
                  )}
                  {device.customer_email && (
                    <div className="flex items-center gap-1.5 text-xs text-zinc-600 break-all">
                      <Mail className="w-3 h-3" /> {device.customer_email}
                    </div>
                  )}
                </div>
              </section>

              {/* Device info */}
              <section className="border border-zinc-200">
                <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50">
                  <div className="kpi-label flex items-center gap-2"><Monitor className="w-3 h-3" />Device</div>
                </div>
                <div className="p-4 space-y-2">
                  <div className="font-semibold text-sm">{device.brand} {device.model}</div>
                  <div className="text-xs text-zinc-500">{device.device_type} · {device.category}</div>
                  {device.serial_number && (
                    <div className="text-xs text-zinc-500">S/N: {device.serial_number}</div>
                  )}
                  {device.condition && (
                    <div className="text-xs text-zinc-500">Condition: {device.condition}</div>
                  )}
                </div>
              </section>
            </div>

            {/* Status */}
            <div className="mb-4 pb-4 border-b border-zinc-100">
              <div className="kpi-label mb-2">Status</div>
              <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-sm ${
                device.status === "in_stock" ? "bg-green-50 text-green-700" :
                device.status === "in_repair" ? "bg-amber-50 text-amber-700" :
                device.status === "ready" ? "bg-blue-50 text-blue-700" :
                device.status === "issued" ? "bg-zinc-100 text-zinc-700" : "bg-zinc-50 text-zinc-500"
              }`}>
                {device.status.replace("_", " ").toUpperCase()}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-zinc-500 mt-2">
                <Calendar className="w-3 h-3" />
                Inward: {fmt(device.inward_date)}
              </div>
            </div>

            {/* Issues */}
            {(device.issue_categories?.length > 0 || device.issue_description) && (
              <div className="mb-4 pb-4 border-b border-zinc-100">
                <div className="kpi-label mb-2">Issues Reported</div>
                {device.issue_categories?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {device.issue_categories.map(cat => (
                      <div key={cat} className="inline-flex items-center gap-1 bg-zinc-100 text-zinc-700 text-xs px-2 py-0.5 rounded-sm">
                        <Tag className="w-2.5 h-2.5" /> {cat}
                      </div>
                    ))}
                  </div>
                )}
                {device.issue_description && (
                  <div className="text-xs text-zinc-600 leading-relaxed">{device.issue_description}</div>
                )}
              </div>
            )}

            {/* Condition */}
            {device.condition && (
              <div className="mb-4 pb-4 border-b border-zinc-100">
                <div className="kpi-label mb-2">Condition on Arrival</div>
                <div className="text-xs text-zinc-600 leading-relaxed">{device.condition}</div>
              </div>
            )}

            {/* Photos */}
            {device.photos?.length > 0 && (
              <div className="mb-4 pb-4 border-b border-zinc-100 no-print">
                <div className="kpi-label mb-2">Photos</div>
                <div className="grid grid-cols-2 gap-2">
                  {device.photos.map((p, i) => (
                    <img key={i} src={publicFileUrl(p)}
                      alt={`Device ${i+1}`} className="w-full aspect-square object-cover border border-zinc-200 rounded-sm" />
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 flex items-start gap-2 text-xs text-zinc-500">
              <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              Scan the QR code to reopen this job sheet with current repair status and job details.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
